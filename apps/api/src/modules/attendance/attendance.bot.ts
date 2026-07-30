import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttendanceMethod, AttendanceStatus } from '@prisma/client';
import { TelegramService } from '../telegram/telegram.service';
import { AttendanceService } from './attendance.service';
import { BTN, locationRequestKeyboard, mainMenu } from '../telegram/keyboards';
import { fmtTime, fmtDate, dayjs } from '../../common/utils/dates';

interface PendingLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  at: Date;
}

const STATUS_ICON: Record<string, string> = {
  ON_TIME: '✅',
  LATE: '⚠️',
  MISSED: '❌',
  EXCUSED: '🏖',
  DAY_OFF: '💤',
  PENDING: '⏳',
};

const STATUS_LABEL: Record<string, string> = {
  ON_TIME: 'vaqtida',
  LATE: 'kechikdi',
  MISSED: 'belgilanmadi',
  EXCUSED: 'sababli',
  DAY_OFF: 'dam olish',
  PENDING: 'kutilmoqda',
};

/**
 * Chat orqali belgilanish — ZAXIRA usul.
 *
 * Asosiy usul Mini App (jonli kamera): galereyadan rasm tanlab bo'lmaydi.
 * Bu yerda esa Telegram cheklovi sabab galereyadan rasm yuborish mumkin,
 * shuning uchun bunday belgilanishlar FALLBACK_METHOD deb belgilanadi va
 * hisobotda alohida ko'rinadi.
 */
@Injectable()
export class AttendanceBotHandlers implements OnModuleInit {
  private readonly logger = new Logger(AttendanceBotHandlers.name);
  private readonly pending = new Map<number, PendingLocation>();

  constructor(
    private readonly telegram: TelegramService,
    private readonly attendance: AttendanceService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const bot = this.telegram.bot;
    if (!bot) return;

    // --- Asosiy usul: Mini App ochish ---
    bot.hears(BTN.CHECK_IN, (ctx) => this.offerCheckIn(ctx));
    bot.command('belgilanish', (ctx) => this.offerCheckIn(ctx));

    // --- Zaxira usul ---
    bot.command('zaxira', async (ctx) => {
      const user = await this.telegram.resolveUser(ctx.from?.id);
      if (!user) return;

      await ctx.reply(
        [
          '🔁 <b>Zaxira usul</b>',
          '',
          'Bu usul faqat Mini App ochilmagan holatda ishlatiladi va',
          'hisobotda alohida belgilanadi.',
          '',
          '1-qadam: quyidagi tugma orqali joylashuvingizni yuboring.',
        ].join('\n'),
        { parse_mode: 'HTML', reply_markup: locationRequestKeyboard() },
      );
    });

    bot.on('message:location', async (ctx) => {
      const telegramId = ctx.from?.id;
      const user = await this.telegram.resolveUser(telegramId);
      if (!user || !telegramId) return;

      const location = ctx.message.location;
      this.pending.set(telegramId, {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: (location as any).horizontal_accuracy,
        at: new Date(),
      });

      await ctx.reply(
        [
          '📍 Joylashuv qabul qilindi.',
          '',
          "2-qadam: <b>hoziroq</b> o'zingizni suratga oling va shu yerga yuboring.",
          '',
          "⚠️ Eslatma: rasm ish joyingizda olingan bo'lishi kerak.",
        ].join('\n'),
        { parse_mode: 'HTML' },
      );
    });

    bot.on('message:photo', async (ctx) => {
      const telegramId = ctx.from?.id;
      const user = await this.telegram.resolveUser(telegramId);
      if (!user || !telegramId) return;

      const location = this.pending.get(telegramId);
      if (!location) {
        await ctx.reply('Avval joylashuvni yuborish kerak: /zaxira', {
          reply_markup: this.telegram.miniAppKeyboard('📍 Belgilanish'),
        });
        return;
      }

      // Joylashuv 10 daqiqadan eski bo'lsa qabul qilinmaydi
      if (dayjs().diff(location.at, 'minute') > 10) {
        this.pending.delete(telegramId);
        await ctx.reply('⏱ Joylashuv eskirdi. Iltimos, qaytadan boshlang: /zaxira');
        return;
      }

      try {
        const buffer = await this.downloadLargestPhoto(ctx);
        if (!buffer) {
          await ctx.reply("Rasmni yuklab bo'lmadi. Qaytadan urinib ko'ring.");
          return;
        }

        const result = await this.attendance.checkIn({
          userId: user.id,
          photo: buffer,
          photoName: `telegram-${telegramId}.jpg`,
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy,
          method: AttendanceMethod.TELEGRAM_CHAT,
          deviceInfo: 'Telegram chat (zaxira usul)',
        });

        this.pending.delete(telegramId);

        await ctx.reply(`${result.message}\n\n🕐 ${fmtTime(result.checkInAt)}`, {
          parse_mode: 'HTML',
          reply_markup: mainMenu(),
        });
      } catch (error) {
        await ctx.reply(`❌ ${(error as any)?.response?.message ?? (error as Error).message}`);
      }
    });

    bot.hears(BTN.CANCEL, async (ctx) => {
      const telegramId = ctx.from?.id;
      if (telegramId) this.pending.delete(telegramId);
      await this.telegram.showMenu(ctx, 'Bekor qilindi.');
    });

    // --- Davomat tarixi ---
    bot.hears(BTN.MY_ATTENDANCE, (ctx) => this.showMyAttendance(ctx));
    bot.command('davomat', (ctx) => this.showMyAttendance(ctx));

    this.logger.log("Bot: davomat handlerlari ro'yxatdan o'tdi");
  }

