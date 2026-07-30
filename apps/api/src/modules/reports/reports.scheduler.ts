import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationType, SystemRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../telegram/notifications.service';
import { ReportsService } from './reports.service';
import { dayjs, weekRange, dateKey } from '../../common/utils/dates';
import type { AuthUser } from '../../common/auth/auth.types';

/**
 * Haftalik xulosa — har dushanba ertalab rahbarlarga botga yuboriladi.
 * Panelga kirmasdan ham asosiy ko'rsatkichlar ko'rinadi.
 */
@Injectable()
export class ReportsScheduler {
  private readonly logger = new Logger(ReportsScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly reports: ReportsService,
  ) {}

  @Cron('0 9 * * 1', { timeZone: process.env.TZ || 'Asia/Tashkent' })
  async weeklyDigest() {
    try {
      const lastWeek = dayjs().subtract(1, 'week').toDate();
      const { start, end } = weekRange(lastWeek);

      const recipients = await this.prisma.user.findMany({
        where: {
          status: 'ACTIVE',
          telegramId: { not: null },
          botBlocked: false,
          roles: { hasSome: [SystemRole.ADMIN, SystemRole.VIEWER, SystemRole.DEPT_HEAD] },
        },
        select: {
          id: true,
          fullName: true,
          roles: true,
          departmentId: true,
          headOf: { select: { departmentId: true } },
        },
      });

      for (const user of recipients) {
        const actor: AuthUser = {
          id: user.id,
          fullName: user.fullName,
          roles: user.roles,
          departmentId: user.departmentId,
          headOfDepartmentIds: user.headOf.map((h) => h.departmentId),
          source: 'panel',
        };

        const report = await this.reports.build(
          actor,
          start,
          end,
          `${dateKey(start)} — ${dateKey(end)}`,
        );

        if (!report.overall.workdayRecords) continue;

        const problemDepartments = report.departments
          .filter((d) => d.issues.length)
          .slice(0, 6)
          .map((d) => `• <b>${d.name}</b>: ${d.issues.join(', ')}`);

        const body = [
          `Davr: ${report.period.from} — ${report.period.to}`,
          '',
          '<b>Davomat</b>',
          `Vaqtida: ${report.overall.onTime} | Kechikish: ${report.overall.late} | Belgilanmagan: ${report.overall.missed}`,
          `Ko'rsatkich: <b>${report.overall.attendanceRate}%</b>`,
          '',
          "<b>Bo'limlararo so'rovlar</b>",
          `Keldi: ${report.tasks.created} | Bajarildi: ${report.tasks.completed} | Kechikkan: ${report.tasks.overdue} | Javobsiz: ${report.tasks.noResponse}`,
          '',
          report.evaluations.average !== null
            ? `<b>O'rtacha baho:</b> ${report.evaluations.average} (${report.evaluations.count} ta)`
            : '',
          problemDepartments.length ? '\n<b>⚠️ E\'tibor talab qiladi</b>' : '',
          ...problemDepartments,
        ]
          .filter(Boolean)
          .join('\n');

        await this.notifications.notify({
          userId: user.id,
          type: NotificationType.WEEKLY_DIGEST,
          title: '📊 Haftalik xulosa',
          body,
          payload: { from: report.period.from, to: report.period.to },
        });
      }

      this.logger.log(`Haftalik xulosa ${recipients.length} rahbarga yuborildi`);
    } catch (error) {
      this.logger.error(`Haftalik xulosa xatosi: ${(error as Error).message}`);
    }
  }
}
