import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { join } from 'path';

import configuration from './common/config/configuration';
import { PrismaModule } from './common/prisma/prisma.module';
import { AuthCoreModule } from './common/auth/auth-core.module';

import { AuditModule } from './modules/audit/audit.module';
import { FilesModule } from './modules/files/files.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RegistrationsModule } from './modules/registrations/registrations.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { SchedulesModule } from './modules/schedules/schedules.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { AbsencesModule } from './modules/absences/absences.module';
import { EvaluationsModule } from './modules/evaluations/evaluations.module';
import { ShowsModule } from './modules/shows/shows.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SocialModule } from './modules/social/social.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      // Monorepo ildizidagi yagona .env fayli
      envFilePath: [join(process.cwd(), '../../.env'), join(process.cwd(), '.env')],
    }),
    ScheduleModule.forRoot(),

    PrismaModule,
    AuthCoreModule,
    AuditModule,
    FilesModule,
    TelegramModule,

    AuthModule,
    RegistrationsModule,
    UsersModule,
    DepartmentsModule,
    SchedulesModule,
    AttendanceModule,
    AbsencesModule,
    EvaluationsModule,
    ShowsModule,
    FeedbackModule,
    TasksModule,
    ReportsModule,
    SocialModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
