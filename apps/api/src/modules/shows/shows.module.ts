import { Module } from '@nestjs/common';
import { ShowsService } from './shows.service';
import { ShowsController } from './shows.controller';
import { ShowsBotHandlers } from './shows.bot';
import { EvaluationsModule } from '../evaluations/evaluations.module';

@Module({
  imports: [EvaluationsModule],
  controllers: [ShowsController],
  providers: [ShowsService, ShowsBotHandlers],
  exports: [ShowsService],
})
export class ShowsModule {}
