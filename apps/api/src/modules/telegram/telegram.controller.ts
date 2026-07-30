import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  Param,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service';
import { NotificationsService } from './notifications.service';
import { Public, CurrentUser } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';

@Controller('telegram')
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(
    private readonly telegram: TelegramService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  /** Production rejimida Telegram yangilanishlarni shu manzilga yuboradi */
  @Public()
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Body() update: unknown,
    @Headers('x-telegram-bot-api-secret-token') secret?: string,
  ) {
    const bot = this.telegram.bot;
    if (!bot) return { ok: false };

    const expected = this.config.get<string>('telegram.webhookSecret');
    if (expected && secret !== expected) {
      throw new ForbiddenException('Webhook tokeni mos kelmadi');
    }

    // Handler ichidagi xato yuz bersa ham Telegramga 200 qaytariladi:
    // aks holda Telegram shu yangilanishni qayta-qayta yuboraveradi.
    try {
      await bot.handleUpdate(update as any);
    } catch (error) {
      this.logger.error(`Telegram yangilanishini qayta ishlashda xato: ${(error as Error).message}`);
    }

    return { ok: true };
  }

  @Get('notifications')
  list(@CurrentUser() user: AuthUser) {
    return this.notifications.listForUser(user.id);
  }

  @Post('notifications/:id/read')
  @HttpCode(200)
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }
}
