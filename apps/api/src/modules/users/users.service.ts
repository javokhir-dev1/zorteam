import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, SystemRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccessService } from '../../common/auth/access.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto, UpdateUserDto, ListUsersQuery } from './dto';
import type { AuthUser } from '../../common/auth/auth.types';

const USER_SELECT = {
  id: true,
  employeeNo: true,
  fullName: true,
  position: true,
  phone: true,
  email: true,
  status: true,
  roles: true,
  telegramId: true,
  telegramUsername: true,
  telegramLinkedAt: true,
  botBlocked: true,
  hiredAt: true,
  createdAt: true,
  department: { select: { id: true, name: true, code: true, type: true } },
  schedule: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async list(actor: AuthUser, query: ListUsersQuery) {
    const take = Math.min(Number(query.take ?? 50), 200);
    const skip = Number(query.skip ?? 0);

    const where: Prisma.UserWhereInput = {};

    // Bo'lim rahbari faqat o'z tasarrufidagi hodimlarni ko'radi
    const visible = await this.access.visibleDepartmentIds(actor);
    if (visible !== null) {
      where.departmentId = { in: visible.length ? visible : ['__none__'] };
    }

    if (query.departmentId) where.departmentId = query.departmentId;
    if (query.status) where.status = query.status;
    if (query.role) where.roles = { has: query.role };
    if (query.linked === 'true') where.telegramId = { not: null };
    if (query.linked === 'false') where.telegramId = null;

    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { position: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { employeeNo: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: USER_SELECT,
        orderBy: [{ status: 'asc' }, { fullName: 'asc' }],
        take,
        skip,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, take, skip };
  }

  async findOne(actor: AuthUser, id: string) {
    await this.access.assertManagesUser(actor, id);

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...USER_SELECT,
        headOf: { select: { department: { select: { id: true, name: true } } } },
      },
    });

    if (!user) throw new NotFoundException('Hodim topilmadi');

    return { ...user, headOf: user.headOf.map((h) => h.department) };
  }

  async create(actor: AuthUser, dto: CreateUserDto) {
    await this.assertUniqueContacts(dto.phone, dto.email);

    const roles = dto.roles?.length ? dto.roles : [SystemRole.EMPLOYEE];

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName.trim(),
        position: dto.position.trim(),
        employeeNo: dto.employeeNo?.trim() || null,
        phone: dto.phone?.trim() || null,
        email: dto.email?.trim().toLowerCase() || null,
        departmentId: dto.departmentId || null,
        scheduleId: dto.scheduleId || null,
        hiredAt: dto.hiredAt ? new Date(dto.hiredAt) : null,
        roles,
        passwordHash: dto.password ? await bcrypt.hash(dto.password, 10) : null,
      },
      select: USER_SELECT,
    });

    await this.audit.log(actor.id, 'user.create', 'User', user.id, null, user);
    return user;
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
    const before = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!before) throw new NotFoundException('Hodim topilmadi');

    // Rahbar o'z hodimining ma'lumotini tahrirlashi mumkin, lekin rol bera olmaydi
    if (!this.access.isAdmin(actor)) {
      await this.access.assertManagesUser(actor, id);
      if (dto.roles || dto.password) {
        throw new BadRequestException('Rol va parolni faqat administrator o\'zgartira oladi');
      }
    }

    await this.assertUniqueContacts(dto.phone, dto.email, id);

    const after = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName?.trim(),
        position: dto.position?.trim(),
        employeeNo: dto.employeeNo === undefined ? undefined : dto.employeeNo?.trim() || null,
        phone: dto.phone === undefined ? undefined : dto.phone?.trim() || null,
        email: dto.email === undefined ? undefined : dto.email?.trim().toLowerCase() || null,
        departmentId: dto.departmentId === undefined ? undefined : dto.departmentId || null,
        scheduleId: dto.scheduleId === undefined ? undefined : dto.scheduleId || null,
        hiredAt: dto.hiredAt ? new Date(dto.hiredAt) : undefined,
        status: dto.status,
        roles: dto.roles ? { set: dto.roles } : undefined,
        passwordHash: dto.password ? await bcrypt.hash(dto.password, 10) : undefined,
      },
      select: USER_SELECT,
    });

    await this.audit.log(actor.id, 'user.update', 'User', id, before, after);
    return after;
  }

  /**
   * Telegram botga ulanish uchun bir martalik kod va havola yaratadi.
   * Hodim havolani bosadi → bot /start CODE oladi → akkaunt bog'lanadi.
   */
  async createInviteCode(actor: AuthUser, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, telegramId: true },
    });
    if (!user) throw new NotFoundException('Hodim topilmadi');
    if (user.telegramId) {
      throw new BadRequestException('Bu hodim allaqachon Telegramga ulangan');
    }

    await this.access.assertManagesUser(actor, userId);

    // Eski kodlarni bekor qilish
    await this.prisma.inviteCode.deleteMany({ where: { userId, usedAt: null } });

    const code = randomBytes(8).toString('base64url');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 kun

    await this.prisma.inviteCode.create({ data: { code, userId, expiresAt } });

    const botUsername = this.config.get<string>('telegram.username');
    const link = botUsername ? `https://t.me/${botUsername}?start=${code}` : null;

    await this.audit.log(actor.id, 'user.invite', 'User', userId, null, { code });

    return { code, link, expiresAt, user: { id: user.id, fullName: user.fullName } };
  }

  /** Telegram bog'lanishini uzish (telefon almashtirilganda kerak bo'ladi) */
  async unlinkTelegram(actor: AuthUser, userId: string) {
    await this.access.assertManagesUser(actor, userId);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        telegramId: null,
        telegramUsername: null,
        telegramLinkedAt: null,
        botBlocked: false,
      },
      select: USER_SELECT,
    });

    await this.audit.log(actor.id, 'user.unlinkTelegram', 'User', userId);
    return user;
  }

  /** Rahbar biriktirish uchun: shu bo'lim (va ostki bo'limlar) hodimlari */
  async listByDepartments(departmentIds: string[]) {
    return this.prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        departmentId: { in: departmentIds },
      },
      select: {
        id: true,
        fullName: true,
        position: true,
        department: { select: { id: true, name: true } },
      },
      orderBy: { fullName: 'asc' },
    });
  }

  private async assertUniqueContacts(phone?: string | null, email?: string | null, exceptId?: string) {
    if (phone?.trim()) {
      const existing = await this.prisma.user.findFirst({
        where: { phone: phone.trim(), id: { not: exceptId } },
        select: { id: true, fullName: true },
      });
      if (existing) {
        throw new BadRequestException(`Bu telefon raqam band: ${existing.fullName}`);
      }
    }

    if (email?.trim()) {
      const existing = await this.prisma.user.findFirst({
        where: { email: email.trim().toLowerCase(), id: { not: exceptId } },
        select: { id: true, fullName: true },
      });
      if (existing) {
        throw new BadRequestException(`Bu email band: ${existing.fullName}`);
      }
    }
  }
}
