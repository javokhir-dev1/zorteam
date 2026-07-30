import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RegistrationStatus, SystemRole } from '@prisma/client';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { RegistrationsService } from './registrations.service';
import { Roles, CurrentUser } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';

class ApproveDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() position?: string;
  @IsOptional() @IsString() departmentId?: string | null;
  @IsOptional() @IsString() note?: string;
}

class RejectDto {
  @IsString()
  @MinLength(3, { message: 'Rad etish sababi kiritilishi shart' })
  reason: string;
}

class UpdateDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() position?: string;
  @IsOptional() @IsString() departmentId?: string | null;
}

@Controller('registrations')
@Roles(SystemRole.ADMIN)
export class RegistrationsController {
  constructor(private readonly service: RegistrationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('status') status?: RegistrationStatus) {
    return this.service.list(user, status);
  }

  @Get('pending-count')
  pendingCount(@CurrentUser() user: AuthUser) {
    return this.service.pendingCount(user);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateDto) {
    return this.service.update(user, id, dto);
  }

  @Post(':id/approve')
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ApproveDto) {
    return this.service.approve(user, id, dto);
  }

  @Post(':id/reject')
  reject(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RejectDto) {
    return this.service.reject(user, id, dto.reason);
  }
}
