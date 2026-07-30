import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { ReportsService } from './reports.service';
import type { AuthUser } from '../../common/auth/auth.types';

const STATUS_SHORT: Record<string, string> = {
  ON_TIME: 'V',
  LATE: 'K',
  MISSED: 'X',
  EXCUSED: 'S',
  DAY_OFF: '—',
  PENDING: '?',
};

/**
 * Hisobotlarni Excel ko'rinishida chiqarish.
 * Buxgalteriya va rahbariyat odatda shu ko'rinishda so'raydi.
 */
@Injectable()
export class ReportsExportService {
  constructor(private readonly reports: ReportsService) {}

  /** Oylik tabel: hodimlar × kunlar */
  async attendanceSheet(
    actor: AuthUser,
    year: number,
    month: number,
    departmentId?: string,
  ): Promise<Buffer> {
    const data = await this.reports.attendanceSheet(actor, year, month, departmentId);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Zo'r team boshqaruv tizimi";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(data.period.label);

    // Sarlavha qatori
    const header = ['№', 'Hodim', 'Vazifasi', "Bo'lim"];
    data.days.forEach((day) => header.push(day.slice(-2)));
    header.push('Ish kuni', 'Vaqtida', 'Kechikish', 'Belgilanmagan', 'Sababli', 'Davomat %');

    sheet.addRow([`Davomat tabeli — ${data.period.label}`]);
    sheet.mergeCells(1, 1, 1, header.length);
    sheet.getRow(1).font = { bold: true, size: 14 };
    sheet.getRow(1).alignment = { horizontal: 'center' };

    sheet.addRow([]);
    const headerRow = sheet.addRow(header);
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF5' } };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });

    data.rows.forEach((row, index) => {
      const values: (string | number)[] = [
        index + 1,
        row.user.fullName,
        row.user.position,
        row.user.department?.name ?? '—',
      ];

      row.days.forEach((day) => {
        values.push(day.status ? (STATUS_SHORT[day.status] ?? '') : '');
      });

      values.push(
        row.summary.workdays,
        row.summary.onTime,
        row.summary.late,
        row.summary.missed,
        row.summary.excused,
        `${row.summary.rate}%`,
      );

      const excelRow = sheet.addRow(values);
      excelRow.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'hair' },
          left: { style: 'hair' },
          bottom: { style: 'hair' },
          right: { style: 'hair' },
        };
        if (colNumber > 4) cell.alignment = { horizontal: 'center' };

        // Belgilanmagan kunlarni qizil, kechikishni sariq qilamiz
        if (cell.value === 'X') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD5D5' } };
        } else if (cell.value === 'K') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF0CC' } };
        }
      });
    });

    sheet.getColumn(2).width = 28;
    sheet.getColumn(3).width = 20;
    sheet.getColumn(4).width = 18;
    for (let i = 5; i <= 4 + data.days.length; i++) sheet.getColumn(i).width = 4;

    // Izoh
    sheet.addRow([]);
    sheet.addRow(['Belgilar:', 'V — vaqtida', 'K — kechikdi', 'X — belgilanmadi', 'S — sababli', '— dam olish']);

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /** Bo'limlar kesimidagi davriy hisobot */
  async periodReport(actor: AuthUser, from: Date, to: Date, label: string): Promise<Buffer> {
    const report = await this.reports.build(actor, from, to, label);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Zo'r team boshqaruv tizimi";

    // --- 1-varaq: umumiy ---
    const summary = workbook.addWorksheet('Umumiy');
    summary.addRow([`Hisobot — ${report.period.label}`]).font = { bold: true, size: 14 };
    summary.addRow([`Davr: ${report.period.from} — ${report.period.to}`]);
    summary.addRow([]);

    summary.addRow(['DAVOMAT']).font = { bold: true };
    summary.addRow(['Hodimlar soni', report.overall.employees]);
    summary.addRow(['Vaqtida kelgan', report.overall.onTime]);
    summary.addRow(['Kechikkan', report.overall.late]);
    summary.addRow(['Belgilanmagan', report.overall.missed]);
    summary.addRow(['Sababli', report.overall.excused]);
    summary.addRow(["Davomat ko'rsatkichi", `${report.overall.attendanceRate}%`]);
    summary.addRow(["O'rtacha kechikish (daq)", report.overall.avgMinutesLate]);
    summary.addRow(['Shubhali belgilanishlar', report.overall.flagged]);
    summary.addRow([]);

    summary.addRow(["BO'LIMLARARO SO'ROVLAR"]).font = { bold: true };
    summary.addRow(['Yaratilgan', report.tasks.created]);
    summary.addRow(['Bajarilgan', report.tasks.completed]);
    summary.addRow(['Vaqtida bajarilgan', report.tasks.completedOnTime]);
    summary.addRow(['Muddati o\'tgan', report.tasks.overdue]);
    summary.addRow(['Javobsiz qolgan', report.tasks.noResponse]);
    summary.addRow(["O'rtacha javob vaqti (soat)", report.tasks.avgResponseHours ?? '—']);
    summary.addRow([]);

    summary.addRow(['BAHOLAR']).font = { bold: true };
    summary.addRow(['Qo\'yilgan baholar', report.evaluations.count]);
    summary.addRow(["O'rtacha baho", report.evaluations.average ?? '—']);

    summary.getColumn(1).width = 32;
    summary.getColumn(2).width = 16;

    // --- 2-varaq: bo'limlar ---
    const sheet = workbook.addWorksheet("Bo'limlar");
    const header = [
      "Bo'lim",
      'Hodim',
      'Vaqtida',
      'Kechikish',
      'Belgilanmagan',
      'Davomat %',
      "O'rt. kechikish",
      "So'rov keldi",
      'Bajarildi',
      'Kechikkan',
      'Javobsiz',
      'Deadline %',
      'Javob (soat)',
      "O'rt. baho",
      'Kamchiliklar',
    ];

    const headerRow = sheet.addRow(header);
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EDF5' } };
    });

    for (const department of report.departments) {
      const row = sheet.addRow([
        department.name,
        department.employees,
        department.onTime,
        department.late,
        department.missed,
        department.attendanceRate,
        department.avgMinutesLate,
        department.tasksReceived,
        department.tasksCompleted,
        department.tasksOverdue,
        department.tasksNoResponse,
        department.deadlineRate,
        department.avgResponseHours ?? '—',
        department.avgEvaluation ?? '—',
        department.issues.join('; ') || '—',
      ]);

      if (department.issues.length) {
        row.getCell(15).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFE8E8' },
        };
      }
    }

    sheet.getColumn(1).width = 24;
    sheet.getColumn(15).width = 60;
    for (let i = 2; i <= 14; i++) sheet.getColumn(i).width = 13;

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
