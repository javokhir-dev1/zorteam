import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AbsenceStatus,
  AbsenceType,
  AttendanceStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccessService } from '../../common/auth/access.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../telegram/notifications.service';
import { absenceDecisionKeyboard } from '../telegram/keyboards';
import { toDateOnly, fmtDate, dateKey } from '../../common/utils/dates';
import type { AuthUser } from '../../common/auth/auth.types';
import type { CreateAbsenceDto, DecideAbsenceDto, ListAbsencesQuery } from './dto';

export const ABSENCE_LABEL: Record<AbsenceType, string> = {
  BUSINESS_TRIP: 'Xizmat safari',
  SICK_LEAVE: 'Davolanish',
  VACATION: "Ta'til",
  UNPAID: "Ish haqisiz ta'til",
  REMOTE: 'Masofadan ishlash',
  OTHER: 'Boshqa',
};

@Injectable()
export class AbsencesService {
  private readonly logger = new Logger(AbsencesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Yo'qlik so'rovini bo'lim rahbari kiritadi.
   * So'rov tasdiqlovchi rahbarga botga tugmalar bilan boradi.
   */
  async create(actor: AuthUser, dto: CreateAbsenceDto) {
    const startDate = toDateOnly(dto.startDate);
    const endDate = toDateOnly(dto.endDate);

    if (endDate < startDate) {
      throw new BadRequestException('Tugash sanasi boshlanish sanasidan oldin bo\'la olmaydi');
    }

    // Rahbar faqat o'z hodimi uchun so'rov kirita oladi
    await this.access.assertManagesUser(actor, dto.userId);

    const overlapping = await this.prisma.absenceRequest.findFirst({
      where: {
        userId: dto.userId,
        status: { in: [AbsenceStatus.PENDING, AbsenceStatus.APPROVED] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });

    if (overlapping) {
      throw new BadRequestException(
        `Bu sanalarda allaqachon so'rov mavjud (${fmtDate(overlapping.startDate)} — ${fmtDate(overlapping.endDate)})`,
      );
    }

    const absence = await this.prisma.absenceRequest.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        startDate,
        endDate,
        reason: dto.reason,
        createdById: actor.id,
        attachmentId: dto.attachmentId || null,
      },
      include: {
        user: { select: { id: true, fullName: true, position: true, department: { select: { name: true } } } },
        createdBy: { select: { fullName: true } },
      },
    });

    await this.audit.log(actor.id, 'absence.create', 'AbsenceRequest', absence.id, null, absence);
    await this.notifyApprovers(absence);

    return absence;
  }

  private async notifyApprovers(absence: any) {
    const days =
      Math.round(
        (absence.endDate.getTime() - absence.startDate.getTime()) / 86_400_000,
      ) + 1;

    const body = [
      `<b>${absence.user.fullName}</b> — ${absence.user.position}`,
      `Bo'lim: ${absence.user.department?.name ?? '—'}`,
      '',
      `Turi: <b>${ABSENCE_LABEL[absence.type as AbsenceType]}</b>`,
      `Muddat: ${fmtDate(absence.startDate)} — ${fmtDate(absence.endDate)} (${days} kun)`,
      `Sabab: ${absence.reason}`,
      '',
      `Kiritdi: ${absence.createdBy.fullName}`,
    ].join('\n');

    await this.notifications.notifyRole('APPROVER', {
      type: NotificationType.ABSENCE_APPROVAL,
      title: "📝 Yo'qlik so'rovi tasdiqlashni kutmoqda",
      body,
      payload: { absenceId: absence.id },
      extra: { reply_markup: absenceDecisionKeyboard(absence.id) },
    });
  }

  /**
   * Tasdiqlash yoki rad etish.
   * Tasdiqlangach o'sha kunlardagi davomat yozuvlari EXCUSED ga o'tadi —
   * ya'ni hodimdan belgilanish so'ralmaydi.
   */
  async decide(actor: AuthUser, id: string, dto: DecideAbsenceDto) {
    if (!this.access.isApprover(actor)) {
      throw new ForbiddenException("Yo'qlik so'rovlarini faqat tasdiqlovchi rahbar hal qiladi");
    }

    if (dto.status !== AbsenceStatus.APPROVED && dto.status !== AbsenceStatus.REJECTED) {
      throw new BadRequestException("Faqat tasdiqlash yoki rad etish mumkin");
    }

    const absence = await this.prisma.absenceRequest.findUnique({
      where: { id },
      include: { user: { select: { id: true, fullName: true } } },
    });

    if (!absence) throw new NotFoundException("So'rov topilmadi");
    if (absence.status !== AbsenceStatus.PENDING) {
      throw new BadRequestException("Bu so'rov allaqachon hal qilingan");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.absenceRequest.update({
        where: { id },
        data: {
          status: dto.status,
          decidedById: actor.id,
          decidedAt: new Date(),
          decisionNote: dto.note,
        },
        include: {
          user: { select: { id: true, fullName: true } },
          decidedBy: { select: { fullName: true } },
        },
      });

      if (dto.status === AbsenceStatus.APPROVED) {
        // Belgilanmagan kunlarni "sababli" qilib qo'yamiz
        await tx.attendance.updateMany({
          where: {
            userId: absence.userId,
            date: { gte: absence.startDate, lte: absence.endDate },
            checkInAt: null,
            status: { in: [AttendanceStatus.PENDING, AttendanceStatus.MISSED] },
          },
          data: { status: AttendanceStatus.EXCUSED, absenceRequestId: id },
        });
      }

      return result;
    });

