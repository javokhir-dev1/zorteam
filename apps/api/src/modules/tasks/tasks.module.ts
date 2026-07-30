import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { TasksScheduler } from './tasks.scheduler';
import { TasksBotHandlers } from './tasks.bot';

@Module({
  controllers: [TasksController],
  providers: [TasksService, TasksScheduler, TasksBotHandlers],
  exports: [TasksService],
})
export class TasksModule {}
