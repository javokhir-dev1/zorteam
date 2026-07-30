import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsExportService } from './reports.export';
import { ReportsController } from './reports.controller';
import { ReportsScheduler } from './reports.scheduler';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ReportsExportService, ReportsScheduler],
  exports: [ReportsService],
})
export class ReportsModule {}
