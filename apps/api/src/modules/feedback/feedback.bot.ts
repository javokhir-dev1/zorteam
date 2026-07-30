import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { FeedbackCategory } from '@prisma/client';
import { InlineKeyboard } from 'grammy';
import { TelegramService } from '../telegram/telegram.service';
import { FeedbackService, CATEGORY_LABEL } from './feedback.service';
import { BTN, mainMenu } from '../telegram/keyboards';

interface DraftFeedback {
  category: FeedbackCategory;
  startedAt: Date;
}

/**
 * Botdan maxfiy murojaat yozish:
 *   1. Kategoriya tanlanadi
 *   2. Matn yoziladi
 *   3. Saqlanadi va adminlarga xabar boradi
 */
@Injectable()
export class FeedbackBotHandlers implements OnModuleInit {
  private readonly logger = new Logger(FeedbackBotHandlers.name);
  private readonly drafts = new Map<number, DraftFeedback>();

  constructor(
    private readonly telegram: TelegramService,
    private readonly feedback: FeedbackService,
  ) {}

  onModuleInit() {
    const bot = this.telegram.bot;
    if (!bot) return;

    bot.hears(BTN.FEEDBACK, async (ctx) => {
      const user = await this.telegram.resolveUser(ctx.from?.id);
      if (!user) return;

      const keyboard = new InlineKeyboard();
      const categories = Object.keys(CATEGORY_LABEL) as FeedbackCategory[];
      categories.forEach((category, index) => {
        keyboard.text(CATEGORY_LABEL[category], `fb:cat:${category}`);
        if (index % 2 === 1) keyboard.row();
      });

      await ctx.reply(
        [
          '<b>✉️ Maxfiy murojaat</b>',
          '',
          "Murojaatingizni hamkasblaringiz ko'rmaydi — u faqat rahbariyatga yetib boradi.",
          '',
          'Kategoriyani tanlang:',
        ].join('\n'),
        { parse_mode: 'HTML', reply_markup: keyboard },
      );
    });

    bot.callbackQuery(/^fb:cat:(.+)$/, async (ctx) => {
      const category = ctx.match![1] as FeedbackCategory;
      const telegramId = ctx.from?.id;

      const user = await this.telegram.resolveUser(telegramId);
      if (!user || !telegramId) {
        await ctx.answerCallbackQuery({ text: 'Tizimga ulanmagansiz', show_alert: true });
        return;
      }

      this.drafts.set(telegramId, { category, startedAt: new Date() });
      await ctx.answerCallbackQuery();

      await ctx.editMessageText(
        [
          `<b>✉️ Maxfiy murojaat</b>`,
          `Kategoriya: <b>${CATEGORY_LABEL[category]}</b>`,
          '',
          'Endi murojaatingizni matn ko\'rinishida yuboring.',
          '',
          '<i>Bekor qilish uchun /bekor</i>',
        ].join('\n'),
        { parse_mode: 'HTML' },
      );
    });

    bot.command('bekor', async (ctx) => {
      const telegramId = ctx.from?.id;
      if (telegramId) this.drafts.delete(telegramId);
      await this.telegram.showMenu(ctx, 'Bekor qilindi.');
    });

    // Matn kelganda: agar qoralama bo'lsa — murojaat sifatida saqlaymiz
    bot.on('message:text', async (ctx, next) => {
      const telegramId = ctx.from?.id;
      const draft = telegramId ? this.drafts.get(telegramId) : undefined;

      if (!draft || ctx.message.text.startsWith('/')) {
        return next();
      }

      const user = await this.telegram.resolveUser(telegramId);
      if (!user) return next();

      const text = ctx.message.text.trim();
      if (text.length < 10) {
        await ctx.reply("Murojaat juda qisqa. Kamida 10 belgi yozing.");
        return;
      }

      const subject = text.split('\n')[0].slice(0, 80);

      await this.feedback.create(user.id, {
        category: draft.category,
        subject,
        body: text,
      });

      this.drafts.delete(telegramId!);

      await ctx.reply(
        [
          '✅ Murojaatingiz qabul qilindi.',
          '',
          'Javob shu yerga keladi.',
        ].join('\n'),
        { reply_markup: mainMenu() },
      );
    });

    this.logger.log("Bot: maxfiy murojaat handlerlari ro'yxatdan o'tdi");
  }
}
