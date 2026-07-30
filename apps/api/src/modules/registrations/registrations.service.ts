import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  Prisma,
  RegistrationStatus,
  SystemRole,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccessService } from '../../common/auth/access.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../telegram/notifications.service';
import { TelegramService } from '../telegram/telegram.service';
import { mainMenu } from '../telegram/keyboards';
import type { AuthUser } from '../../common/auth/auth.types';

export interface SubmitRegistrationInput {
  telegramId: number;
  telegramUsername?: string;
  telegramFirstName?: string;
  fullName: string;
  position: string;
  departmentId: string | null;
}

/**
 * Hodimning o'zi bot orqali ro'yxatdan o'tishi.
 *
 * Ariza yuboriladi → bosh admin tasdiqlaydi → shundan keyingina
 * hodim yozuvi yaratiladi va Mini App ochiladi.
 */
@Injectable()
export class RegistrationsService {
  private readonly logger = new Logger(RegistrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly telegram: TelegramService,
  ) {}

  /** Bot ro'yxatdan o'tish uchun ko'rsatadigan bo'limlar */
  listOpenDepartments() {
    return this.prisma.department.findMany({
      where: { isActive: true },
      select: { id: true, name: true, type: true },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  /** Shu Telegram akkaunt bo'yicha oxirgi ariza */
  findByTelegramId(telegramId: number) {
    return this.prisma.registrationRequest.findUnique({
      where: { telegramId: BigInt(telegramId) },
      include: { department: { select: { id: true, name: true } } },
    });
  }

  async submit(input: SubmitRegistrationInput) {
    const telegramId = BigInt(input.telegramId);

    const linkedUser = await this.prisma.user.findUnique({
      where: { telegramId },
      select: { id: true },
    });
    if (linkedUser) {
      throw new BadRequestException('Siz allaqachon tizimdasiz');
    }

    const existing = await this.prisma.registrationRequest.findUnique({
      where: { telegramId },
    });

    if (existing?.status === RegistrationStatus.PENDING) {
      throw new BadRequestException("Arizangiz allaqachon ko'rib chiqilmoqda");
    }

    const data = {
      telegramId,
      telegramUsername: input.telegramUsername ?? null,
      telegramFirstName: input.telegramFirstName ?? null,
      fullName: input.fullName.trim(),
      position: input.position.trim(),
      departmentId: input.departmentId,
      status: RegistrationStatus.PENDING,
      decidedById: null,
      decidedAt: null,
      decisionNote: null,
    };

    // Rad etilgan bo'lsa qayta ariza berishi mumkin — eski yozuv yangilanadi
    const request = existing
      ? await this.prisma.registrationRequest.update({ where: { telegramId }, data })
      : await this.prisma.registrationRequest.create({ data });

    await this.notifyAdmins(request.id);

    this.logger.log(`Yangi ariza: ${request.fullName} (${input.telegramId})`);
    return request;
  }

  private async notifyAdmins(requestId: string) {
    const request = await this.prisma.registrationRequest.findUnique({
      where: { id: requestId },
      include: { department: { select: { name: true } } },
    });
    if (!request) return;

    const pending = await this.prisma.registrationRequest.count({
      where: { status: RegistrationStatus.PENDING },
    });

    await this.notifications.notifyRole('ADMIN', {
      type: NotificationType.SYSTEM,
      title: '🆕 Yangi ro\'yxatdan o\'tish arizasi',
      body: [
        `<b>${request.fullName}</b>`,
        `Vazifasi: ${request.position}`,
        `Bo'lim: ${request.department?.name ?? '—'}`,
        request.telegramUsername ? `Telegram: @${request.telegramUsername}` : '',
        '',
        `Kutilayotgan arizalar: <b>${pending}</b>`,
        '',
        'Tasdiqlash uchun panelga kiring.',
      ]
        .filter(Boolean)
        .join('\n'),
      payload: { registrationId: request.id },
      extra: {
        reply_markup: this.telegram.miniAppKeyboard('📋 Arizalarni ko\'rish', '/arizalar'),
      },
    });
  }

  // ============================================================
  //  Admin tomoni
  // ============================================================

  async list(actor: AuthUser, status?: RegistrationStatus) {
    if (!this.access.isAdmin(actor)) {
      throw new ForbiddenException('Arizalarni faqat administrator ko\'radi');
    }

    const where: Prisma.RegistrationRequestWhereInput = {};
    if (status) where.status = status;

    return this.prisma.registrationRequest.findMany({
      where,
      include: {
        department: { select: { id: true, name: true } },
        decidedBy: { select: { id: true, fullName: true } },
        createdUser: { select: { id: true, fullName: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  async pendingCount(actor: AuthUser) {
    if (!this.access.isAdmin(actor)) return { count: 0 };
    return {
      count: await this.prisma.registrationRequest.count({
        where: { status: RegistrationStatus.PENDING },
      }),
    };
  }

  /**
   * Arizani tasdiqlash — hodim yozuvi shu yerda yaratiladi
   * va Telegram akkaunti unga bog'lanadi.
   */
  async approve(
    actor: AuthUser,
    id: string,
    overrides?: { fullName?: string; position?: string; departmentId?: string | null; note?: string },
  ) {
    if (!this.access.isAdmin(actor)) {
      throw new ForbiddenException('Arizani faqat bosh administrator tasdiqlaydi');
    }

    const request = await this.prisma.registrationRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Ariza topilmadi');
    if (request.status !== RegistrationStatus.PENDING) {
      throw new BadRequestException('Bu ariza allaqachon hal qilingan');
    }

    const occupied = await this.prisma.user.findUnique({
      where: { telegramId: request.telegramId },
      select: { id: true, fullName: true },
    });
    if (occupied) {
      throw new BadRequestException(
        `Bu Telegram akkaunt allaqachon ${occupied.fullName} ga bog'langan`,
      );
    }

    const fullName = overrides?.fullName?.trim() || request.fullName;
    const position = overrides?.position?.trim() || request.position;
    const departmentId =
      overrides?.departmentId === undefined ? request.departmentId : overrides.departmentId;

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          fullName,
          position,
          departmentId,
          roles: [SystemRole.EMPLOYEE],
          status: UserStatus.ACTIVE,
          telegramId: request.telegramId,
          telegramUsername: request.telegramUsername,
          telegramLinkedAt: new Date(),
        },
      });

      await tx.registrationRequest.update({
        where: { id },
        data: {
          status: RegistrationStatus.APPROVED,
          decidedById: actor.id,
          decidedAt: new Date(),
          decisionNote: overrides?.note,
          createdUserId: created.id,
          fullName,
          position,
          departmentId,
        },
      });

      return created;
    });

    await this.audit.log(actor.id, 'registration.approve', 'RegistrationRequest', id, request, {
      userId: user.id,
    });

    await this.notifications.notify({
      userId: user.id,
      type: NotificationType.SYSTEM,
      title: '✅ Arizangiz tasdiqlandi',
      body: [
        `Xush kelibsiz, <b>${user.fullName}</b>!`,
        '',
        'Tizimga kirish ochildi. Ish vaqtingiz boshlanganda',
        'shu yerga belgilanish haqida xabar keladi.',
      ].join('\n'),
      payload: { registrationId: id },
      extra: { reply_markup: mainMenu() },
    });

    this.logger.log(`Ariza tasdiqlandi: ${user.fullName} → ${user.id}`);
    return user;
  }

  async reject(actor: AuthUser, id: string, reason: string) {
    if (!this.access.isAdmin(actor)) {
      throw new ForbiddenException('Arizani faqat bosh administrator rad etadi');
    }

    const request = await this.prisma.registrationRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Ariza topilmadi');
    if (request.status !== RegistrationStatus.PENDING) {
      throw new BadRequestException('Bu ariza allaqachon hal qilingan');
    }

    const updated = await this.prisma.registrationRequest.update({
      where: { id },
      data: {
        status: RegistrationStatus.REJECTED,
        decidedById: actor.id,
        decidedAt: new Date(),
        decisionNote: reason,
      },
    });

    await this.audit.log(actor.id, 'registration.reject', 'RegistrationRequest', id, request, updated);

    // Hodim hali tizimda yo'q — to'g'ridan-to'g'ri Telegramga yozamiz
    await this.telegram.sendToChat(
      request.telegramId,
      [
        '❌ <b>Arizangiz rad etildi</b>',
        '',
        `Sabab: ${reason}`,
        '',
        "Savollaringiz bo'lsa rahbaringizga murojaat qiling.",
        "Qayta ariza berish uchun: /start",
      ].join('\n'),
    );

    return updated;
  }

  /** Ariza ma'lumotlarini tasdiqlashdan oldin tuzatish */
  async update(
    actor: AuthUser,
    id: string,
    data: { fullName?: string; position?: string; departmentId?: string | null },
  ) {
    if (!this.access.isAdmin(actor)) {
      throw new ForbiddenException('Huquqingiz yetarli emas');
    }

    const request = await this.prisma.registrationRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException('Ariza topilmadi');
    if (request.status !== RegistrationStatus.PENDING) {
      throw new BadRequestException("Hal qilingan arizani o'zgartirib bo'lmaydi");
    }

    return this.prisma.registrationRequest.update({
      where: { id },
      data: {
        fullName: data.fullName?.trim(),
        position: data.position?.trim(),
        departmentId: data.departmentId === undefined ? undefined : data.departmentId,
      },
    });
  }
}
