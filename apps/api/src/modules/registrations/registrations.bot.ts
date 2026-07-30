import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RegistrationStatus } from '@prisma/client';
import { InlineKeyboard } from 'grammy';
import { TelegramService } from '../telegram/telegram.service';
import { RegistrationsService } from './registrations.service';
import { mainMenu } from '../telegram/keyboards';
import { fmtDateTime } from '../../common/utils/dates';

type Step = 'name' | 'position' | 'department';

interface Draft {
  step: Step;
  fullName?: string;
  position?: string;
  startedAt: Date;
}

/**
 * Botda ro'yxatdan o'tish oqimi:
 *
 *   /start → [Ro'yxatdan o'tish]
 *          → ism sharifi
 *          → vazifasi
 *          → bo'lim tanlash
 *          → ariza yuboriladi va bosh adminga xabar boradi
 *
 * Qoralama xotirada saqlanadi — server qayta ishga tushsa
 * hodim /start dan qaytadan boshlaydi.
 */
@Injectable()
export class RegistrationsBotHandlers implements OnModuleInit {
  private readonly logger = new Logger(RegistrationsBotHandlers.name);
  private readonly drafts = new Map<number, Draft>();

  constructor(
    private readonly telegram: TelegramService,
    private readonly registrations: RegistrationsService,
  ) {}

  onModuleInit() {
    const bot = this.telegram.bot;
    if (!bot) return;

    // link.handlers /start ni kod bilan ishlaydi, kodsiz holatda bu yerga o'tadi
    bot.command('start', async (ctx) => {
      const telegramId = ctx.from?.id;
      if (!telegramId) return;
      await this.showEntry(ctx, telegramId);
    });

    bot.command('ariza', async (ctx) => {
      const telegramId = ctx.from?.id;
      if (!telegramId) return;
      await this.showEntry(ctx, telegramId);
    });

    bot.callbackQuery('reg:start', async (ctx) => {
      const telegramId = ctx.from?.id;
      if (!telegramId) return;

      // Holatni javobdan oldin saqlaymiz — xabar yuborishda uzilish bo'lsa ham
      // hodim oqimni davom ettira oladi
      this.drafts.set(telegramId, { step: 'name', startedAt: new Date() });
      await ctx.answerCallbackQuery().catch(() => undefined);

      await ctx.editMessageText(
        [
          '<b>📝 Ro\'yxatdan o\'tish — 1/3</b>',
          '',
          'Ism sharifingizni to\'liq yozing.',
          '',
          '<i>Masalan: Abdullayev Sardor Alisher o\'g\'li</i>',
          '',
          '<i>Bekor qilish: /bekor</i>',
        ].join('\n'),
        { parse_mode: 'HTML' },
      );
    });

    bot.callbackQuery(/^reg:dept:(.+)$/, async (ctx) => {
      const telegramId = ctx.from?.id;
      const departmentId = ctx.match![1];
      if (!telegramId) return;

      const draft = this.drafts.get(telegramId);
      if (!draft?.fullName || !draft.position) {
        await ctx.answerCallbackQuery({
          text: 'Ariza eskirdi. /start dan qaytadan boshlang.',
          show_alert: true,
        });
        return;
      }

      await ctx.answerCallbackQuery().catch(() => undefined);

      try {
        const request = await this.registrations.submit({
          telegramId,
          telegramUsername: ctx.from?.username,
          telegramFirstName: ctx.from?.first_name,
          fullName: draft.fullName,
          position: draft.position,
          departmentId: departmentId === 'none' ? null : departmentId,
        });

        this.drafts.delete(telegramId);

        const departments = await this.registrations.listOpenDepartments();
        const department = departments.find((d) => d.id === request.departmentId);

        await ctx.editMessageText(
          [
            '✅ <b>Arizangiz yuborildi</b>',
            '',
            `Ism sharifi: <b>${request.fullName}</b>`,
            `Vazifasi: <b>${request.position}</b>`,
            `Bo'lim: <b>${department?.name ?? '—'}</b>`,
            '',
            'Ariza rahbariyatga yuborildi. Tasdiqlangach shu yerga',
            'xabar keladi va tizim ochiladi.',
          ].join('\n'),
          { parse_mode: 'HTML' },
        );
      } catch (error) {
        const message = (error as any)?.response?.message ?? (error as Error).message;
        await ctx.editMessageText(`❌ ${message}`);
      }
    });

    bot.command('bekor', async (ctx) => {
      const telegramId = ctx.from?.id;
      if (telegramId && this.drafts.has(telegramId)) {
        this.drafts.delete(telegramId);
        await ctx.reply('Ro\'yxatdan o\'tish bekor qilindi. Qaytadan: /start');
      }
    });

    // Matn — faqat ro'yxatdan o'tish qoralamasi bo'lsa qabul qilinadi
    bot.on('message:text', async (ctx, next) => {
      const telegramId = ctx.from?.id;
      const draft = telegramId ? this.drafts.get(telegramId) : undefined;

      if (!draft || ctx.message.text.startsWith('/')) return next();

      const text = ctx.message.text.trim();

      if (draft.step === 'name') {
        if (text.length < 5 || !text.includes(' ')) {
          await ctx.reply('Iltimos, ism va familyangizni to\'liq yozing.');
          return;
        }

        draft.fullName = text;
        draft.step = 'position';
        this.drafts.set(telegramId!, draft);

        await ctx.reply(
          [
            '<b>📝 Ro\'yxatdan o\'tish — 2/3</b>',
            '',
            `Ism sharifi: <b>${text}</b>`,
            '',
            'Endi vazifangizni (lavozimingizni) yozing.',
            '',
            '<i>Masalan: Operator, Montajchi, Boshlovchi</i>',
          ].join('\n'),
          { parse_mode: 'HTML' },
        );
        return;
      }

      if (draft.step === 'position') {
        if (text.length < 2) {
          await ctx.reply('Vazifangizni aniqroq yozing.');
          return;
        }

        draft.position = text;
        draft.step = 'department';
        this.drafts.set(telegramId!, draft);

        const departments = await this.registrations.listOpenDepartments();

        if (!departments.length) {
          await ctx.reply(
            "Tizimda bo'limlar hali kiritilmagan. Rahbaringizga murojaat qiling.",
          );
          this.drafts.delete(telegramId!);
          return;
        }

        const keyboard = new InlineKeyboard();
        departments.forEach((department, index) => {
          keyboard.text(department.name, `reg:dept:${department.id}`);
          if (index % 2 === 1) keyboard.row();
        });

        await ctx.reply(
          [
            '<b>📝 Ro\'yxatdan o\'tish — 3/3</b>',
            '',
            `Vazifasi: <b>${text}</b>`,
            '',
            'Qaysi bo\'limda ishlaysiz?',
          ].join('\n'),
          { parse_mode: 'HTML', reply_markup: keyboard },
        );
        return;
      }

      if (draft.step === 'department') {
        await ctx.reply("Iltimos, yuqoridagi ro'yxatdan bo'limni tanlang.");
        return;
      }

      return next();
    });

    this.logger.log("Bot: ro'yxatdan o'tish handlerlari ro'yxatdan o'tdi");
  }