  private async offerCheckIn(ctx: any) {
    const user = await this.telegram.resolveUser(ctx.from?.id);
    if (!user) {
      await ctx.reply('Avval tizimga ulaning: /start');
      return;
    }

    const status = await this.attendance.todayStatus(user.id);

    if (status.checkInAt) {
      await ctx.reply(
        `✅ Siz bugun allaqachon belgilangansiz: <b>${fmtTime(status.checkInAt)}</b>`,
        { parse_mode: 'HTML' },
      );
      return;
    }

    if (status.status === AttendanceStatus.DAY_OFF) {
      await ctx.reply('💤 Bugun sizda dam olish kuni.');
      return;
    }

    if (status.status === AttendanceStatus.EXCUSED) {
      await ctx.reply("🏖 Bugun siz uchun tasdiqlangan yo'qlik belgilangan.");
      return;
    }

    if (status.status === AttendanceStatus.MISSED) {
      await ctx.reply(
        [
          '❌ Belgilanish oynasi yopilgan.',
          '',
          'Sabab bo\'lsa rahbaringizga murojaat qiling.',
        ].join('\n'),
      );
      return;
    }

    const keyboard = this.telegram.miniAppKeyboard('📍 Belgilanish');

    await ctx.reply(
      [
        `Ish vaqtingiz: <b>${fmtTime(status.expectedStartAt)}</b>`,
        `Oyna yopiladi: <b>${fmtTime(status.windowClosesAt)}</b>`,
        '',
        keyboard
          ? 'Tugmani bosing — kamera ochiladi va joylashuv avtomatik olinadi.\n\n<i>Tugma ochilmasa: /zaxira</i>'
          : "Belgilanish uchun /zaxira buyrug'ini yuboring.\n\n<i>Mini App manzili (HTTPS) sozlangach kamera rejimi ochiladi.</i>",
      ].join('\n'),
      { parse_mode: 'HTML', reply_markup: keyboard },
    );
  }

  private async showMyAttendance(ctx: any) {
    const user = await this.telegram.resolveUser(ctx.from?.id);
    if (!user) return;

    const { items, stats } = await this.attendance.myAttendance(user.id, 14);

    const lines = items.slice(0, 14).map((item) => {
      const icon = STATUS_ICON[item.status] ?? '•';
      const label = STATUS_LABEL[item.status] ?? item.status;
      const time = item.checkInAt ? ` ${fmtTime(item.checkInAt)}` : '';
      const late = item.minutesLate > 0 ? ` (+${item.minutesLate} daq)` : '';
      return `${icon} ${fmtDate(item.date)} — ${label}${time}${late}`;
    });

    await ctx.reply(
      [
        '<b>📅 Oxirgi 14 kun</b>',
        '',
        ...lines,
        '',
        `Ish kunlari: ${stats.workdays} | Vaqtida: ${stats.onTime} | Kechikish: ${stats.late} | Belgilanmagan: ${stats.missed}`,
        `Davomat ko'rsatkichi: <b>${stats.rate}%</b>`,
      ].join('\n'),
      { parse_mode: 'HTML' },
    );
  }

  /** Telegramdan eng katta o'lchamdagi rasmni yuklab olish */
  private async downloadLargestPhoto(ctx: any): Promise<Buffer | null> {
    const photos = ctx.message?.photo;
    if (!photos?.length) return null;

    const largest = photos[photos.length - 1];
    const file = await ctx.api.getFile(largest.file_id);
    if (!file.file_path) return null;

    const token = this.config.get<string>('telegram.token');
    const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

    const response = await fetch(url);
    if (!response.ok) return null;

    return Buffer.from(await response.arrayBuffer());
  }
}
