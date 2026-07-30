import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { EpisodeStatus, SystemRole } from '@prisma/client';
import { ShowsService } from './shows.service';
import {
  AssignDto,
  CreateEpisodeDto,
  CreateShowDto,
  SetShowLeadersDto,
  UpdateEpisodeDto,
  UpdateShowDto,
  UpsertCrewRoleDto,
} from './dto';
import { Roles, CurrentUser } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';

@Controller()
export class ShowsController {
  constructor(private readonly service: ShowsService) {}

  // ---- Ko'rsatuvlar ----

  @Get('shows')
  listShows(@Query('includeInactive') includeInactive?: string) {
    return this.service.listShows(includeInactive === 'true');
  }

  @Get('shows/:id')
  findShow(@Param('id') id: string) {
    return this.service.findShow(id);
  }

  @Roles(SystemRole.ADMIN)
  @Post('shows')
  createShow(@CurrentUser() user: AuthUser, @Body() dto: CreateShowDto) {
    return this.service.createShow(user, dto);
  }

  @Roles(SystemRole.ADMIN)
  @Patch('shows/:id')
  updateShow(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateShowDto) {
    return this.service.updateShow(user, id, dto);
  }

  @Roles(SystemRole.ADMIN)
  @Post('shows/:id/leaders')
  setLeaders(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetShowLeadersDto) {
    return this.service.setLeaders(user, id, dto.userIds);
  }

  // ---- Efirlar ----

  @Get('episodes')
  listEpisodes(
    @Query('showId') showId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: EpisodeStatus,
  ) {
    return this.service.listEpisodes({ showId, from, to, status });
  }

  @Get('episodes/:id')
  findEpisode(@Param('id') id: string) {
    return this.service.findEpisode(id);
  }

  @Roles(SystemRole.ADMIN, SystemRole.DEPT_HEAD)
  @Post('shows/:showId/episodes')
  createEpisode(
    @CurrentUser() user: AuthUser,
    @Param('showId') showId: string,
    @Body() dto: CreateEpisodeDto,
  ) {
    return this.service.createEpisode(user, showId, dto);
  }

  @Roles(SystemRole.ADMIN, SystemRole.DEPT_HEAD)
  @Patch('episodes/:id')
  updateEpisode(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateEpisodeDto) {
    return this.service.updateEpisode(user, id, dto);
  }

  // ---- Jamoa biriktirish ----

  @Roles(SystemRole.ADMIN, SystemRole.DEPT_HEAD)
  @Post('episodes/:id/assignments')
  assign(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssignDto) {
    return this.service.assign(user, id, dto);
  }

  @Roles(SystemRole.ADMIN, SystemRole.DEPT_HEAD)
  @Delete('assignments/:id')
  unassign(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.unassign(user, id);
  }

  @Get('assignments/my')
  myAssignments(@CurrentUser() user: AuthUser, @Query('all') all?: string) {
    return this.service.myAssignments(user.id, all !== 'true');
  }

  @Roles(SystemRole.ADMIN, SystemRole.DEPT_HEAD)
  @Get('assignable-users')
  assignableUsers(@CurrentUser() user: AuthUser, @Query('crewRoleId') crewRoleId?: string) {
    return this.service.assignableUsers(user, crewRoleId);
  }

  // ---- Jamoa rollari ----

  @Get('crew-roles')
  listCrewRoles() {
    return this.service.listCrewRoles();
  }

  @Roles(SystemRole.ADMIN)
  @Post('crew-roles')
  createCrewRole(@CurrentUser() user: AuthUser, @Body() dto: UpsertCrewRoleDto) {
    return this.service.upsertCrewRole(user, dto);
  }

  @Roles(SystemRole.ADMIN)
  @Patch('crew-roles/:id')
  updateCrewRole(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertCrewRoleDto) {
    return this.service.upsertCrewRole(user, dto, id);
  }
}
