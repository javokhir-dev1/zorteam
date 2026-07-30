import { Global, Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { NotificationsService } from './notifications.service';
import { TelegramLinkHandlers } from './link.handlers';
import { TelegramController } from './telegram.controller';

/**
 * Global modul — boshqa modullar TelegramService va NotificationsService'ni
 * import qilmasdan ishlatadi (aylanma bog'liqlikning oldini oladi).
 */
@Global()
@Module({
  controllers: [TelegramController],
  providers: [TelegramService, NotificationsService, TelegramLinkHandlers],
  exports: [TelegramService, NotificationsService],
})
export class TelegramModule {}
