import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import { TasksService } from './tasks.service';
import {
  AcceptTaskDto,
  CommentDto,
  CreateTaskDto,
  ListTasksQuery,
  RejectTaskDto,
  UpdateTaskStatusDto,
} from './dto';
import { Roles, CurrentUser } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';

@Controller('tasks')
export class TasksController {
  constructor(private readonly service: TasksService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ListTasksQuery) {
    return this.service.list(user, query);
  }

  @Get('my')
  my(@CurrentUser() user: AuthUser) {
    return this.service.myTasks(user.id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    return this.service.create(user, dto);
  }

  @Roles(SystemRole.ADMIN, SystemRole.DEPT_HEAD)
  @Post(':id/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AcceptTaskDto) {
    return this.service.accept(user, id, dto);
  }

  @Roles(SystemRole.ADMIN, SystemRole.DEPT_HEAD)
  @Post(':id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RejectTaskDto) {
    return this.service.reject(user, id, dto);
  }

  @Post(':id/status')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTaskStatusDto,
  ) {
    return this.service.updateStatus(user, id, dto);
  }

  @Post(':id/comments')
  comment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CommentDto) {
    return this.service.comment(user, id, dto);
  }
}
