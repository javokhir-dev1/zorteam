import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { FeedbackCategory, FeedbackStatus, SystemRole } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { FeedbackService } from './feedback.service';
import { Roles, CurrentUser } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';

class CreateFeedbackDto {
  @IsEnum(FeedbackCategory)
  category: FeedbackCategory;

  @IsString() @IsNotEmpty({ message: 'Mavzu kiritilishi shart' })
  subject: string;

  @IsString()
  @MinLength(10, { message: "Murojaat matni kamida 10 belgidan iborat bo'lishi kerak" })
  body: string;
}

class ReplyDto {
  @IsString() @MinLength(2)
  body: string;
}

class StatusDto {
  @IsEnum(FeedbackStatus)
  status: FeedbackStatus;
}

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly service: FeedbackService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFeedbackDto) {
    return this.service.create(user.id, dto);
  }

  @Get('my')
  mine(@CurrentUser() user: AuthUser) {
    return this.service.mine(user.id);
  }

  @Roles(SystemRole.ADMIN)
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: FeedbackStatus,
    @Query('category') category?: FeedbackCategory,
  ) {
    return this.service.list(user, { status, category });
  }

  @Roles(SystemRole.ADMIN)
  @Get('stats')
  stats() {
    return this.service.stats();
  }

  @Roles(SystemRole.ADMIN)
  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.findOne(user, id);
  }

  @Roles(SystemRole.ADMIN)
  @Post(':id/reply')
  reply(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReplyDto) {
    return this.service.reply(user, id, dto.body);
  }

  @Roles(SystemRole.ADMIN)
  @Post(':id/status')
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: StatusDto) {
    return this.service.setStatus(user, id, dto.status);
  }
}
