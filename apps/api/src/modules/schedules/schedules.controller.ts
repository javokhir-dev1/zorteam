import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import { SchedulesService } from './schedules.service';
import { UpsertScheduleDto, UpsertOfficeDto, UpsertCalendarDayDto } from './dto';
import { Roles, CurrentUser } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';

@Controller()
export class SchedulesController {
  constructor(private readonly service: SchedulesService) {}

  // ---- Ish grafiklari ----

  @Get('schedules')
  list() {
    return this.service.list();
  }

  @Get('schedules/:id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles(SystemRole.ADMIN)
  @Post('schedules')
  create(@CurrentUser() user: AuthUser, @Body() dto: UpsertScheduleDto) {
    return this.service.create(user, dto);
  }

  @Roles(SystemRole.ADMIN)
  @Patch('schedules/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertScheduleDto) {
    return this.service.update(user, id, dto);
  }

  @Roles(SystemRole.ADMIN)
  @Delete('schedules/:id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }

  // ---- Ofislar ----

  @Get('offices')
  listOffices() {
    return this.service.listOffices();
  }

  @Roles(SystemRole.ADMIN)
  @Post('offices')
  createOffice(@CurrentUser() user: AuthUser, @Body() dto: UpsertOfficeDto) {
    return this.service.upsertOffice(user, dto);
  }

  @Roles(SystemRole.ADMIN)
  @Patch('offices/:id')
  updateOffice(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertOfficeDto) {
    return this.service.upsertOffice(user, dto, id);
  }

  @Roles(SystemRole.ADMIN)
  @Delete('offices/:id')
  removeOffice(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeOffice(user, id);
  }

  // ---- Bayram kunlari ----

  @Get('calendar')
  listCalendar(@Query('year') year?: string) {
    return this.service.listCalendar(year ? Number(year) : undefined);
  }

  @Roles(SystemRole.ADMIN)
  @Post('calendar')
  upsertCalendarDay(@CurrentUser() user: AuthUser, @Body() dto: UpsertCalendarDayDto) {
    return this.service.upsertCalendarDay(user, dto);
  }

  @Roles(SystemRole.ADMIN)
  @Delete('calendar/:id')
  removeCalendarDay(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.removeCalendarDay(user, id);
  }
}
