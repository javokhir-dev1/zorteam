import { Injectable, Logger } from '@nestjs/common';
import {
  AttendanceStatus,
  Prisma,
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccessService } from '../../common/auth/access.service';
import { dayjs, monthRange, weekRange, toDateOnly, dateKey, uzMonthName } from '../../common/utils/dates';
import type { AuthUser } from '../../common/auth/auth.types';

export interface PeriodReport {
  period: { from: string; to: string; label: string };
  overall: {
    employees: number;
    workdayRecords: number;
    onTime: number;
    late: number;
    missed: number;
    excused: number;
    attendanceRate: number;
    avgMinutesLate: number;
    flagged: number;
  };
  departments: DepartmentReport[];
  tasks: {
    created: number;
    completed: number;
    completedOnTime: number;
    overdue: number;
    noResponse: number;
    avgResponseHours: number | null;
  };
  evaluations: {
    count: number;
    average: number | null;
  };
}

export interface DepartmentReport {
  departmentId: string;
  name: string;
  employees: number;
  onTime: number;
  late: number;
  missed: number;
  excused: number;
  attendanceRate: number;
  avgMinutesLate: number;
  tasksReceived: number;
  tasksCompleted: number;
  tasksOverdue: number;
  tasksNoResponse: number;
  deadlineRate: number;
  avgResponseHours: number | null;
  avgEvaluation: number | null;
  issues: string[];
}