  /** /start bosilganda ko'rsatiladigan ekran */
  private async showEntry(ctx: any, telegramId: number) {
    const request = await this.registrations.findByTelegramId(telegramId);

    if (request?.status === RegistrationStatus.PENDING) {
      await ctx.reply(
        [
          '⏳ <b>Arizangiz ko\'rib chiqilmoqda</b>',
          '',
          `Ism sharifi: ${request.fullName}`,
          `Vazifasi: ${request.position}`,
          `Bo'lim: ${request.department?.name ?? '—'}`,
          `Yuborilgan: ${fmtDateTime(request.createdAt)}`,
          '',
          'Rahbariyat tasdiqlagach shu yerga xabar keladi.',
        ].join('\n'),
        { parse_mode: 'HTML' },
      );
      return;
    }

    if (request?.status === RegistrationStatus.APPROVED) {
      // Odatda bu holatda User yozuvi bor va link.handlers ushlaydi
      await ctx.reply('Arizangiz tasdiqlangan.', { reply_markup: mainMenu() });
      return;
    }

    const keyboard = new InlineKeyboard().text("📝 Ro'yxatdan o'tish", 'reg:start');

    if (request?.status === RegistrationStatus.REJECTED) {
      await ctx.reply(
        [
          '❌ <b>Oldingi arizangiz rad etilgan</b>',
          '',
          request.decisionNote ? `Sabab: ${request.decisionNote}` : '',
          '',
          'Ma\'lumotlarni to\'g\'rilab qayta ariza berishingiz mumkin.',
        ]
          .filter(Boolean)
          .join('\n'),
        { parse_mode: 'HTML', reply_markup: keyboard },
      );
      return;
    }

    await ctx.reply(
      [
        "Assalomu alaykum! Bu <b>Zo'r team</b> boshqaruv tizimi boti.",
        '',
        'Tizimdan foydalanish uchun ro\'yxatdan o\'ting:',
        'ism sharifingiz, vazifangiz va bo\'limingizni kiritasiz.',
        '',
        'Ariza rahbariyat tomonidan tasdiqlangach tizim ochiladi.',
        '',
        '<i>Rahbaringizdan shaxsiy havola olgan bo\'lsangiz, o\'sha havolani bosing.</i>',
      ].join('\n'),
      { parse_mode: 'HTML', reply_markup: keyboard },
    );
  }
}
