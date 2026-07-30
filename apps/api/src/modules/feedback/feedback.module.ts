import { Module } from '@nestjs/common';
import { FeedbackService } from './feedback.service';
import { FeedbackController } from './feedback.controller';
import { FeedbackBotHandlers } from './feedback.bot';

@Module({
  controllers: [FeedbackController],
  providers: [FeedbackService, FeedbackBotHandlers],
  exports: [FeedbackService],
})
export class FeedbackModule {}
