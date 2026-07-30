import { Module } from '@nestjs/common';
import { AbsencesService } from './absences.service';
import { AbsencesController } from './absences.controller';
import { AbsencesBotHandlers } from './absences.bot';

@Module({
  controllers: [AbsencesController],
  providers: [AbsencesService, AbsencesBotHandlers],
  exports: [AbsencesService],
})
export class AbsencesModule {}
