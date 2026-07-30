import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TelegramService } from '../telegram/telegram.service';
import { ShowsService } from './shows.service';
import { BTN } from '../telegram/keyboards';
import { fmtDateTime } from '../../common/utils/dates';

@Injectable()
export class ShowsBotHandlers implements OnModuleInit {
  private readonly logger = new Logger(ShowsBotHandlers.name);

  constructor(
    private readonly telegram: TelegramService,
    private readonly shows: ShowsService,
  ) {}

  onModuleInit() {
    const bot = this.telegram.bot;
    if (!bot) return;

    bot.hears(BTN.MY_SHOWS, async (ctx) => {
      const user = await this.telegram.resolveUser(ctx.from?.id);
      if (!user) return;

      const assignments = await this.shows.myAssignments(user.id, true);

      if (!assignments.length) {
        await ctx.reply("Hozircha sizga biriktirilgan ko'rsatuv yo'q.");
        return;
      }

      const lines = assignments.map((a) => {
        const when = a.episode.recordAt ?? a.episode.airAt;
        const status =
          a.status === 'CONFIRMED' ? '✅' : a.status === 'DECLINED' ? '❌' : '⏳';
        return [
          `${status} <b>${a.episode.show.name}</b>`,
          a.episode.title ? `   Efir: ${a.episode.title}` : '',
          `   Rol: ${a.crewRole.name}`,
          when ? `   Vaqti: ${fmtDateTime(when)}` : '',
          a.episode.location ? `   Joyi: ${a.episode.location}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      });

      await ctx.reply(["<b>🎬 Biriktirilgan ko'rsatuvlar</b>", '', ...lines].join('\n\n'), {
        parse_mode: 'HTML',
      });
    });

    bot.callbackQuery(/^assign:(confirm|decline):(.+)$/, async (ctx) => {
      const [, action, assignmentId] = ctx.match!;

      const user = await this.telegram.resolveUser(ctx.from?.id);
      if (!user) {
        await ctx.answerCallbackQuery({ text: 'Tizimga ulanmagansiz', show_alert: true });
        return;
      }

      try {
        await this.shows.respondToAssignment(user.id, assignmentId, action === 'confirm');

        const label = action === 'confirm' ? '✅ Tasdiqladingiz' : '❌ Bosh tortdingiz';
        await ctx.answerCallbackQuery({ text: label });

        const original = ctx.callbackQuery.message?.text ?? '';
        await ctx.editMessageText(`${original}\n\n<b>${label}</b>`, { parse_mode: 'HTML' });
      } catch (error) {
        const message = (error as any)?.response?.message ?? (error as Error).message;
        await ctx.answerCallbackQuery({ text: `❌ ${message}`, show_alert: true });
      }
    });

    this.logger.log("Bot: ko'rsatuv handlerlari ro'yxatdan o'tdi");
  }
}
