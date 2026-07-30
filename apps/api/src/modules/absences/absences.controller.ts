import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import { AbsencesService } from './absences.service';
import { CreateAbsenceDto, DecideAbsenceDto, ListAbsencesQuery } from './dto';
import { Roles, CurrentUser } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';

@Controller('absences')
export class AbsencesController {
  constructor(private readonly service: AbsencesService) {}

  @Roles(SystemRole.ADMIN, SystemRole.DEPT_HEAD, SystemRole.APPROVER, SystemRole.VIEWER)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListAbsencesQuery) {
    return this.service.list(user, query);
  }

  @Get('my')
  mine(@CurrentUser() user: AuthUser) {
    return this.service.mine(user.id);
  }

  @Roles(SystemRole.ADMIN, SystemRole.DEPT_HEAD, SystemRole.APPROVER, SystemRole.VIEWER)
  @Get('today')
  today(@CurrentUser() user: AuthUser) {
    return this.service.todayAbsent(user);
  }

  @Roles(SystemRole.ADMIN, SystemRole.DEPT_HEAD)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateAbsenceDto) {
    return this.service.create(user, dto);
  }

  @Roles(SystemRole.ADMIN, SystemRole.APPROVER)
  @Post(':id/decide')
  decide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecideAbsenceDto) {
    return this.service.decide(user, id, dto);
  }

  @Roles(SystemRole.ADMIN, SystemRole.DEPT_HEAD, SystemRole.APPROVER)
  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.cancel(user, id);
  }
}
