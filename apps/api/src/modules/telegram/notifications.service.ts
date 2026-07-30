import { Injectable, Logger } from '@nestjs/common';
import { NotificationStatus, NotificationType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TelegramService } from './telegram.service';

export interface NotifyOptions {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
  /** Inline tugmalar va boshqa Telegram sozlamalari */
  extra?: any;
  /** Faqat bazaga yozish, Telegramga yubormaslik */
  silent?: boolean;
}

/**
 * Barcha bildirishnomalar shu yerdan o'tadi:
 * avval bazaga yoziladi, keyin Telegramga yuboriladi.
 * Shunda "xabar yuborildimi" savoliga aniq javob bor.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  async notify(options: NotifyOptions) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: options.userId,
        type: options.type,
        title: options.title,
        body: options.body,
        payload: (options.payload ?? undefined) as any,
      },
    });

    if (options.silent) return notification;

    const text = options.title ? `<b>${options.title}</b>\n\n${options.body}` : options.body;
    const result = await this.telegram.sendToUser(options.userId, text, options.extra);

    return this.prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: result.ok
          ? NotificationStatus.SENT
          : result.blocked
            ? NotificationStatus.BLOCKED
            : NotificationStatus.FAILED,
        sentAt: result.ok ? new Date() : null,
        telegramMessageId: result.messageId ?? null,
        error: result.error ?? null,
      },
    });
  }

  /** Bir nechta hodimga bir xil xabar */
  async notifyMany(userIds: string[], options: Omit<NotifyOptions, 'userId'>) {
    const results: Awaited<ReturnType<typeof this.notify>>[] = [];
    for (const userId of userIds) {
      results.push(await this.notify({ ...options, userId }));
    }
    return results;
  }

  /** Rol bo'yicha yuborish (masalan barcha tasdiqlovchi rahbarlarga) */
  async notifyRole(role: 'ADMIN' | 'APPROVER', options: Omit<NotifyOptions, 'userId'>) {
    const users = await this.prisma.user.findMany({
      where: { roles: { has: role as any }, status: 'ACTIVE', telegramId: { not: null } },
      select: { id: true },
    });

    if (!users.length) {
      this.logger.warn(`${role} rolida Telegramga ulangan hodim yo'q`);
    }

    return this.notifyMany(
      users.map((u) => u.id),
      options,
    );
  }

  async listForUser(userId: string, take = 30) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
