import { SystemRole } from '@prisma/client';

export interface AuthUser {
  id: string;
  fullName: string;
  roles: SystemRole[];
  departmentId: string | null;
  /** Bu foydalanuvchi rahbarlik qiladigan bo'limlar */
  headOfDepartmentIds: string[];
  /** Kirish usuli: admin panel yoki Telegram Mini App */
  source: 'panel' | 'miniapp';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