/**
 * Haftalik va oylik tahlil.
 *
 * Har bo'lim kesimida: davomat, deadline'ga rioya, so'rovlarga javob berish
 * va o'rtacha baho. "issues" maydonida bo'limning aniq kamchiliklari yoziladi.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async weekly(actor: AuthUser, date?: string): Promise<PeriodReport> {
    const { start, end } = weekRange(date ? new Date(date) : new Date());
    return this.build(actor, start, end, `${dateKey(start)} — ${dateKey(end)} (hafta)`);
  }

  async monthly(actor: AuthUser, year: number, month: number): Promise<PeriodReport> {
    const { start, end } = monthRange(year, month);
    return this.build(actor, start, end, `${uzMonthName(month)} ${year}`);
  }

  async build(actor: AuthUser, from: Date, to: Date, label: string): Promise<PeriodReport> {
    const fromDate = toDateOnly(from);
    const toDate = toDateOnly(to);

    const visible = await this.access.visibleDepartmentIds(actor);
    const departmentFilter: Prisma.DepartmentWhereInput = visible
      ? { id: { in: visible.length ? visible : ['__none__'] } }
      : {};

    const departments = await this.prisma.department.findMany({
      where: { ...departmentFilter, isActive: true },
      select: { id: true, name: true, _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });

    const departmentIds = departments.map((d) => d.id);

    // ---------- Davomat ----------
    const attendances = await this.prisma.attendance.findMany({
      where: {
        date: { gte: fromDate, lte: toDate },
        status: { not: AttendanceStatus.DAY_OFF },
        user: { departmentId: { in: departmentIds } },
      },
      select: {
        status: true,
        minutesLate: true,
        flags: true,
        user: { select: { departmentId: true } },
      },
    });

    // ---------- Bo'limlararo so'rovlar ----------
    const tasks = await this.prisma.taskRequest.findMany({
      where: {
        createdAt: { gte: from, lte: to },
        toDepartmentId: { in: departmentIds },
      },
      select: {
        toDepartmentId: true,
        status: true,
        isOverdue: true,
        noResponseFlagged: true,
        createdAt: true,
        firstResponseAt: true,
        completedAt: true,
        deadlineAt: true,
      },
    });

    // ---------- Baholar ----------
    const evaluations = await this.prisma.evaluation.findMany({
      where: {
        submittedAt: { not: null, gte: from, lte: to },
        targetUserId: { not: null },
        targetUser: { departmentId: { in: departmentIds } },
      },
      select: { overallScore: true, targetUser: { select: { departmentId: true } } },
    });

    // ---------- Bo'lim kesimida yig'ish ----------
    const reports: DepartmentReport[] = departments.map((department) => {
      const deptAttendance = attendances.filter((a) => a.user.departmentId === department.id);
      const deptTasks = tasks.filter((t) => t.toDepartmentId === department.id);
      const deptEvaluations = evaluations.filter(
        (e) => e.targetUser?.departmentId === department.id,
      );

      const onTime = deptAttendance.filter((a) => a.status === AttendanceStatus.ON_TIME).length;
      const late = deptAttendance.filter((a) => a.status === AttendanceStatus.LATE).length;
      const missed = deptAttendance.filter((a) => a.status === AttendanceStatus.MISSED).length;
      const excused = deptAttendance.filter((a) => a.status === AttendanceStatus.EXCUSED).length;
      const expected = onTime + late + missed;

      const lateMinutes = deptAttendance
        .filter((a) => a.status === AttendanceStatus.LATE)
        .reduce((sum, a) => sum + a.minutesLate, 0);

      const completed = deptTasks.filter((t) => t.status === TaskStatus.DONE);
      const completedOnTime = completed.filter(
        (t) => !t.deadlineAt || (t.completedAt && t.completedAt <= t.deadlineAt),
      ).length;
      const overdue = deptTasks.filter((t) => t.isOverdue).length;
      const noResponse = deptTasks.filter((t) => t.noResponseFlagged).length;

      const responded = deptTasks.filter((t) => t.firstResponseAt);
      const avgResponseHours = responded.length
        ? Number(
            (
              responded.reduce(
                (sum, t) => sum + (t.firstResponseAt!.getTime() - t.createdAt.getTime()) / 3_600_000,
                0,
              ) / responded.length
            ).toFixed(1),
          )
        : null;

      const avgEvaluation = deptEvaluations.length
        ? Number(
            (
              deptEvaluations.reduce((sum, e) => sum + e.overallScore, 0) / deptEvaluations.length
            ).toFixed(2),
          )
        : null;

      const attendanceRate = expected ? Math.round(((onTime + late) / expected) * 100) : 100;
      const deadlineRate = completed.length
        ? Math.round((completedOnTime / completed.length) * 100)
        : 100;

      // ---------- Kamchiliklar ----------
      const issues: string[] = [];
      if (attendanceRate < 90 && expected >= 3) {
        issues.push(`Davomat past: ${attendanceRate}%`);
      }
      if (missed > 0) {
        issues.push(`${missed} marta belgilanmagan`);
      }
      if (late >= 3) {
        issues.push(`${late} marta kechikish`);
      }
      if (overdue > 0) {
        issues.push(`${overdue} ta so'rov muddatidan kechikkan`);
      }
      if (noResponse > 0) {
        issues.push(`${noResponse} ta so'rovga umuman javob berilmagan`);
      }
      if (avgResponseHours !== null && avgResponseHours > 12) {
        issues.push(`So'rovlarga javob sekin: o'rtacha ${avgResponseHours} soat`);
      }
      if (avgEvaluation !== null && avgEvaluation < 3.5) {
        issues.push(`O'rtacha baho past: ${avgEvaluation}`);
      }

      return {
        departmentId: department.id,
        name: department.name,
        employees: department._count.users,
        onTime,
        late,
        missed,
        excused,
        attendanceRate,
        avgMinutesLate: late ? Math.round(lateMinutes / late) : 0,
        tasksReceived: deptTasks.length,
        tasksCompleted: completed.length,
        tasksOverdue: overdue,
        tasksNoResponse: noResponse,
        deadlineRate,
        avgResponseHours,
        avgEvaluation,
        issues,
      };
    });

    // ---------- Umumiy ----------
    const onTime = attendances.filter((a) => a.status === AttendanceStatus.ON_TIME).length;
    const late = attendances.filter((a) => a.status === AttendanceStatus.LATE).length;
    const missed = attendances.filter((a) => a.status === AttendanceStatus.MISSED).length;
    const excused = attendances.filter((a) => a.status === AttendanceStatus.EXCUSED).length;
    const expected = onTime + late + missed;

    const lateMinutes = attendances
      .filter((a) => a.status === AttendanceStatus.LATE)
      .reduce((sum, a) => sum + a.minutesLate, 0);

    const completedTasks = tasks.filter((t) => t.status === TaskStatus.DONE);
    const respondedTasks = tasks.filter((t) => t.firstResponseAt);

    return {
      period: { from: dateKey(fromDate), to: dateKey(toDate), label },
      overall: {
        employees: departments.reduce((sum, d) => sum + d._count.users, 0),
        workdayRecords: attendances.length,
        onTime,
        late,
        missed,
        excused,
        attendanceRate: expected ? Math.round(((onTime + late) / expected) * 100) : 100,
        avgMinutesLate: late ? Math.round(lateMinutes / late) : 0,
        flagged: attendances.filter((a) => a.flags.length > 0).length,
      },
      departments: reports,
      tasks: {
        created: tasks.length,
        completed: completedTasks.length,
        completedOnTime: completedTasks.filter(
          (t) => !t.deadlineAt || (t.completedAt && t.completedAt <= t.deadlineAt),
        ).length,
        overdue: tasks.filter((t) => t.isOverdue).length,
        noResponse: tasks.filter((t) => t.noResponseFlagged).length,
        avgResponseHours: respondedTasks.length
          ? Number(
              (
                respondedTasks.reduce(
                  (sum, t) =>
                    sum + (t.firstResponseAt!.getTime() - t.createdAt.getTime()) / 3_600_000,
                  0,
                ) / respondedTasks.length
              ).toFixed(1),
            )
          : null,
      },
      evaluations: {
        count: evaluations.length,
        average: evaluations.length
          ? Number(
              (evaluations.reduce((sum, e) => sum + e.overallScore, 0) / evaluations.length).toFixed(2),
            )
          : null,
      },
    };
  }

  /** Hodim kesimidagi davomat jadvali (oylik tabel) */
  async attendanceSheet(actor: AuthUser, year: number, month: number, departmentId?: string) {
    const { start, end } = monthRange(year, month);

    const visible = await this.access.visibleDepartmentIds(actor);
    const where: Prisma.UserWhereInput = { status: 'ACTIVE' };

    if (departmentId) {
      where.departmentId = departmentId;
    } else if (visible !== null) {
      where.departmentId = { in: visible.length ? visible : ['__none__'] };
    }

    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        position: true,
        department: { select: { id: true, name: true } },
        attendances: {
          where: { date: { gte: toDateOnly(start), lte: toDateOnly(end) } },
          select: { date: true, status: true, minutesLate: true, checkInAt: true },
          orderBy: { date: 'asc' },
        },
      },
      orderBy: { fullName: 'asc' },
    });

    return {
      period: { year, month, label: `${uzMonthName(month)} ${year}` },
      days: this.daysOfMonth(year, month),
      rows: users.map((user) => {
        const byDate = new Map(user.attendances.map((a) => [dateKey(a.date), a]));
        const workdays = user.attendances.filter(
          (a) => a.status !== 'DAY_OFF' && a.status !== 'EXCUSED',
        );
        const onTime = workdays.filter((a) => a.status === 'ON_TIME').length;

        return {
          user: {
            id: user.id,
            fullName: user.fullName,
            position: user.position,
            department: user.department,
          },
          days: this.daysOfMonth(year, month).map((day) => {
            const record = byDate.get(day);
            return {
              date: day,
              status: record?.status ?? null,
              minutesLate: record?.minutesLate ?? 0,
              checkInAt: record?.checkInAt ?? null,
            };
          }),
          summary: {
            workdays: workdays.length,
            onTime,
            late: workdays.filter((a) => a.status === 'LATE').length,
            missed: workdays.filter((a) => a.status === 'MISSED').length,
            excused: user.attendances.filter((a) => a.status === 'EXCUSED').length,
            totalMinutesLate: workdays.reduce((sum, a) => sum + a.minutesLate, 0),
            rate: workdays.length ? Math.round((onTime / workdays.length) * 100) : 0,
          },
        };
      }),
    };
  }

  private daysOfMonth(year: number, month: number): string[] {
    const { start, end } = monthRange(year, month);
    const days: string[] = [];
    let cursor = dayjs(start);
    const last = dayjs(end);

    while (cursor.isBefore(last) || cursor.isSame(last, 'day')) {
      days.push(cursor.format('YYYY-MM-DD'));
      cursor = cursor.add(1, 'day');
    }
    return days;
  }
}
