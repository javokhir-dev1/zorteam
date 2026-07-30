import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SystemRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthUser } from '../../common/auth/auth.types';

const PANEL_ROLES: SystemRole[] = [
  SystemRole.ADMIN,
  SystemRole.APPROVER,
  SystemRole.DEPT_HEAD,
  SystemRole.VIEWER,
];

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(login: string, password: string) {
    const normalized = login.trim().toLowerCase();

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: normalized }, { phone: login.trim() }],
      },
      select: {
        id: true,
        fullName: true,
        position: true,
        roles: true,
        status: true,
        passwordHash: true,
        departmentId: true,
        department: { select: { id: true, name: true } },
      },
    });

    if (!user?.passwordHash) {
      throw new UnauthorizedException("Login yoki parol noto'g'ri");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("Login yoki parol noto'g'ri");
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Hisobingiz faol emas');
    }

    const hasPanelAccess = user.roles.some((r) => PANEL_ROLES.includes(r));
    if (!hasPanelAccess) {
      throw new UnauthorizedException(
        'Sizda panelga kirish huquqi yo\'q. Telegram bot orqali foydalaning.',
      );
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = await this.jwt.signAsync({ sub: user.id, roles: user.roles });

    return {
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        position: user.position,
        roles: user.roles,
        department: user.department,
      },
    };
  }

  /**
   * Telegram orqali tasdiqlangan rahbarga admin panel uchun kalit beradi.
   * Shunda telefonda parol terib o'tirmasdan, Mini App'dagi tugma orqali
   * to'g'ridan-to'g'ri panelga kiriladi.
   */
  async panelToken(auth: AuthUser) {
    const hasPanelAccess = auth.roles.some((role) => PANEL_ROLES.includes(role));
    if (!hasPanelAccess) {
      throw new UnauthorizedException("Sizda panelga kirish huquqi yo'q");
    }

    const token = await this.jwt.signAsync({ sub: auth.id, roles: auth.roles });

    await this.prisma.user.update({
      where: { id: auth.id },
      data: { lastLoginAt: new Date() },
    });

    return { token, roles: auth.roles };
  }

  async me(auth: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: auth.id },
      select: {
        id: true,
        fullName: true,
        position: true,
        roles: true,
        employeeNo: true,
        phone: true,
        email: true,
        telegramId: true,
        department: { select: { id: true, name: true, type: true } },
        headOf: {
          select: { department: { select: { id: true, name: true } } },
        },
      },
    });

    return {
      ...user,
      headOf: user?.headOf.map((h) => h.department) ?? [],
      source: auth.source,
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user?.passwordHash) {
      throw new BadRequestException('Parol o\'rnatilmagan');
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new BadRequestException("Joriy parol noto'g'ri");
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await bcrypt.hash(newPassword, 10) },
    });

    return { ok: true };
  }
}
