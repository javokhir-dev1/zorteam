import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType, Prisma, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccessService } from '../../common/auth/access.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../telegram/notifications.service';
import { TelegramService } from '../telegram/telegram.service';
import { openMiniApp } from '../telegram/keyboards';
import { fmtDateTime, dayjs } from '../../common/utils/dates';
import type { AuthUser } from '../../common/auth/auth.types';
import type {
  AcceptTaskDto,
  CommentDto,
  CreateTaskDto,
  ListTasksQuery,
  RejectTaskDto,
  UpdateTaskStatusDto,
} from './dto';

const TASK_INCLUDE = {
  fromUser: { select: { id: true, fullName: true, position: true } },
  fromDepartment: { select: { id: true, name: true } },
  toDepartment: { select: { id: true, name: true } },
  assignee: { select: { id: true, fullName: true, position: true } },
  show: { select: { id: true, name: true } },
  episode: { select: { id: true, title: true, airAt: true } },
  attachments: { include: { file: { select: { id: true, fileName: true, mimeType: true } } } },
  comments: {
    include: { author: { select: { id: true, fullName: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.TaskRequestInclude;

/**
 * Bo'limlararo so'rovlar.
 *
 * Oqim:  yaratildi → bo'lim rahbari ijrochi va muddat belgiladi →
 *        ijrochi bajardi.  Har bosqich vaqti yozib boriladi,
 *        kechikish va javobsizlik hisobotda ko'rinadi.
 */
@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly telegram: TelegramService,
  ) {}

  async create(actor: AuthUser, dto: CreateTaskDto) {
    if (!actor.departmentId) {
      throw new BadRequestException("Siz hech qaysi bo'limga biriktirilmagansiz");
    }

    if (dto.toDepartmentId === actor.departmentId) {
      throw new BadRequestException("O'z bo'limingizga so'rov yubora olmaysiz");
    }

    const target = await this.prisma.department.findUnique({
      where: { id: dto.toDepartmentId },
      select: { id: true, name: true, isActive: true },
    });
    if (!target?.isActive) throw new NotFoundException("Bo'lim topilmadi");

    const task = await this.prisma.taskRequest.create({
      data: {
        title: dto.title,
        description: dto.description,
        fromUserId: actor.id,
        fromDepartmentId: actor.departmentId,
        toDepartmentId: dto.toDepartmentId,
        showId: dto.showId || null,
        episodeId: dto.episodeId || null,
        priority: dto.priority,
        deadlineAt: dto.desiredDeadline ? new Date(dto.desiredDeadline) : null,
        attachments: dto.fileIds?.length
          ? { create: dto.fileIds.map((fileId) => ({ fileId })) }
          : undefined,
      },
      include: TASK_INCLUDE,
    });

    await this.audit.log(actor.id, 'task.create', 'TaskRequest', task.id, null, task);
    await this.notifyDepartmentHeads(task);

    return task;
  }

  private async notifyDepartmentHeads(task: any) {
    const heads = await this.prisma.departmentHead.findMany({
      where: { departmentId: task.toDepartmentId },
      select: { userId: true },
    });

    if (!heads.length) {
      this.logger.warn(`${task.toDepartment.name} bo'limida rahbar belgilanmagan`);
      return;
    }

    const body = [
      `<b>#${task.number} — ${task.title}</b>`,
      '',
      task.description.slice(0, 600),
      '',
      `Kimdan: ${task.fromUser.fullName} (${task.fromDepartment.name})`,
      task.show ? `Ko'rsatuv: ${task.show.name}` : '',
      task.deadlineAt ? `Taklif qilingan muddat: ${fmtDateTime(task.deadlineAt)}` : '',
      '',
      'Ijrochi va muddatni belgilang.',
    ]
      .filter(Boolean)
      .join('\n');

    await this.notifications.notifyMany(
      heads.map((h) => h.userId),
      {
        type: NotificationType.TASK_CREATED,
        title: `📥 Yangi so'rov — ${task.toDepartment.name}`,
        body,
        payload: { taskId: task.id },
        extra: {
          reply_markup: this.telegram.miniAppKeyboard('👤 Ijrochi belgilash', '/topshiriqlar'),
        },
      },
    );
  }

  /** Bo'lim rahbari so'rovni qabul qiladi: ijrochi + muddat */
  async accept(actor: AuthUser, id: string, dto: AcceptTaskDto) {
    const task = await this.prisma.taskRequest.findUnique({
      where: { id },
      include: { toDepartment: { select: { id: true, name: true } } },
    });
    if (!task) throw new NotFoundException("So'rov topilmadi");

    await this.assertCanManage(actor, task.toDepartmentId);

    if (![TaskStatus.NEW, TaskStatus.ACCEPTED].includes(task.status as any)) {
      throw new BadRequestException("Bu so'rov bosqichida ijrochi belgilab bo'lmaydi");
    }

    // Ijrochi shu bo'limdan bo'lishi kerak
    const assignee = await this.prisma.user.findUnique({
      where: { id: dto.assigneeId },
      select: { id: true, fullName: true, departmentId: true },
    });
    if (!assignee) throw new NotFoundException('Ijrochi topilmadi');

    if (!this.access.isAdmin(actor) && assignee.departmentId !== task.toDepartmentId) {
      const inSubtree = await this.access.managesUser(actor, dto.assigneeId);
      if (!inSubtree) {
        throw new BadRequestException("Ijrochi shu bo'lim hodimi bo'lishi kerak");
      }
    }

    const deadlineAt = new Date(dto.deadlineAt);
    if (deadlineAt < new Date()) {
      throw new BadRequestException("Muddat o'tmishda bo'la olmaydi");
    }

    const now = new Date();
    const updated = await this.prisma.taskRequest.update({
      where: { id },
      data: {
        status: TaskStatus.ACCEPTED,
        assigneeId: dto.assigneeId,
        deadlineAt,
        acceptedAt: task.acceptedAt ?? now,
        firstResponseAt: task.firstResponseAt ?? now,
        noResponseFlagged: false,
        isOverdue: false,
        overdueMinutes: 0,
        deadlineReminderSentAt: null,
        overdueNotifiedAt: null,
      },
      include: TASK_INCLUDE,
    });

    await this.audit.log(actor.id, 'task.accept', 'TaskRequest', id, task, updated);

    await this.notifications.notify({
      userId: dto.assigneeId,
      type: NotificationType.TASK_ASSIGNED,
      title: '📋 Sizga topshiriq berildi',
      body: [
        `<b>#${updated.number} — ${updated.title}</b>`,
        '',
        updated.description.slice(0, 600),
        '',
        `Muddat: <b>${fmtDateTime(deadlineAt)}</b>`,
        `So'rovchi: ${updated.fromUser.fullName} (${updated.fromDepartment.name})`,
        dto.note ? `\nIzoh: ${dto.note}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      payload: { taskId: id },
    });

    // So'rov muallifiga ham xabar
    await this.notifications.notify({
      userId: updated.fromUserId,
      type: NotificationType.TASK_STATUS_CHANGED,
      title: "✅ So'rovingiz qabul qilindi",
      body: [
        `<b>#${updated.number} — ${updated.title}</b>`,
        '',
        `Ijrochi: ${assignee.fullName}`,
        `Muddat: ${fmtDateTime(deadlineAt)}`,
      ].join('\n'),
      payload: { taskId: id },
    });

    return updated;
  }

  async reject(actor: AuthUser, id: string, dto: RejectTaskDto) {
    const task = await this.prisma.taskRequest.findUnique({ where: { id } });
    if (!task) throw new NotFoundException("So'rov topilmadi");

    await this.assertCanManage(actor, task.toDepartmentId);

    if ([TaskStatus.DONE, TaskStatus.CANCELLED].includes(task.status as any)) {
      throw new BadRequestException("Bu so'rovni rad etib bo'lmaydi");
    }

    const now = new Date();
    const updated = await this.prisma.taskRequest.update({
      where: { id },
      data: {
        status: TaskStatus.REJECTED,
        rejectedReason: dto.reason,
        firstResponseAt: task.firstResponseAt ?? now,
        noResponseFlagged: false,
      },
      include: TASK_INCLUDE,
    });

    await this.audit.log(actor.id, 'task.reject', 'TaskRequest', id, task, updated);

    await this.notifications.notify({
      userId: task.fromUserId,
      type: NotificationType.TASK_STATUS_CHANGED,
      title: "❌ So'rovingiz rad etildi",
      body: [`<b>#${updated.number} — ${updated.title}</b>`, '', `Sabab: ${dto.reason}`].join('\n'),
      payload: { taskId: id },
    });

    return updated;
  }

  /** Ijrochi holatni o'zgartiradi (jarayonda / bajarildi) */
  async updateStatus(actor: AuthUser, id: string, dto: UpdateTaskStatusDto) {
    const task = await this.prisma.taskRequest.findUnique({ where: { id } });
    if (!task) throw new NotFoundException("So'rov topilmadi");

    const canUpdate =
      this.access.isAdmin(actor) ||
      task.assigneeId === actor.id ||
      (await this.access.managesDepartment(actor, task.toDepartmentId)) ||
      (dto.status === TaskStatus.CANCELLED && task.fromUserId === actor.id);

    if (!canUpdate) throw new ForbiddenException("Bu so'rovni o'zgartirish huquqingiz yo'q");

    const allowed: TaskStatus[] = [
      TaskStatus.IN_PROGRESS,
      TaskStatus.DONE,
      TaskStatus.CANCELLED,
      TaskStatus.ACCEPTED,
    ];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException("Bu holatga o'tkazib bo'lmaydi");
    }

    const now = new Date();
    const completedAt = dto.status === TaskStatus.DONE ? now : null;

    // Bajarilgan bo'lsa kechikishni yakuniy hisoblaymiz
    const overdueMinutes =
      completedAt && task.deadlineAt && completedAt > task.deadlineAt
        ? Math.round((completedAt.getTime() - task.deadlineAt.getTime()) / 60000)
        : task.overdueMinutes;

    const updated = await this.prisma.taskRequest.update({
      where: { id },
      data: {
        status: dto.status,
        completedAt,
        overdueMinutes,
        isOverdue: overdueMinutes > 0,
        firstResponseAt: task.firstResponseAt ?? now,
      },
      include: TASK_INCLUDE,
    });

    if (dto.comment) {
      await this.prisma.taskComment.create({
        data: { taskRequestId: id, authorId: actor.id, body: dto.comment },
      });
    }

    await this.audit.log(actor.id, `task.${dto.status.toLowerCase()}`, 'TaskRequest', id, task, updated);

    if (dto.status === TaskStatus.DONE) {
      const lateNote = overdueMinutes > 0 ? `\n⚠️ Muddatdan ${this.humanDuration(overdueMinutes)} kech` : '';
      await this.notifications.notify({
        userId: task.fromUserId,
        type: NotificationType.TASK_STATUS_CHANGED,
        title: '✅ Topshiriq bajarildi',
        body: [`<b>#${updated.number} — ${updated.title}</b>`, '', `Ijrochi: ${updated.assignee?.fullName ?? '—'}`, lateNote]
          .filter(Boolean)
          .join('\n'),
        payload: { taskId: id },
      });
    }

    return updated;
  }

  async comment(actor: AuthUser, id: string, dto: CommentDto) {
    const task = await this.prisma.taskRequest.findUnique({ where: { id } });
    if (!task) throw new NotFoundException("So'rov topilmadi");

    const comment = await this.prisma.taskComment.create({
      data: { taskRequestId: id, authorId: actor.id, body: dto.body },
      include: { author: { select: { id: true, fullName: true } } },
    });

    // Ishtirokchilarga xabar (yozgan odamdan boshqa hammaga)
    const participants = [task.fromUserId, task.assigneeId].filter(
      (userId): userId is string => Boolean(userId) && userId !== actor.id,
    );

    if (participants.length) {
      await this.notifications.notifyMany(participants, {
        type: NotificationType.TASK_STATUS_CHANGED,
        title: `💬 #${task.number} — yangi izoh`,
        body: [`<b>${task.title}</b>`, '', `${comment.author.fullName}:`, dto.body].join('\n'),
        payload: { taskId: id },
      });
    }

    return comment;
  }

  async list(actor: AuthUser, query: ListTasksQuery) {
    const take = Math.min(Number(query.take ?? 50), 200);
    const skip = Number(query.skip ?? 0);

    const where: Prisma.TaskRequestWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.toDepartmentId) where.toDepartmentId = query.toDepartmentId;
    if (query.fromDepartmentId) where.fromDepartmentId = query.fromDepartmentId;
    if (query.assigneeId) where.assigneeId = query.assigneeId;
    if (query.showId) where.showId = query.showId;
    if (query.overdue === 'true') where.isOverdue = true;

    if (query.scope === 'mine') {
      where.OR = [{ assigneeId: actor.id }, { fromUserId: actor.id }];
    } else if (!this.access.isAdmin(actor) && !actor.roles.includes('VIEWER' as any)) {
      // Rahbar: o'z bo'limiga kelgan va o'z bo'limidan ketgan so'rovlar
      const visible = await this.access.visibleDepartmentIds(actor);
      const ids = visible?.length ? visible : ['__none__'];
      where.OR = [
        { toDepartmentId: { in: ids } },
        { fromDepartmentId: { in: ids } },
        { assigneeId: actor.id },
        { fromUserId: actor.id },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.taskRequest.findMany({
        where,
        include: TASK_INCLUDE,
        orderBy: [{ status: 'asc' }, { deadlineAt: 'asc' }, { createdAt: 'desc' }],
        take,
        skip,
      }),
      this.prisma.taskRequest.count({ where }),
    ]);

    return { items, total, take, skip };
  }

  async findOne(actor: AuthUser, id: string) {
    const task = await this.prisma.taskRequest.findUnique({
      where: { id },
      include: TASK_INCLUDE,
    });
    if (!task) throw new NotFoundException("So'rov topilmadi");
    return task;
  }

  /** Menga tegishli topshiriqlar (bot va Mini App uchun) */
  async myTasks(userId: string) {
    return this.prisma.taskRequest.findMany({
      where: {
        assigneeId: userId,
        status: { in: [TaskStatus.ACCEPTED, TaskStatus.IN_PROGRESS] },
      },
      include: {
        fromUser: { select: { fullName: true } },
        fromDepartment: { select: { name: true } },
      },
      orderBy: { deadlineAt: 'asc' },
      take: 30,
    });
  }

  private async assertCanManage(actor: AuthUser, departmentId: string) {
    if (this.access.isAdmin(actor)) return;
    if (!(await this.access.managesDepartment(actor, departmentId))) {
      throw new ForbiddenException("Bu bo'lim so'rovlarini boshqarish huquqingiz yo'q");
    }
  }

  humanDuration(minutes: number): string {
    if (minutes < 60) return `${minutes} daqiqa`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} soat`;
    const days = Math.floor(hours / 24);
    return `${days} kun ${hours % 24} soat`;
  }
}
