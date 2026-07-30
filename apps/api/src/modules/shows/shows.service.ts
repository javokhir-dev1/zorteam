import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentStatus,
  EpisodeStatus,
  NotificationType,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccessService } from '../../common/auth/access.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../telegram/notifications.service';
import { EvaluationsService } from '../evaluations/evaluations.service';
import { assignmentKeyboard } from '../telegram/keyboards';
import { fmtDateTime } from '../../common/utils/dates';
import type { AuthUser } from '../../common/auth/auth.types';
import type {
  AssignDto,
  CreateEpisodeDto,
  CreateShowDto,
  UpdateEpisodeDto,
  UpdateShowDto,
  UpsertCrewRoleDto,
} from './dto';

@Injectable()
export class ShowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly evaluations: EvaluationsService,
  ) {}

  // ============================================================
  //  Ko'rsatuvlar
  // ============================================================

  async listShows(includeInactive = false) {
    const shows = await this.prisma.show.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: {
        production: { select: { id: true, name: true } },
        leaders: { select: { user: { select: { id: true, fullName: true } } } },
        _count: { select: { episodes: true } },
      },
      orderBy: { name: 'asc' },
    });

    return shows.map((show) => ({
      ...show,
      leaders: show.leaders.map((l) => l.user),
      episodeCount: show._count.episodes,
    }));
  }

  async findShow(id: string) {
    const show = await this.prisma.show.findUnique({
      where: { id },
      include: {
        production: { select: { id: true, name: true } },
        leaders: { select: { user: { select: { id: true, fullName: true, position: true } } } },
        episodes: {
          orderBy: [{ airAt: 'desc' }, { createdAt: 'desc' }],
          take: 50,
          include: { _count: { select: { assignments: true } } },
        },
      },
    });

    if (!show) throw new NotFoundException("Ko'rsatuv topilmadi");

    return { ...show, leaders: show.leaders.map((l) => l.user) };
  }

  async createShow(actor: AuthUser, dto: CreateShowDto) {
    const exists = await this.prisma.show.findUnique({ where: { code: dto.code } });
    if (exists) throw new BadRequestException('Bu kod band');

    const show = await this.prisma.show.create({ data: dto });
    await this.audit.log(actor.id, 'show.create', 'Show', show.id, null, show);
    return show;
  }

  async updateShow(actor: AuthUser, id: string, dto: UpdateShowDto) {
    const before = await this.prisma.show.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Ko'rsatuv topilmadi");

    const after = await this.prisma.show.update({ where: { id }, data: dto });
    await this.audit.log(actor.id, 'show.update', 'Show', id, before, after);
    return after;
  }

  /** Ko'rsatuvga javobgar rahbarlarni belgilash (adminning ishi) */
  async setLeaders(actor: AuthUser, showId: string, userIds: string[]) {
    const show = await this.prisma.show.findUnique({ where: { id: showId } });
    if (!show) throw new NotFoundException("Ko'rsatuv topilmadi");

    await this.prisma.$transaction(async (tx) => {
      await tx.showLeader.deleteMany({ where: { showId } });
      if (userIds.length) {
        await tx.showLeader.createMany({
          data: userIds.map((userId) => ({ userId, showId })),
          skipDuplicates: true,
        });
      }
    });

    await this.audit.log(actor.id, 'show.setLeaders', 'Show', showId, null, { userIds });
    return this.findShow(showId);
  }

  // ============================================================
  //  Efirlar (ko'rsatuv sonlari)
  // ============================================================

  async listEpisodes(params: { showId?: string; from?: string; to?: string; status?: EpisodeStatus }) {
    const where: Prisma.ShowEpisodeWhereInput = {};
    if (params.showId) where.showId = params.showId;
    if (params.status) where.status = params.status;
    if (params.from || params.to) {
      where.airAt = {
        gte: params.from ? new Date(params.from) : undefined,
        lte: params.to ? new Date(params.to) : undefined,
      };
    }

    return this.prisma.showEpisode.findMany({
      where,
      include: {
        show: { select: { id: true, name: true, code: true } },
        assignments: {
          include: {
            user: { select: { id: true, fullName: true } },
            crewRole: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ airAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  async findEpisode(id: string) {
    const episode = await this.prisma.showEpisode.findUnique({
      where: { id },
      include: {
        show: {
          select: {
            id: true,
            name: true,
            code: true,
            production: { select: { id: true, name: true } },
          },
        },
        assignments: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                position: true,
                department: { select: { id: true, name: true } },
              },
            },
            crewRole: { select: { id: true, name: true, code: true, sortOrder: true } },
            assignedBy: { select: { id: true, fullName: true } },
          },
          orderBy: { crewRole: { sortOrder: 'asc' } },
        },
      },
    });

    if (!episode) throw new NotFoundException('Efir topilmadi');
    return episode;
  }

  async createEpisode(actor: AuthUser, showId: string, dto: CreateEpisodeDto) {
    const show = await this.prisma.show.findUnique({ where: { id: showId } });
    if (!show) throw new NotFoundException("Ko'rsatuv topilmadi");

    const episode = await this.prisma.showEpisode.create({
      data: {
        showId,
        title: dto.title,
        number: dto.number,
        recordAt: dto.recordAt ? new Date(dto.recordAt) : null,
        airAt: dto.airAt ? new Date(dto.airAt) : null,
        location: dto.location,
      },
    });

    await this.audit.log(actor.id, 'episode.create', 'ShowEpisode', episode.id, null, episode);
    return episode;
  }

  async updateEpisode(actor: AuthUser, id: string, dto: UpdateEpisodeDto) {
    const before = await this.prisma.showEpisode.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Efir topilmadi');

    const after = await this.prisma.showEpisode.update({
      where: { id },
      data: {
        title: dto.title,
        number: dto.number,
        recordAt: dto.recordAt ? new Date(dto.recordAt) : undefined,
        airAt: dto.airAt ? new Date(dto.airAt) : undefined,
        location: dto.location,
        status: dto.status,
      },
    });

    await this.audit.log(actor.id, 'episode.update', 'ShowEpisode', id, before, after);

    // Efir yakunlangach baholash oynasi avtomatik ochiladi
    if (after.status === EpisodeStatus.DONE && before.status !== EpisodeStatus.DONE) {
      await this.evaluations.openForEpisode(id);
    }

    return after;
  }

  // ============================================================
  //  Jamoa biriktirish
  // ============================================================

  /**
   * Hodimni efirga biriktirish.
   *
   * Asosiy qoida: bo'lim rahbari faqat O'Z bo'limi hodimini biriktira oladi.
   * Ya'ni operatorlar rahbari montajchi qo'ya olmaydi.
   */
  async assign(actor: AuthUser, episodeId: string, dto: AssignDto) {
    const episode = await this.prisma.showEpisode.findUnique({
      where: { id: episodeId },
      include: { show: { select: { id: true, name: true } } },
    });
    if (!episode) throw new NotFoundException('Efir topilmadi');

    const [user, crewRole] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: dto.userId },
        select: { id: true, fullName: true, status: true, departmentId: true },
      }),
      this.prisma.crewRole.findUnique({ where: { id: dto.crewRoleId } }),
    ]);

    if (!user) throw new NotFoundException('Hodim topilmadi');
    if (user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException('Bu hodim faol emas');
    }
    if (!crewRole) throw new NotFoundException('Jamoa roli topilmadi');

    if (!this.access.isAdmin(actor)) {
      // Rahbar shu hodimga rahbarmi?
      if (!(await this.access.managesUser(actor, dto.userId))) {
        throw new ForbiddenException(
          "Siz faqat o'z bo'limingiz hodimlarini biriktira olasiz",
        );
      }

      // Rol boshqa bo'limga tegishli bo'lsa ham to'sib qo'yamiz
      if (crewRole.departmentId && !(await this.access.managesDepartment(actor, crewRole.departmentId))) {
        throw new ForbiddenException(`"${crewRole.name}" roli sizning bo'limingizga tegishli emas`);
      }
    }

    const existing = await this.prisma.assignment.findFirst({
      where: { episodeId, userId: dto.userId, crewRoleId: dto.crewRoleId },
    });
    if (existing) {
      throw new BadRequestException('Bu hodim shu rolga allaqachon biriktirilgan');
    }

    const assignment = await this.prisma.assignment.create({
      data: {
        episodeId,
        userId: dto.userId,
        crewRoleId: dto.crewRoleId,
        assignedById: actor.id,
        note: dto.note,
      },
      include: {
        crewRole: { select: { name: true } },
        episode: { select: { title: true, airAt: true, recordAt: true, location: true } },
      },
    });

    await this.audit.log(actor.id, 'assignment.create', 'Assignment', assignment.id, null, assignment);

    // Hodimga botga xabar
    const when = assignment.episode.recordAt ?? assignment.episode.airAt;
    await this.notifications.notify({
      userId: dto.userId,
      type: NotificationType.ASSIGNMENT_CREATED,
      title: "🎬 Ko'rsatuvga biriktirildingiz",
      body: [
        `Ko'rsatuv: <b>${episode.show.name}</b>`,
        assignment.episode.title ? `Efir: ${assignment.episode.title}` : '',
        `Rolingiz: <b>${assignment.crewRole.name}</b>`,
        when ? `Vaqti: ${fmtDateTime(when)}` : '',
        assignment.episode.location ? `Joyi: ${assignment.episode.location}` : '',
        dto.note ? `\nIzoh: ${dto.note}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      payload: { assignmentId: assignment.id, episodeId },
      extra: { reply_markup: assignmentKeyboard(assignment.id) },
    });

    return assignment;
  }

  async unassign(actor: AuthUser, assignmentId: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { user: { select: { id: true, fullName: true } } },
    });
    if (!assignment) throw new NotFoundException('Biriktirish topilmadi');

    if (!this.access.isAdmin(actor)) {
      await this.access.assertManagesUser(actor, assignment.userId);
    }

    await this.prisma.assignment.delete({ where: { id: assignmentId } });
    await this.audit.log(actor.id, 'assignment.delete', 'Assignment', assignmentId, assignment, null);

    return { ok: true };
  }

  /** Hodim biriktirishga javob beradi (bot tugmasi orqali) */
  async respondToAssignment(userId: string, assignmentId: string, accept: boolean) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        episode: { include: { show: { select: { name: true } } } },
        crewRole: { select: { name: true } },
      },
    });

    if (!assignment) throw new NotFoundException('Biriktirish topilmadi');
    if (assignment.userId !== userId) {
      throw new ForbiddenException('Bu biriktirish sizga tegishli emas');
    }

    const updated = await this.prisma.assignment.update({
      where: { id: assignmentId },
      data: {
        status: accept ? AssignmentStatus.CONFIRMED : AssignmentStatus.DECLINED,
        respondedAt: new Date(),
      },
    });

    // Biriktirgan rahbarga xabar
    await this.notifications.notify({
      userId: assignment.assignedById,
      type: NotificationType.ASSIGNMENT_CREATED,
      title: accept ? '✅ Biriktirish tasdiqlandi' : '❌ Biriktirishdan bosh tortildi',
      body: [
        `Ko'rsatuv: ${assignment.episode.show.name}`,
        `Rol: ${assignment.crewRole.name}`,
      ].join('\n'),
      payload: { assignmentId },
    });

    return updated;
  }

  /** Hodimning biriktirilgan efirlari (Mini App / bot) */
  async myAssignments(userId: string, onlyUpcoming = true) {
    return this.prisma.assignment.findMany({
      where: {
        userId,
        status: { not: AssignmentStatus.REPLACED },
        episode: onlyUpcoming
          ? {
              status: { in: [EpisodeStatus.PLANNED, EpisodeStatus.IN_PROGRESS] },
            }
          : undefined,
      },
      include: {
        crewRole: { select: { name: true } },
        episode: {
          include: { show: { select: { id: true, name: true, code: true } } },
        },
      },
      orderBy: [{ episode: { recordAt: 'asc' } }, { assignedAt: 'desc' }],
      take: 50,
    });
  }

  // ============================================================
  //  Jamoa rollari (kengaytiriladigan)
  // ============================================================

  listCrewRoles() {
    return this.prisma.crewRole.findMany({
      where: { isActive: true },
      include: { department: { select: { id: true, name: true } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async upsertCrewRole(actor: AuthUser, dto: UpsertCrewRoleDto, id?: string) {
    const role = id
      ? await this.prisma.crewRole.update({
          where: { id },
          data: {
            name: dto.name,
            code: dto.code,
            departmentId: dto.departmentId || null,
            sortOrder: dto.sortOrder,
            isActive: dto.isActive,
          },
        })
      : await this.prisma.crewRole.create({
          data: {
            name: dto.name,
            code: dto.code,
            departmentId: dto.departmentId || null,
            sortOrder: dto.sortOrder ?? 0,
          },
        });

    await this.audit.log(actor.id, id ? 'crewRole.update' : 'crewRole.create', 'CrewRole', role.id, null, role);
    return role;
  }

  /**
   * Rahbar biriktirish uchun tanlashi mumkin bo'lgan hodimlar.
   * Faqat uning tasarrufidagi bo'limlardan.
   */
  async assignableUsers(actor: AuthUser, crewRoleId?: string) {
    const visible = await this.access.visibleDepartmentIds(actor);

    const where: Prisma.UserWhereInput = { status: UserStatus.ACTIVE };

    if (visible !== null) {
      where.departmentId = { in: visible.length ? visible : ['__none__'] };
    }

    // Rol biror bo'limga bog'langan bo'lsa, shu bo'lim hodimlarini ko'rsatamiz
    if (crewRoleId) {
      const crewRole = await this.prisma.crewRole.findUnique({ where: { id: crewRoleId } });
      if (crewRole?.departmentId) {
        const allowed =
          visible === null || visible.includes(crewRole.departmentId)
            ? crewRole.departmentId
            : null;
        if (allowed) where.departmentId = allowed;
      }
    }

    return this.prisma.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        position: true,
        department: { select: { id: true, name: true } },
      },
      orderBy: { fullName: 'asc' },
    });
  }
}
