import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TelegramService } from './telegram.service';
import { mainMenu, BTN } from './keyboards';

/**
 * Botga ulanish oqimi:
 *   1. Admin hodim uchun taklif havolasini yaratadi (t.me/bot?start=KOD)
 *   2. Hodim havolani bosadi → /start KOD
 *   3. Kod tekshiriladi va Telegram akkaunti hodimga bog'lanadi
 *
 * Havola yo'qolsa — hodim telefon raqamini yuborib ham ulanishi mumkin
 * (raqam tizimda oldindan kiritilgan bo'lishi kerak).
 */
@Injectable()
export class TelegramLinkHandlers implements OnModuleInit {
  private readonly logger = new Logger(TelegramLinkHandlers.name);

  constructor(
    private readonly telegram: TelegramService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    const bot = this.telegram.bot;
    if (!bot) return;

    bot.command('start', async (ctx, next) => {
      const telegramId = ctx.from?.id;
      if (!telegramId) return;

      const existing = await this.telegram.resolveUser(telegramId);
      if (existing) {
        await ctx.reply(
          `Assalomu alaykum, <b>${existing.fullName}</b>!\nSiz allaqachon tizimga ulangansiz.`,
          { parse_mode: 'HTML', reply_markup: mainMenu() },
        );
        return;
      }

      const code = ctx.match?.toString().trim();
      if (code) {
        await this.linkByCode(ctx, telegramId, code);
        return;
      }

      // Kod bo'lmasa — ro'yxatdan o'tish moduli davom ettiradi
      return next();
    });

    bot.on('message:contact', async (ctx) => {
      const telegramId = ctx.from?.id;
      const contact = ctx.message.contact;
      if (!telegramId || !contact) return;

      // Faqat o'z raqamini yubora oladi
      if (contact.user_id !== telegramId) {
        await ctx.reply("Iltimos, o'zingizning raqamingizni yuboring.");
        return;
      }

      const existing = await this.telegram.resolveUser(telegramId);
      if (existing) {
        await this.telegram.showMenu(ctx, 'Siz allaqachon ulangansiz.');
        return;
      }

      await this.linkByPhone(ctx, telegramId, contact.phone_number);
    });

    bot.command(['menu', 'yordam'], async (ctx) => {
      const user = await this.telegram.resolveUser(ctx.from?.id);
      if (!user) {
        await ctx.reply('Avval tizimga ulaning: /start');
        return;
      }
      await this.telegram.showMenu(ctx, this.helpText(user.fullName));
    });

    bot.hears(BTN.HELP, async (ctx) => {
      const user = await this.telegram.resolveUser(ctx.from?.id);
      if (!user) return;
      await ctx.reply(this.helpText(user.fullName), { parse_mode: 'HTML' });
    });

    this.logger.log("Bot: ulanish handlerlari ro'yxatdan o'tdi");
  }

  private async linkByCode(ctx: any, telegramId: number, code: string) {
    const invite = await this.prisma.inviteCode.findUnique({
      where: { code },
      include: { user: { select: { id: true, fullName: true, status: true, telegramId: true } } },
    });

    if (!invite || invite.usedAt) {
      await ctx.reply('❌ Havola yaroqsiz yoki allaqachon ishlatilgan. Rahbaringizga murojaat qiling.');
      return;
    }

    if (invite.expiresAt < new Date()) {
      await ctx.reply('❌ Havola muddati tugagan. Rahbaringizdan yangi havola so\'rang.');
      return;
    }

    if (invite.user.status !== UserStatus.ACTIVE) {
      await ctx.reply('❌ Hisobingiz faol emas. Rahbaringizga murojaat qiling.');
      return;
    }

    if (invite.user.telegramId) {
      await ctx.reply('❌ Bu hodim allaqachon boshqa Telegram akkauntga ulangan.');
      return;
    }

    await this.completeLink(invite.user.id, telegramId, ctx.from?.username, invite.id);

    await ctx.reply(
      [
        `✅ Xush kelibsiz, <b>${invite.user.fullName}</b>!`,
        '',
        'Telegram akkauntingiz tizimga muvaffaqiyatli ulandi.',
        'Ish vaqtingiz boshlanganda shu yerga xabar keladi.',
      ].join('\n'),
      { parse_mode: 'HTML', reply_markup: mainMenu() },
    );
  }

  private async linkByPhone(ctx: any, telegramId: number, phoneNumber: string) {
    // Raqamlarni solishtirish uchun faqat oxirgi 9 raqamni olamiz (+998 turli ko'rinishda kelishi mumkin)
    const digits = phoneNumber.replace(/\D/g, '');
    const tail = digits.slice(-9);

    const candidates = await this.prisma.user.findMany({
      where: { phone: { not: null }, telegramId: null, status: UserStatus.ACTIVE },
      select: { id: true, fullName: true, phone: true },
    });

    const matched = candidates.filter((u) => u.phone!.replace(/\D/g, '').slice(-9) === tail);

    if (matched.length === 0) {
      await ctx.reply(
        [
          "❌ Bu raqam tizimda topilmadi yoki allaqachon ulangan.",
          '',
          'Rahbaringizdan shaxsiy taklif havolasini so\'rang.',
        ].join('\n'),
      );
      return;
    }

    if (matched.length > 1) {
      await ctx.reply(
        '❌ Bu raqam bir nechta hodimga tegishli. Rahbaringizdan taklif havolasini so\'rang.',
      );
      return;
    }

    await this.completeLink(matched[0].id, telegramId, ctx.from?.username);

    await ctx.reply(
      [
        `✅ Xush kelibsiz, <b>${matched[0].fullName}</b>!`,
        '',
        'Telegram akkauntingiz tizimga ulandi.',
      ].join('\n'),
      { parse_mode: 'HTML', reply_markup: mainMenu() },
    );
  }

  private async completeLink(
    userId: string,
    telegramId: number,
    username?: string,
    inviteId?: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          telegramId: BigInt(telegramId),
          telegramUsername: username ?? null,
          telegramLinkedAt: new Date(),
          botBlocked: false,
        },
      });

      if (inviteId) {
        await tx.inviteCode.update({
          where: { id: inviteId },
          data: { usedAt: new Date() },
        });
      }
    });

    await this.audit.log(userId, 'user.telegramLinked', 'User', userId, null, {
      telegramId: String(telegramId),
      username,
    });

    this.logger.log(`Hodim Telegramga ulandi: ${userId} → ${telegramId}`);
  }

  private helpText(fullName: string): string {
    return [
      `<b>${fullName}</b>, bot imkoniyatlari:`,
      '',
      `${BTN.CHECK_IN} — ish vaqtini belgilash (kamera + joylashuv)`,
      `${BTN.MY_ATTENDANCE} — oxirgi kunlardagi davomatingiz`,
      `${BTN.MY_TASKS} — sizga berilgan topshiriqlar`,
      `${BTN.MY_SHOWS} — biriktirilgan ko'rsatuvlaringiz`,
      `${BTN.FEEDBACK} — maxfiy murojaat (faqat rahbariyat ko'radi)`,
      '',
      'Ish vaqtingiz boshlanganda bot o\'zi xabar yuboradi.',
    ].join('\n');
  }
}
