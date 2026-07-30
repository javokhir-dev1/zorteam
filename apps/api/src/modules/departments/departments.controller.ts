import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto, UpdateDepartmentDto, SetHeadsDto } from './dto';
import { Roles, CurrentUser } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly service: DepartmentsService) {}

  @Get()
  list(@Query('includeInactive') includeInactive?: string) {
    return this.service.list(includeInactive === 'true');
  }

  @Get('tree')
  tree() {
    return this.service.tree();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Roles(SystemRole.ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDepartmentDto) {
    return this.service.create(user, dto);
  }

  @Roles(SystemRole.ADMIN)
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.service.update(user, id, dto);
  }

  @Roles(SystemRole.ADMIN)
  @Post(':id/heads')
  setHeads(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetHeadsDto) {
    return this.service.setHeads(user, id, dto.userIds);
  }
}
