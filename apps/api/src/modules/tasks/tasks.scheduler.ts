import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationType, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../telegram/notifications.service';
import { TasksService } from './tasks.service';
import { fmtDateTime, dayjs } from '../../common/utils/dates';

/**
 * Deadline nazorati:
 *   - muddatga 24 soat qolganda eslatma
 *   - muddat o'tgach kechikish qayd etiladi va rahbarga xabar
 *   - 24 soat javobsiz qolgan so'rovlar "javobsiz" deb belgilanadi
 */
@Injectable()
export class TasksScheduler {
  private readonly logger = new Logger(TasksScheduler.name);
  private busy = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly tasks: TasksService,
  ) {}

  /** Muddat yaqinlashgani haqida eslatma */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async deadlineReminders() {
    await this.guard('deadlineReminders', async () => {
      const soon = dayjs().add(24, 'hour').toDate();

      const items = await this.prisma.taskRequest.findMany({
        where: {
          status: { in: [TaskStatus.ACCEPTED, TaskStatus.IN_PROGRESS] },
          deadlineAt: { not: null, lte: soon, gt: new Date() },
          deadlineReminderSentAt: null,
          assigneeId: { not: null },
        },
        include: { assignee: { select: { id: true } } },
        take: 100,
      });

      for (const task of items) {
        const hoursLeft = Math.max(
          0,
          Math.round((task.deadlineAt!.getTime() - Date.now()) / 3_600_000),
        );

        await this.notifications.notify({
          userId: task.assigneeId!,
          type: NotificationType.TASK_DEADLINE_SOON,
          title: '⏳ Muddat yaqinlashdi',
          body: [
            `<b>#${task.number} — ${task.title}</b>`,
            '',
            `Muddat: ${fmtDateTime(task.deadlineAt)}`,
            `Qolgan vaqt: <b>${hoursLeft} soat</b>`,
          ].join('\n'),
          payload: { taskId: task.id },
        });

        await this.prisma.taskRequest.update({
          where: { id: task.id },
          data: { deadlineReminderSentAt: new Date() },
        });
      }
    });
  }

  /** Muddati o'tganlarni belgilash va xabar berish */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async markOverdue() {
    await this.guard('markOverdue', async () => {
      const now = new Date();

      const items = await this.prisma.taskRequest.findMany({
        where: {
          status: { in: [TaskStatus.NEW, TaskStatus.ACCEPTED, TaskStatus.IN_PROGRESS] },
          deadlineAt: { not: null, lt: now },
        },
        include: {
          toDepartment: { select: { id: true, name: true } },
          fromUser: { select: { id: true } },
        },
        take: 200,
      });

      for (const task of items) {
        const overdueMinutes = Math.round(
          (now.getTime() - task.deadlineAt!.getTime()) / 60000,
        );

        await this.prisma.taskRequest.update({
          where: { id: task.id },
          data: { isOverdue: true, overdueMinutes },
        });

        // Xabarni bir marta yuboramiz
        if (task.overdueNotifiedAt) continue;

        const heads = await this.prisma.departmentHead.findMany({
          where: { departmentId: task.toDepartmentId },
          select: { userId: true },
        });

        const recipients = [
          ...new Set([
            ...(task.assigneeId ? [task.assigneeId] : []),
            ...heads.map((h) => h.userId),
            task.fromUserId,
          ]),
        ];

        await this.notifications.notifyMany(recipients, {
          type: NotificationType.TASK_OVERDUE,
          title: "🔴 Muddat o'tdi",
          body: [
            `<b>#${task.number} — ${task.title}</b>`,
            '',
            `Bo'lim: ${task.toDepartment.name}`,
            `Muddat edi: ${fmtDateTime(task.deadlineAt)}`,
            `Kechikish: <b>${this.tasks.humanDuration(overdueMinutes)}</b>`,
          ].join('\n'),
          payload: { taskId: task.id },
        });

        await this.prisma.taskRequest.update({
          where: { id: task.id },
          data: { overdueNotifiedAt: now },
        });
      }

      if (items.length) this.logger.log(`${items.length} ta so'rov muddati o'tgan`);
    });
  }

  /**
   * 24 soat davomida javob berilmagan so'rovlar.
   * Bu ko'rsatkich oylik tahlilda "bo'lim so'rovlarga javob bermaydi"
   * degan kamchilikni ko'rsatadi.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async flagNoResponse() {
    await this.guard('flagNoResponse', async () => {
      const threshold = dayjs().subtract(24, 'hour').toDate();

      const items = await this.prisma.taskRequest.findMany({
        where: {
          status: TaskStatus.NEW,
          firstResponseAt: null,
          noResponseFlagged: false,
          createdAt: { lt: threshold },
        },
        include: { toDepartment: { select: { id: true, name: true } } },
        take: 100,
      });

      for (const task of items) {
        await this.prisma.taskRequest.update({
          where: { id: task.id },
          data: { noResponseFlagged: true },
        });

        const heads = await this.prisma.departmentHead.findMany({
          where: { departmentId: task.toDepartmentId },
          select: { userId: true },
        });

        await this.notifications.notifyMany(
          heads.map((h) => h.userId),
          {
            type: NotificationType.TASK_OVERDUE,
            title: "⚠️ So'rov javobsiz qoldi",
            body: [
              `<b>#${task.number} — ${task.title}</b>`,
              '',
              "24 soatdan beri javob berilmadi. Bu ko'rsatkich oylik hisobotga tushadi.",
            ].join('\n'),
            payload: { taskId: task.id },
          },
        );
      }

      if (items.length) {
        this.logger.warn(`${items.length} ta so'rov javobsiz deb belgilandi`);
      }
    });
  }

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
