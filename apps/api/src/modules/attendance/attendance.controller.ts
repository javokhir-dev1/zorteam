import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AttendanceMethod, SystemRole } from '@prisma/client';
import type { Request } from 'express';
import { AttendanceService } from './attendance.service';
import { CheckInDto, ManualAttendanceDto, AttendanceQuery } from './dto';
import { Roles, CurrentUser } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  // ---------- Hodim (Mini App) ----------

  /** Mini App ochilganda: bugungi holat, ofis koordinatasi, server vaqti */
  @Get('today')
  today(@CurrentUser() user: AuthUser) {
    return this.service.todayStatus(user.id);
  }

  /** Jonli kameradan olingan rasm + GPS */
  @Post('check-in')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: 12 * 1024 * 1024 } }))
  async checkIn(
    @CurrentUser() user: AuthUser,
    @UploadedFile() photo: Express.Multer.File,
    @Body() dto: CheckInDto,
    @Req() req: Request,
  ) {
    if (!photo?.buffer?.length) {
      throw new BadRequestException('Rasm yuborilmadi');
    }

    return this.service.checkIn({
      userId: user.id,
      photo: photo.buffer,
      photoName: photo.originalname,
      latitude: dto.latitude,
      longitude: dto.longitude,
      accuracy: dto.accuracy,
      method: AttendanceMethod.MINIAPP,
      deviceInfo: dto.deviceInfo ?? req.headers['user-agent'],
      ipAddress: req.ip,
    });
  }

  @Get('my')
  my(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    return this.service.myAttendance(user.id, days ? Number(days) : 14);
  }

  // ---------- Rahbariyat / admin ----------

  @Roles(SystemRole.ADMIN, SystemRole.DEPT_HEAD, SystemRole.APPROVER, SystemRole.VIEWER)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: AttendanceQuery) {
    return this.service.list(user, query);
  }

  @Roles(SystemRole.ADMIN, SystemRole.DEPT_HEAD, SystemRole.APPROVER, SystemRole.VIEWER)
  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Query('date') date?: string) {
    return this.service.dailySummary(user, date);
  }

  @Roles(SystemRole.ADMIN)
  @Post('manual')
  manual(@CurrentUser() user: AuthUser, @Body() dto: ManualAttendanceDto) {
    return this.service.manualEntry(user, dto);
  }

  /** Kunlik yozuvlarni qo'lda qayta tayyorlash (grafik o'zgartirilgandan keyin) */
  @Roles(SystemRole.ADMIN)
  @Post('prepare')
  prepare(@Body('date') date?: string) {
    return this.service.ensureDayRecords(date ? new Date(date) : new Date());
  }
}
