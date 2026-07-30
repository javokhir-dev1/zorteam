import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './common/prisma/prisma.service';
import { TelegramService } from './modules/telegram/telegram.service';
import { Public } from './common/auth/decorators';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  @Public()
  @Get()
  async check() {
    let database = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      database = `xato: ${(error as Error).message}`;
    }

    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      database,
      telegramBot: this.telegram.isEnabled ? 'sozlangan' : 'token kiritilmagan',
      time: new Date(),
      timezone: process.env.TZ ?? 'Asia/Tashkent',
    };
  }
}
