import { Module, forwardRef } from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { SchedulesController } from './schedules.controller';
import { AttendanceModule } from '../attendance/attendance.module';

@Module({
  // Grafik o'zgargach bugungi davomat yozuvlari qayta hisoblanadi,
  // davomat esa grafikka murojaat qiladi — bog'liqlik ikki tomonlama.
  imports: [forwardRef(() => AttendanceModule)],
  controllers: [SchedulesController],
  providers: [SchedulesService],
  exports: [SchedulesService],
})
export class SchedulesModule {}
