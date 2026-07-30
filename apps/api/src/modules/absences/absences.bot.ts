import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AbsenceStatus, SystemRole } from '@prisma/client';
import { TelegramService } from '../telegram/telegram.service';
import { AbsencesService } from './absences.service';
import type { AuthUser } from '../../common/auth/auth.types';

/**
 * Tasdiqlovchi rahbar yo'qlik so'rovini to'g'ridan-to'g'ri Telegramdan
 * tasdiqlaydi yoki rad etadi — panelga kirishi shart emas.
 */
@Injectable()
export class AbsencesBotHandlers implements OnModuleInit {
  private readonly logger = new Logger(AbsencesBotHandlers.name);

  constructor(
    private readonly telegram: TelegramService,
    private readonly absences: AbsencesService,
  ) {}

  onModuleInit() {
    const bot = this.telegram.bot;
    if (!bot) return;

    bot.callbackQuery(/^absence:(approve|reject):(.+)$/, async (ctx) => {
      const [, action, absenceId] = ctx.match!;

      const user = await this.telegram.resolveUser(ctx.from?.id);
      if (!user) {
        await ctx.answerCallbackQuery({ text: 'Tizimga ulanmagansiz', show_alert: true });
        return;
      }

      const isApprover =
        user.roles.includes(SystemRole.APPROVER) || user.roles.includes(SystemRole.ADMIN);

      if (!isApprover) {
        await ctx.answerCallbackQuery({
          text: 'Bu amal uchun huquqingiz yetarli emas',
          show_alert: true,
        });
        return;
      }

      const actor: AuthUser = {
        id: user.id,
        fullName: user.fullName,
        roles: user.roles,
        departmentId: user.departmentId,
        headOfDepartmentIds: [],
        source: 'miniapp',
      };

      try {
        await this.absences.decide(actor, absenceId, {
          status: action === 'approve' ? AbsenceStatus.APPROVED : AbsenceStatus.REJECTED,
        });

        const label = action === 'approve' ? '✅ Tasdiqlandi' : '❌ Rad etildi';
        await ctx.answerCallbackQuery({ text: label });

        // Tugmalarni olib tashlab, natijani xabar matniga qo'shamiz
        const original = ctx.callbackQuery.message?.text ?? '';
        await ctx.editMessageText(`${original}\n\n<b>${label}</b> — ${user.fullName}`, {
          parse_mode: 'HTML',
        });
      } catch (error) {
        const message = (error as any)?.response?.message ?? (error as Error).message;
        await ctx.answerCallbackQuery({ text: `❌ ${message}`, show_alert: true });
      }
    });

    this.logger.log("Bot: yo'qlik so'rovi handlerlari ro'yxatdan o'tdi");
  }
}
