import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SystemRole } from '@prisma/client';
import { ReportsService } from './reports.service';
import { ReportsExportService } from './reports.export';
import { Roles, CurrentUser } from '../../common/auth/decorators';
import { monthRange, weekRange, uzMonthName, dateKey } from '../../common/utils/dates';
import type { AuthUser } from '../../common/auth/auth.types';

@Controller('reports')
@Roles(SystemRole.ADMIN, SystemRole.DEPT_HEAD, SystemRole.APPROVER, SystemRole.VIEWER)
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly exporter: ReportsExportService,
  ) {}

  @Get('weekly')
  weekly(@CurrentUser() user: AuthUser, @Query('date') date?: string) {
    return this.reports.weekly(user, date);
  }

  @Get('monthly')
  monthly(
    @CurrentUser() user: AuthUser,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const now = new Date();
    return this.reports.monthly(
      user,
      year ? Number(year) : now.getFullYear(),
      month ? Number(month) : now.getMonth() + 1,
    );
  }

  @Get('attendance-sheet')
  attendanceSheet(
    @CurrentUser() user: AuthUser,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    const now = new Date();
    return this.reports.attendanceSheet(
      user,
      year ? Number(year) : now.getFullYear(),
      month ? Number(month) : now.getMonth() + 1,
      departmentId,
    );
  }

  // ---------- Excel eksport ----------

  @Get('export/attendance-sheet')
  async exportSheet(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('departmentId') departmentId?: string,
  ) {
    const now = new Date();
    const y = year ? Number(year) : now.getFullYear();
    const m = month ? Number(month) : now.getMonth() + 1;

    const buffer = await this.exporter.attendanceSheet(user, y, m, departmentId);
    this.sendExcel(res, buffer, `davomat-${y}-${String(m).padStart(2, '0')}.xlsx`);
  }

  @Get('export/monthly')
  async exportMonthly(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query('year') year?: string,
    @Query('month') month?: string,
  ) {
    const now = new Date();
    const y = year ? Number(year) : now.getFullYear();
    const m = month ? Number(month) : now.getMonth() + 1;
    const { start, end } = monthRange(y, m);

    const buffer = await this.exporter.periodReport(user, start, end, `${uzMonthName(m)} ${y}`);
    this.sendExcel(res, buffer, `hisobot-${y}-${String(m).padStart(2, '0')}.xlsx`);
  }

  @Get('export/weekly')
  async exportWeekly(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query('date') date?: string,
  ) {
    const { start, end } = weekRange(date ? new Date(date) : new Date());
    const buffer = await this.exporter.periodReport(
      user,
      start,
      end,
      `${dateKey(start)} — ${dateKey(end)}`,
    );
    this.sendExcel(res, buffer, `haftalik-${dateKey(start)}.xlsx`);
  }

  private sendExcel(res: Response, buffer: Buffer, fileName: string) {
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': String(buffer.length),
    });
    res.end(buffer);
  }
}
