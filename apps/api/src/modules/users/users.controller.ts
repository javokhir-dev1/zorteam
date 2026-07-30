import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, ListUsersQuery } from './dto';
import { Roles, CurrentUser } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';

@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Roles(SystemRole.ADMIN, SystemRole.DEPT_HEAD, SystemRole.APPROVER, SystemRole.VIEWER)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListUsersQuery) {
    return this.service.list(user, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user, id);
  }

  @Roles(SystemRole.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.service.create(user, dto);
  }

  @Roles(SystemRole.ADMIN, SystemRole.DEPT_HEAD)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.service.update(user, id, dto);
  }

  @Roles(SystemRole.ADMIN, SystemRole.DEPT_HEAD)
  @Post(':id/invite')
  invite(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.createInviteCode(user, id);
  }

  @Roles(SystemRole.ADMIN, SystemRole.DEPT_HEAD)
  @Post(':id/unlink-telegram')
  unlink(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.unlinkTelegram(user, id);
  }
}
