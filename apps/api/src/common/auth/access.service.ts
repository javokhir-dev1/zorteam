import { ForbiddenException, Injectable } from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './auth.types';

/**
 * Huquqlarni bir joyda tekshirish.
 * Asosiy qoida: bo'lim rahbari faqat O'Z bo'limi hodimlariga ta'sir qila oladi.
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  isAdmin(user: AuthUser): boolean {
    return user.roles.includes(SystemRole.ADMIN);
  }

  isApprover(user: AuthUser): boolean {
    return user.roles.includes(SystemRole.APPROVER) || this.isAdmin(user);
  }

  isHead(user: AuthUser): boolean {
    return user.roles.includes(SystemRole.DEPT_HEAD);
  }

  canRead(user: AuthUser): boolean {
    return (
      this.isAdmin(user) ||
      user.roles.includes(SystemRole.VIEWER) ||
      this.isHead(user) ||
      this.isApprover(user)
    );
  }

  /** Rahbar shu bo'limga (yoki uning ostki bo'limiga) rahbarmi */
  async managesDepartment(user: AuthUser, departmentId: string): Promise<boolean> {
    if (this.isAdmin(user)) return true;
    if (user.headOfDepartmentIds.includes(departmentId)) return true;

    // Ostki bo'limlar ham rahbar tasarrufida
    if (user.headOfDepartmentIds.length === 0) return false;
    const dept = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: { parentId: true },
    });
    if (!dept?.parentId) return false;
    return this.managesDepartment(user, dept.parentId);
  }

  /** Rahbar shu hodimga rahbarmi */
  async managesUser(user: AuthUser, targetUserId: string): Promise<boolean> {
    if (this.isAdmin(user)) return true;
    if (user.id === targetUserId) return true;

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { departmentId: true },
    });
    if (!target?.departmentId) return false;
    return this.managesDepartment(user, target.departmentId);
  }

  async assertManagesUser(user: AuthUser, targetUserId: string): Promise<void> {
    if (!(await this.managesUser(user, targetUserId))) {
      throw new ForbiddenException('Bu hodim sizning tasarrufingizda emas');
    }
  }

  async assertManagesDepartment(user: AuthUser, departmentId: string): Promise<void> {
    if (!(await this.managesDepartment(user, departmentId))) {
      throw new ForbiddenException("Bu bo'lim sizning tasarrufingizda emas");
    }
  }

  /**
   * Foydalanuvchi ko'ra oladigan bo'lim ID'lari.
   * Admin/Kuzatuvchi uchun null qaytadi — ya'ni cheklov yo'q.
   */
  async visibleDepartmentIds(user: AuthUser): Promise<string[] | null> {
    if (this.isAdmin(user) || user.roles.includes(SystemRole.VIEWER)) return null;

    const roots = [...user.headOfDepartmentIds];
    if (user.departmentId) roots.push(user.departmentId);
    if (roots.length === 0) return [];

    const all = new Set<string>(roots);
    let frontier = roots;

    // Ostki bo'limlarni to'plash
    while (frontier.length) {
      const children = await this.prisma.department.findMany({
        where: { parentId: { in: frontier } },
        select: { id: true },
      });
      frontier = children.map((c) => c.id).filter((id) => !all.has(id));
      frontier.forEach((id) => all.add(id));
    }

    return [...all];
  }
}
