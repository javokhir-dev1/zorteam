import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { verifyInitDataDetailed } from '../utils/telegram-init-data';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators';
import type { AuthUser } from './auth.types';

/**
 * Ikki xil kirishni qo'llab-quvvatlaydi:
 *  1. Admin panel  — Authorization: Bearer <JWT>
 *  2. Mini App     — X-Telegram-Init-Data: <initData>
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();

    const authUser =
      (await this.fromJwt(request)) ?? (await this.fromTelegram(request));

    if (!authUser) {
      throw new UnauthorizedException('Avtorizatsiya talab qilinadi');
    }

    request.user = authUser;

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (requiredRoles?.length) {
      const allowed = authUser.roles.some((r) => requiredRoles.includes(r));
      if (!allowed) {
        throw new ForbiddenException('Bu amal uchun huquqingiz yetarli emas');
      }
    }

    return true;
  }

  private async fromJwt(request: any): Promise<AuthUser | null> {
    const header: string | undefined = request.headers?.authorization;
    if (!header?.startsWith('Bearer ')) return null;

    try {
      const payload = await this.jwt.verifyAsync(header.slice(7), {
        secret: this.config.get<string>('jwt.secret'),
      });
      return this.loadUser(payload.sub, 'panel');
    } catch {
      throw new UnauthorizedException('Sessiya muddati tugagan, qayta kiring');
    }
  }

  private async fromTelegram(request: any): Promise<AuthUser | null> {
    const initData: string | undefined = request.headers?.['x-telegram-init-data'];
    if (!initData) return null;

    const botToken = this.config.get<string>('telegram.token') ?? '';
    const { data: parsed, reason } = verifyInitDataDetailed(initData, botToken);

    if (!parsed?.user?.id) {
      this.logger.warn(`Mini App tekshiruvi o'tmadi: ${reason ?? 'noma\'lum sabab'}`);
      throw new UnauthorizedException(`Telegram ma'lumotlari tasdiqlanmadi (${reason ?? '—'})`);
    }

    const user = await this.prisma.user.findUnique({
      where: { telegramId: BigInt(parsed.user.id) },
      select: { id: true },
    });

    if (!user) {
      // Ariza yuborganmi? Shunga qarab tushunarli javob beramiz
      const request = await this.prisma.registrationRequest.findUnique({
        where: { telegramId: BigInt(parsed.user.id) },
        select: { status: true, decisionNote: true },
      });

      this.logger.warn(
        `Mini App: Telegram ID ${parsed.user.id} (@${parsed.user.username ?? '—'}) tizimda topilmadi` +
          (request ? ` — ariza holati: ${request.status}` : ' — ariza yo\'q'),
      );

      if (request?.status === 'PENDING') {
        throw new UnauthorizedException(
          "Arizangiz ko'rib chiqilmoqda. Rahbariyat tasdiqlagach tizim ochiladi.",
        );
      }

      if (request?.status === 'REJECTED') {
        throw new UnauthorizedException(
          `Arizangiz rad etilgan${request.decisionNote ? `: ${request.decisionNote}` : ''}. Botga /start yuborib qayta ariza bering.`,
        );
      }

      throw new UnauthorizedException(
        "Siz hali ro'yxatdan o'tmagansiz. Botga /start yuboring va arizani to'ldiring.",
      );
    }

    return this.loadUser(user.id, 'miniapp');
  }

  private async loadUser(userId: string, source: 'panel' | 'miniapp'): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        roles: true,
        status: true,
        departmentId: true,
        headOf: { select: { departmentId: true } },
      },
    });

    if (!user) throw new UnauthorizedException('Foydalanuvchi topilmadi');
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Hisobingiz faol emas');
    }

    return {
      id: user.id,
      fullName: user.fullName,
      roles: user.roles,
      departmentId: user.departmentId,
      headOfDepartmentIds: user.headOf.map((h) => h.departmentId),
      source,
    };
  }
}