    await this.audit.log(actor.id, `absence.${dto.status.toLowerCase()}`, 'AbsenceRequest', id, absence, updated);

    // Hodimga va so'rovni kiritgan rahbarga natijani xabar qilamiz
    const approved = dto.status === AbsenceStatus.APPROVED;
    const body = [
      `Turi: ${ABSENCE_LABEL[absence.type]}`,
      `Muddat: ${fmtDate(absence.startDate)} — ${fmtDate(absence.endDate)}`,
      '',
      approved ? '✅ Tasdiqlandi' : '❌ Rad etildi',
      dto.note ? `Izoh: ${dto.note}` : '',
      `Hal qildi: ${updated.decidedBy?.fullName ?? '—'}`,
    ]
      .filter(Boolean)
      .join('\n');

    const recipients = [...new Set([absence.userId, absence.createdById])];
    await this.notifications.notifyMany(recipients, {
      type: NotificationType.ABSENCE_DECIDED,
      title: approved ? "✅ Yo'qlik so'rovi tasdiqlandi" : "❌ Yo'qlik so'rovi rad etildi",
      body,
      payload: { absenceId: id },
    });

    return updated;
  }

  async cancel(actor: AuthUser, id: string) {
    const absence = await this.prisma.absenceRequest.findUnique({ where: { id } });
    if (!absence) throw new NotFoundException("So'rov topilmadi");

    const canCancel =
      this.access.isAdmin(actor) ||
      absence.createdById === actor.id ||
      (await this.access.managesUser(actor, absence.userId));

    if (!canCancel) throw new ForbiddenException('Bekor qilish huquqingiz yo\'q');

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.absenceRequest.update({
        where: { id },
        data: { status: AbsenceStatus.CANCELLED },
      });

      // Sababli deb belgilangan kunlarni qaytaramiz
      await tx.attendance.updateMany({
        where: { absenceRequestId: id, checkInAt: null },
        data: { status: AttendanceStatus.PENDING, absenceRequestId: null },
      });

      return result;
    });

    await this.audit.log(actor.id, 'absence.cancel', 'AbsenceRequest', id, absence, updated);
    return updated;
  }

  async list(actor: AuthUser, query: ListAbsencesQuery) {
    const where: Prisma.AbsenceRequestWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.userId) where.userId = query.userId;

    if (query.from || query.to) {
      where.startDate = query.to ? { lte: toDateOnly(query.to) } : undefined;
      where.endDate = query.from ? { gte: toDateOnly(query.from) } : undefined;
    }

    const userWhere: Prisma.UserWhereInput = {};
    const visible = await this.access.visibleDepartmentIds(actor);
    // Tasdiqlovchi rahbar barcha so'rovlarni ko'rishi kerak
    if (visible !== null && !this.access.isApprover(actor)) {
      userWhere.departmentId = { in: visible.length ? visible : ['__none__'] };
    }
    if (query.departmentId) userWhere.departmentId = query.departmentId;
    if (Object.keys(userWhere).length) where.user = userWhere;

    return this.prisma.absenceRequest.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            position: true,
            department: { select: { id: true, name: true } },
          },
        },
        createdBy: { select: { id: true, fullName: true } },
        decidedBy: { select: { id: true, fullName: true } },
        attachment: { select: { id: true, fileName: true } },
      },
      orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
      take: 200,
    });
  }

  /** Hodimning o'z so'rovlari (Mini App) */
  async mine(userId: string) {
    return this.prisma.absenceRequest.findMany({
      where: { userId },
      include: { decidedBy: { select: { fullName: true } } },
      orderBy: { startDate: 'desc' },
      take: 50,
    });
  }

  /** Bugungi sababli yo'qlar — panel bosh sahifasi uchun */
  async todayAbsent(actor: AuthUser) {
    const today = toDateOnly(new Date());

    const where: Prisma.AbsenceRequestWhereInput = {
      status: AbsenceStatus.APPROVED,
      startDate: { lte: today },
      endDate: { gte: today },
    };

    const visible = await this.access.visibleDepartmentIds(actor);
    if (visible !== null) {
      where.user = { departmentId: { in: visible.length ? visible : ['__none__'] } };
    }

    const items = await this.prisma.absenceRequest.findMany({
      where,
      include: {
        user: {
          select: { id: true, fullName: true, position: true, department: { select: { name: true } } },
        },
      },
    });

    return { date: dateKey(today), items };
  }
}
