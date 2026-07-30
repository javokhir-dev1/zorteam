import { Module } from '@nestjs/common';
import { RegistrationsService } from './registrations.service';
import { RegistrationsController } from './registrations.controller';
import { RegistrationsBotHandlers } from './registrations.bot';

@Module({
  controllers: [RegistrationsController],
  providers: [RegistrationsService, RegistrationsBotHandlers],
  exports: [RegistrationsService],
})
export class RegistrationsModule {}
