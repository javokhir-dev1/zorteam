import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { SystemRole, UserStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateDepartmentDto, UpdateDepartmentDto } from './dto';
import type { AuthUser } from '../../common/auth/auth.types';

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(includeInactive = false) {
    const departments = await this.prisma.department.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      include: {
        schedule: { select: { id: true, name: true } },
        heads: {
          select: { user: { select: { id: true, fullName: true, position: true } } },
        },
        _count: { select: { users: true, children: true } },
      },
    });

    return departments.map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code,
      type: d.type,
      parentId: d.parentId,
      isActive: d.isActive,
      schedule: d.schedule,
      heads: d.heads.map((h) => h.user),
      employeeCount: d._count.users,
      childCount: d._count.children,
    }));
  }

  /** Daraxt ko'rinishida — admin panelda ierarxiyani ko'rsatish uchun */
  async tree() {
    const flat = await this.list(true);
    const byId = new Map(flat.map((d) => [d.id, { ...d, children: [] as any[] }]));
    const roots: any[] = [];

    for (const dept of byId.values()) {
      if (dept.parentId && byId.has(dept.parentId)) {
        byId.get(dept.parentId)!.children.push(dept);
      } else {
        roots.push(dept);
      }
    }
    return roots;
  }

  async findOne(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true } },
        children: { select: { id: true, name: true, code: true } },
        schedule: true,
        heads: {
          select: { user: { select: { id: true, fullName: true, position: true } } },
        },
        users: {
          where: { status: UserStatus.ACTIVE },
          select: { id: true, fullName: true, position: true, telegramId: true },
          orderBy: { fullName: 'asc' },
        },
      },
    });

    if (!department) throw new NotFoundException("Bo'lim topilmadi");

    return {
      ...department,
      heads: department.heads.map((h) => h.user),
    };
  }

  async create(actor: AuthUser, dto: CreateDepartmentDto) {
    const exists = await this.prisma.department.findUnique({ where: { code: dto.code } });
    if (exists) throw new BadRequestException('Bu kod band');

    const department = await this.prisma.department.create({
      data: {
        name: dto.name,
        code: dto.code,
        type: dto.type,
        parentId: dto.parentId || null,
        scheduleId: dto.scheduleId || null,
      },
    });

    await this.audit.log(actor.id, 'department.create', 'Department', department.id, null, department);
    return department;
  }

  async update(actor: AuthUser, id: string, dto: UpdateDepartmentDto) {
    const before = await this.prisma.department.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Bo'lim topilmadi");

    if (dto.parentId && (await this.wouldCreateCycle(id, dto.parentId))) {
      throw new BadRequestException("Bo'lim o'zining ostki bo'limiga bo'ysuna olmaydi");
    }

    const after = await this.prisma.department.update({
      where: { id },
      data: {
        name: dto.name,
        code: dto.code,
        type: dto.type,
        parentId: dto.parentId === undefined ? undefined : dto.parentId || null,
        scheduleId: dto.scheduleId === undefined ? undefined : dto.scheduleId || null,
        isActive: dto.isActive,
      },
    });

    await this.audit.log(actor.id, 'department.update', 'Department', id, before, after);
    return after;
  }

  /**
   * Bo'lim rahbarlarini belgilash.
   * Rahbar bo'lgan hodimga DEPT_HEAD roli avtomatik qo'shiladi,
   * boshqa bo'limga ham rahbar bo'lmasa — olib tashlanadi.
   */
  async setHeads(actor: AuthUser, departmentId: string, userIds: string[]) {
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
      include: { heads: true },
    });
    if (!department) throw new NotFoundException("Bo'lim topilmadi");

    const previousIds = department.heads.map((h) => h.userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.departmentHead.deleteMany({ where: { departmentId } });

      if (userIds.length) {
        await tx.departmentHead.createMany({
          data: userIds.map((userId) => ({ userId, departmentId })),
          skipDuplicates: true,
        });
      }

      // Yangi rahbarlarga DEPT_HEAD rolini qo'shish
      for (const userId of userIds) {
        const user = await tx.user.findUnique({ where: { id: userId }, select: { roles: true } });
        if (user && !user.roles.includes(SystemRole.DEPT_HEAD)) {
          await tx.user.update({
            where: { id: userId },
            data: { roles: { set: [...user.roles, SystemRole.DEPT_HEAD] } },
          });
        }
      }

      // Rahbarlikdan chiqqanlardan rolni olib tashlash (boshqa bo'limda rahbar bo'lmasa)
      const removed = previousIds.filter((id) => !userIds.includes(id));
      for (const userId of removed) {
        const stillHead = await tx.departmentHead.count({ where: { userId } });
        if (stillHead > 0) continue;

        const user = await tx.user.findUnique({ where: { id: userId }, select: { roles: true } });
        if (user?.roles.includes(SystemRole.DEPT_HEAD)) {
          await tx.user.update({
            where: { id: userId },
            data: { roles: { set: user.roles.filter((r) => r !== SystemRole.DEPT_HEAD) } },
          });
        }
      }
    });

    await this.audit.log(
      actor.id,
      'department.setHeads',
      'Department',
      departmentId,
      { heads: previousIds },
      { heads: userIds },
    );

    return this.findOne(departmentId);
  }

  private async wouldCreateCycle(departmentId: string, newParentId: string): Promise<boolean> {
    let cursor: string | null = newParentId;
    const seen = new Set<string>();

    while (cursor) {
      if (cursor === departmentId) return true;
      if (seen.has(cursor)) return true;
      seen.add(cursor);

      const parent = await this.prisma.department.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      cursor = parent?.parentId ?? null;
    }
    return false;
  }
}
