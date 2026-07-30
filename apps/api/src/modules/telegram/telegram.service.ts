import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, GrammyError, HttpError, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';
import { PrismaService } from '../../common/prisma/prisma.service';
import { mainMenu } from './keyboards';

/**
 * Telegram botning yadrosi.
 *
 * Har bir modul (davomat, yo'qlik, topshiriqlar...) o'z handlerlarini
 * shu servis orqali ro'yxatdan o'tkazadi — shunda modullar orasida
 * aylanma bog'liqlik yuzaga kelmaydi.
 */
@Injectable()
export class TelegramService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private readonly _bot: Bot | null;
  private started = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const token = this.config.get<string>('telegram.token');
    this._bot = token ? new Bot(token) : null;

    if (!token) {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN kiritilmagan — bot ishga tushmaydi (backend baribir ishlaydi)',
      );
    }
  }

  get bot(): Bot | null {
    return this._bot;
  }

  get isEnabled(): boolean {
    return this._bot !== null;
  }

  get miniAppUrl(): string {
    return this.config.get<string>('telegram.miniAppUrl') ?? '';
  }

  /**
   * Telegram web_app tugmalari faqat HTTPS manzillar bilan ishlaydi.
   * MINIAPP_URL hali sozlanmagan bo'lsa tugma o'rniga matn yuboriladi —
   * shunda bot xato bermay ishlashda davom etadi.
   */
  get canUseMiniApp(): boolean {
    return this.miniAppUrl.startsWith('https://');
  }

  /** Mini App tugmasi — mumkin bo'lmasa undefined qaytadi */
  miniAppKeyboard(label: string, path = ''): InlineKeyboard | undefined {
    if (!this.canUseMiniApp) return undefined;
    return new InlineKeyboard().webApp(label, `${this.miniAppUrl}${path}`);
  }

  /** Mini App mavjud bo'lmaganda ko'rsatiladigan qo'shimcha izoh */
  get miniAppFallbackNote(): string {
    return this.canUseMiniApp
      ? ''
      : '\n\n<i>⚠️ Mini App manzili hali sozlanmagan. Belgilanish uchun: /zaxira</i>';
  }

  async onApplicationBootstrap() {
    if (!this._bot) return;

    this._bot.catch((err) => {
      const ctx = err.ctx;
      const error = err.error;
      if (error instanceof GrammyError) {
        this.logger.error(`Telegram API xatosi: ${error.description}`);
      } else if (error instanceof HttpError) {
        this.logger.error(`Telegramga ulanib bo'lmadi: ${error.message}`);
      } else {
        this.logger.error(`Bot xatosi (${ctx?.update?.update_id}): ${String(error)}`);
      }
    });

    // Barcha modul handlerlari ro'yxatdan o'tgach ishga tushiramiz
    const webhookUrl = this.config.get<string>('telegram.webhookUrl');

    try {
      await this._bot.api.setMyCommands([
        { command: 'start', description: 'Botni ishga tushirish' },
        { command: 'menu', description: 'Asosiy menyu' },
        { command: 'belgilanish', description: 'Ish vaqtini belgilash' },
        { command: 'davomat', description: 'Davomatim' },
        { command: 'yordam', description: 'Yordam' },
      ]);

      if (webhookUrl) {
        await this._bot.api.setWebhook(`${webhookUrl}/api/telegram/webhook`, {
          secret_token: this.config.get<string>('telegram.webhookSecret') || undefined,
        });
        await this._bot.init();
        this.logger.log(`Bot webhook rejimida: ${webhookUrl}`);
      } else {
        await this._bot.api.deleteWebhook();
        void this._bot.start({
          onStart: (info) => this.logger.log(`Bot ishga tushdi: @${info.username}`),
        });
      }
      this.started = true;
    } catch (error) {
      this.logger.error(`Botni ishga tushirib bo'lmadi: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy() {
    if (this._bot && this.started) {
      await this._bot.stop().catch(() => undefined);
    }
  }

  /**
   * Hodimga xabar yuborish. Bot bloklangan bo'lsa belgilab qo'yiladi —
   * admin panelda "bot bloklangan" ustunida ko'rinadi.
   */
  async sendToUser(
    userId: string,
    text: string,
    extra?: Parameters<Bot['api']['sendMessage']>[2],
  ): Promise<{ ok: boolean; messageId?: number; error?: string; blocked?: boolean }> {
    if (!this._bot) return { ok: false, error: 'Bot sozlanmagan' };

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramId: true, fullName: true },
    });

    if (!user?.telegramId) {
      return { ok: false, error: 'Hodim Telegramga ulanmagan' };
    }

    try {
      const message = await this._bot.api.sendMessage(Number(user.telegramId), text, {
        parse_mode: 'HTML',
        ...extra,
      });

      await this.prisma.user.updateMany({
        where: { id: userId, botBlocked: true },
        data: { botBlocked: false },
      });

      return { ok: true, messageId: message.message_id };
    } catch (error) {
      const description = error instanceof GrammyError ? error.description : String(error);
      const blocked = /blocked by the user|user is deactivated|chat not found/i.test(description);

      if (blocked) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { botBlocked: true },
        });
      }

      this.logger.warn(`${user.fullName} ga xabar yuborilmadi: ${description}`);
      return { ok: false, error: description, blocked };
    }
  }

  /** Chat ID bo'yicha to'g'ridan-to'g'ri yuborish */
  async sendToChat(chatId: number | bigint, text: string, extra?: any) {
    if (!this._bot) return null;
    return this._bot.api
      .sendMessage(Number(chatId), text, { parse_mode: 'HTML', ...extra })
      .catch((error) => {
        this.logger.warn(`Xabar yuborilmadi (${chatId}): ${(error as Error).message}`);
        return null;
      });
  }

  /** Asosiy menyuni ko'rsatish */
  async showMenu(ctx: Context, text = 'Asosiy menyu:') {
    await ctx.reply(text, { reply_markup: mainMenu() });
  }

  /** Telegram ID orqali tizimdagi hodimni topish */
  async resolveUser(telegramId?: number) {
    if (!telegramId) return null;
    return this.prisma.user.findUnique({
      where: { telegramId: BigInt(telegramId) },
      select: {
        id: true,
        fullName: true,
        position: true,
        roles: true,
        status: true,
        departmentId: true,
      },
    });
  }
}
