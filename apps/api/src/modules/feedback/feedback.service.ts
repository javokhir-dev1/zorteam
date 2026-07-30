import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FeedbackCategory, FeedbackStatus, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccessService } from '../../common/auth/access.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../telegram/notifications.service';
import type { AuthUser } from '../../common/auth/auth.types';

export const CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  TECHNICAL: 'Texnika va jihozlar',
  RELATIONS: 'Munosabatlar',
  CONDITIONS: 'Ish sharoiti',
  SALARY: 'Moliyaviy masalalar',
  SUGGESTION: 'Taklif',
  OTHER: 'Boshqa',
};

/**
 * Maxfiy murojaat.
 *
 * Hodimga "maxfiy" deb ko'rsatiladi — hamkasblari ko'rmaydi.
 * Administrator esa muallifni ko'radi (kompaniya qarori shunday).
 * Shuning uchun botda "anonim" emas, "maxfiy" so'zi ishlatiladi.
 */
@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(authorId: string, data: { category: FeedbackCategory; subject: string; body: string }) {
    const feedback = await this.prisma.feedback.create({
      data: {
        authorId,
        category: data.category,
        subject: data.subject.slice(0, 200),
        body: data.body,
      },
      include: {
        author: {
          select: { id: true, fullName: true, position: true, department: { select: { name: true } } },
        },
      },
    });

    // Adminlarga xabar — muallif ismi bilan
    await this.notifications.notifyRole('ADMIN', {
      type: NotificationType.SYSTEM,
      title: '✉️ Yangi maxfiy murojaat',
      body: [
        `Kategoriya: <b>${CATEGORY_LABEL[data.category]}</b>`,
        `Mavzu: ${feedback.subject}`,
        '',
        feedback.body.slice(0, 500),
        '',
        `Muallif: ${feedback.author.fullName} (${feedback.author.department?.name ?? '—'})`,
      ].join('\n'),
      payload: { feedbackId: feedback.id },
    });

    return feedback;
  }

  /** Admin ro'yxati — muallif ko'rinadi */
  async list(actor: AuthUser, params: { status?: FeedbackStatus; category?: FeedbackCategory }) {
    if (!this.access.isAdmin(actor)) {
      throw new ForbiddenException('Maxfiy murojaatlarni faqat administrator ko\'radi');
    }

    const where: Prisma.FeedbackWhereInput = {};
    if (params.status) where.status = params.status;
    if (params.category) where.category = params.category;

    return this.prisma.feedback.findMany({
      where,
      include: {
        author: {
          select: {
            id: true,
            fullName: true,
            position: true,
            department: { select: { id: true, name: true } },
          },
        },
        replies: {
          include: { author: { select: { id: true, fullName: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  async findOne(actor: AuthUser, id: string) {
    if (!this.access.isAdmin(actor)) {
      throw new ForbiddenException('Huquqingiz yetarli emas');
    }

    const feedback = await this.prisma.feedback.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            fullName: true,
            position: true,
            department: { select: { id: true, name: true } },
          },
        },
        replies: {
          include: { author: { select: { id: true, fullName: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!feedback) throw new NotFoundException('Murojaat topilmadi');

    if (!feedback.readByAdminAt) {
      await this.prisma.feedback.update({
        where: { id },
        data: { readByAdminAt: new Date(), status: FeedbackStatus.IN_REVIEW },
      });
    }

    return feedback;
  }

  /** Admin javob yozadi — javob hodimga botga boradi */
  async reply(actor: AuthUser, id: string, body: string) {
    if (!this.access.isAdmin(actor)) {
      throw new ForbiddenException('Huquqingiz yetarli emas');
    }

    const feedback = await this.prisma.feedback.findUnique({ where: { id } });
    if (!feedback) throw new NotFoundException('Murojaat topilmadi');

    const reply = await this.prisma.feedbackReply.create({
      data: { feedbackId: id, authorId: actor.id, body, fromAdmin: true },
    });

    await this.prisma.feedback.update({
      where: { id },
      data: { status: FeedbackStatus.ANSWERED },
    });

    await this.notifications.notify({
      userId: feedback.authorId,
      type: NotificationType.FEEDBACK_REPLY,
      title: '✉️ Murojaatingizga javob',
      body: [`Mavzu: ${feedback.subject}`, '', body].join('\n'),
      payload: { feedbackId: id },
    });

    await this.audit.log(actor.id, 'feedback.reply', 'Feedback', id);
    return reply;
  }

  async setStatus(actor: AuthUser, id: string, status: FeedbackStatus) {
    if (!this.access.isAdmin(actor)) {
      throw new ForbiddenException('Huquqingiz yetarli emas');
    }

    const updated = await this.prisma.feedback.update({ where: { id }, data: { status } });
    await this.audit.log(actor.id, 'feedback.status', 'Feedback', id, null, { status });
    return updated;
  }

  /** Hodimning o'z murojaatlari */
  async mine(userId: string) {
    return this.prisma.feedback.findMany({
      where: { authorId: userId },
      include: { replies: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** Statistika — hisobot uchun */
  async stats() {
    const [byCategory, byStatus, total] = await Promise.all([
      this.prisma.feedback.groupBy({ by: ['category'], _count: { _all: true } }),
      this.prisma.feedback.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.feedback.count(),
    ]);

    return {
      total,
      byCategory: byCategory.map((c) => ({
        category: c.category,
        label: CATEGORY_LABEL[c.category],
        count: c._count._all,
      })),
      byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
    };
  }
}
