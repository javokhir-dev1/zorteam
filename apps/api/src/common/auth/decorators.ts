import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import type { AuthUser } from './auth.types';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Autentifikatsiyasiz ochiq endpoint */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Faqat sanab o'tilgan rollardan biri bo'lsa ruxsat */
export const Roles = (...roles: SystemRole[]) => SetMetadata(ROLES_KEY, roles);

/** Joriy foydalanuvchini controller metodiga uzatish */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthUser | undefined = request.user;
    return data ? user?.[data] : user;
  },
);
