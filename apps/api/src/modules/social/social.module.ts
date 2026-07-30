import { Module } from '@nestjs/common';
import { SocialService } from './social.service';
import { SocialController } from './social.controller';
import { SocialScheduler } from './social.scheduler';
import { YoutubeProvider } from './providers/youtube.provider';
import { InstagramProvider } from './providers/instagram.provider';
import { TelegramChannelProvider } from './providers/telegram-channel.provider';

@Module({
  controllers: [SocialController],
  providers: [
    SocialService,
    SocialScheduler,
    YoutubeProvider,
    InstagramProvider,
    TelegramChannelProvider,
  ],
  exports: [SocialService],
})
export class SocialModule {}
