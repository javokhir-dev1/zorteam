import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceScheduler } from './attendance.scheduler';
import { AttendanceBotHandlers } from './attendance.bot';
import { SchedulesModule } from '../schedules/schedules.module';

@Module({
  imports: [SchedulesModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceScheduler, AttendanceBotHandlers],
  exports: [AttendanceService],
})
export class AttendanceModule {}
