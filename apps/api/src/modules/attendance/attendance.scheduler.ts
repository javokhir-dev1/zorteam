import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AttendanceStatus, NotificationType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { NotificationsService } from '../telegram/notifications.service';
import { SchedulesService } from '../schedules/schedules.service';
import { AttendanceService } from './attendance.service';
import { dayjs, fmtTime, dateKey } from '../../common/utils/dates';

/**
 * Davomat bo'yicha avtomatik jarayonlar:
 *
 *   00:05  — kunlik yozuvlarni tayyorlash
 *   har daqiqa — ish vaqti kelganlarga xabar yuborish
 *   har daqiqa — belgilanmaganlarga eslatma
 *   har daqiqa — oyna yopilgach "belgilanmadi" deb yozish
 *   har 5 daqiqa — rahbarlarga belgilanmaganlar ro'yxati
 */
@Injectable()
export class AttendanceScheduler {
  private readonly logger = new Logger(AttendanceScheduler.name);
  private busy = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
    private readonly telegram: TelegramService,
    private readonly notifications: NotificationsService,
    private readonly schedules: SchedulesService,
  ) {}

  /** Har kuni 00:05 da bugungi kun uchun yozuvlarni tayyorlaymiz */
  @Cron('5 0 * * *', { timeZone: process.env.TZ || 'Asia/Tashkent' })
  async prepareDay() {
    await this.guard('prepareDay', async () => {
      await this.attendance.ensureDayRecords(new Date());
    });
  }

  /** Ish vaqti boshlanganlarga birinchi xabar */
  @Cron(CronExpression.EVERY_MINUTE)
  async sendPrompts() {
    await this.guard('sendPrompts', async () => {
      if (!this.telegram.isEnabled) return;

      const now = new Date();
      const due = await this.prisma.attendance.findMany({
        where: {
          status: AttendanceStatus.PENDING,
          checkInAt: null,
          promptSentAt: null,
          expectedStartAt: { lte: now },
          windowClosesAt: { gt: now },
          user: { telegramId: { not: null }, botBlocked: false },
        },
        include: { user: { select: { id: true, fullName: true } } },
        take: 200,
      });

      for (const record of due) {
        const keyboard = this.telegram.miniAppKeyboard('📍 Belgilanish');

        const body = [
          `Assalomu alaykum, <b>${record.user.fullName}</b>!`,
          '',
          `Ish vaqtingiz boshlandi (${fmtTime(record.expectedStartAt)}).`,
          keyboard
            ? 'Belgilanish uchun quyidagi tugmani bosing — kamera ochiladi.'
            : 'Belgilanish uchun /zaxira buyrug\'ini yuboring.',
          '',
          `⏳ Oyna ${fmtTime(record.windowClosesAt)} da yopiladi.`,
        ].join('\n');

        await this.notifications.notify({
          userId: record.user.id,
          type: NotificationType.ATTENDANCE_PROMPT,
          title: '⏰ Ish vaqti boshlandi',
          body,
          payload: { attendanceId: record.id },
          extra: keyboard ? { reply_markup: keyboard } : undefined,
        });

        await this.prisma.attendance.update({
          where: { id: record.id },
          data: { promptSentAt: new Date() },
        });
      }

      if (due.length) this.logger.log(`${due.length} ta hodimga belgilanish xabari yuborildi`);
    });
  }

  /** Belgilanmaganlarga eslatma (grafikdagi reminderMinutes bo'yicha) */
  @Cron(CronExpression.EVERY_MINUTE)
  async sendReminders() {
    await this.guard('sendReminders', async () => {
      if (!this.telegram.isEnabled) return;

      const now = new Date();
      const pending = await this.prisma.attendance.findMany({
        where: {
          status: AttendanceStatus.PENDING,
          checkInAt: null,
          promptSentAt: { not: null },
          reminderSentAt: null,
          windowClosesAt: { gt: now },
          user: { telegramId: { not: null }, botBlocked: false },
        },
        include: { user: { select: { id: true, fullName: true } } },
        take: 200,
      });

      for (const record of pending) {
        const schedule = await this.schedules.effectiveScheduleFor(record.userId);
        const reminderAt = dayjs(record.expectedStartAt)
          .add(schedule?.reminderMinutes ?? 10, 'minute')
          .toDate();

        if (reminderAt > now) continue;

        const minutesLeft = Math.max(
          0,
          Math.round((record.windowClosesAt.getTime() - now.getTime()) / 60000),
        );

        await this.notifications.notify({
          userId: record.user.id,
          type: NotificationType.ATTENDANCE_REMINDER,
          title: '⚠️ Hali belgilanmadingiz',
          body: [
            `Belgilanish oynasi yopilishiga <b>${minutesLeft} daqiqa</b> qoldi.`,
            '',
            'Belgilanmasangiz kun "belgilanmadi" deb yoziladi.',
            this.telegram.miniAppFallbackNote,
          ].join('\n'),
          payload: { attendanceId: record.id },
          extra: (() => {
            const keyboard = this.telegram.miniAppKeyboard('📍 Belgilanish');
            return keyboard ? { reply_markup: keyboard } : undefined;
          })(),
        });

        await this.prisma.attendance.update({
          where: { id: record.id },
          data: { reminderSentAt: new Date() },
        });
      }
    });
  }

  /** Oyna yopilgach belgilanmaganlarni MISSED qilish */
  @Cron(CronExpression.EVERY_MINUTE)
  async closeWindows() {
    await this.guard('closeWindows', async () => {
      const now = new Date();

      const expired = await this.prisma.attendance.findMany({
        where: {
          status: AttendanceStatus.PENDING,
          checkInAt: null,
          windowClosesAt: { lte: now },
        },
        select: { id: true, userId: true },
        take: 500,
      });

      if (!expired.length) return;

      await this.prisma.attendance.updateMany({
        where: { id: { in: expired.map((e) => e.id) } },
        data: { status: AttendanceStatus.MISSED },
      });

      this.logger.log(`${expired.length} ta hodim belgilanmadi deb yozildi`);
    });
  }

  /**
   * Rahbarlarga belgilanmaganlar ro'yxati.
   * Kuniga bir marta, oyna yopilgandan keyin yuboriladi.
   */
  @Cron('*/5 * * * *', { timeZone: process.env.TZ || 'Asia/Tashkent' })
  async reportToHeads() {
    await this.guard('reportToHeads', async () => {
      if (!this.telegram.isEnabled) return;

      const today = dateKey();
      const settingKey = `attendance.headReport.${today}`;

      const already = await this.prisma.setting.findUnique({ where: { key: settingKey } });
      const notifiedDeptIds = new Set<string>((already?.value as string[]) ?? []);

      const now = new Date();
      const missed = await this.prisma.attendance.findMany({
        where: {
          date: { gte: new Date(`${today}T00:00:00.000Z`) },
          status: AttendanceStatus.MISSED,
          windowClosesAt: { lte: now },
        },
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              position: true,
              departmentId: true,
              department: { select: { id: true, name: true } },
            },
          },
        },
      });

      if (!missed.length) return;

      // Bo'limlar bo'yicha guruhlaymiz
      const byDepartment = new Map<string, { name: string; users: typeof missed }>();
      for (const record of missed) {
        const deptId = record.user.departmentId;
        if (!deptId || notifiedDeptIds.has(deptId)) continue;

        if (!byDepartment.has(deptId)) {
          byDepartment.set(deptId, { name: record.user.department?.name ?? "Bo'limsiz", users: [] });
        }
        byDepartment.get(deptId)!.users.push(record);
      }

      for (const [deptId, group] of byDepartment) {
        // Shu bo'limda hali belgilanish oynasi ochiq hodim bo'lsa kutamiz
        const stillOpen = await this.prisma.attendance.count({
          where: {
            date: { gte: new Date(`${today}T00:00:00.000Z`) },
            status: AttendanceStatus.PENDING,
            windowClosesAt: { gt: now },
            user: { departmentId: deptId },
          },
        });
        if (stillOpen > 0) continue;

        const heads = await this.prisma.departmentHead.findMany({
          where: { departmentId: deptId },
          select: { userId: true },
        });
        if (!heads.length) continue;

        const lines = group.users.map(
          (r, i) => `${i + 1}. <b>${r.user.fullName}</b> — ${r.user.position}`,
        );

        await this.notifications.notifyMany(
          heads.map((h) => h.userId),
          {
            type: NotificationType.ATTENDANCE_MISSED_REPORT,
            title: `📋 ${group.name}: belgilanmaganlar`,
            body: [`Bugun (${today}) belgilanmagan hodimlar:`, '', ...lines].join('\n'),
            payload: { departmentId: deptId, date: today },
          },
        );

        notifiedDeptIds.add(deptId);
      }

      await this.prisma.setting.upsert({
        where: { key: settingKey },
        create: { key: settingKey, value: [...notifiedDeptIds] as any },
        update: { value: [...notifiedDeptIds] as any },
      });
    });
  }

  /** Bir vazifa tugamasdan qayta ishga tushmasligi uchun */
  private async guard(name: string, fn: () => Promise<void>) {
    if (this.busy.has(name)) return;
    this.busy.add(name);
    try {
      await fn();
    } catch (error) {
      this.logger.error(`${name} xatosi: ${(error as Error).message}`);
    } finally {
      this.busy.delete(name);
    }
  }
}
