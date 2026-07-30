import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { SocialPlatform, SystemRole } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { SocialService } from './social.service';
import { Roles, CurrentUser } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';

class UpsertAccountDto {
  @IsEnum(SocialPlatform)
  platform: SocialPlatform;

  @IsString() @IsNotEmpty({ message: 'Nom kiritilishi shart' })
  name: string;

  @IsString() @IsNotEmpty({ message: 'Kanal/akkaunt ID kiritilishi shart' })
  externalId: string;

  @IsOptional() @IsString() handle?: string;
  @IsOptional() @IsString() url?: string;
  @IsOptional() @IsString() showId?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class SetViewsDto {
  @Type(() => Number) @IsInt() @Min(0)
  views: number;
}

@Controller('social')
@Roles(SystemRole.ADMIN, SystemRole.VIEWER, SystemRole.DEPT_HEAD)
export class SocialController {
  constructor(private readonly service: SocialService) {}

  @Get('accounts')
  listAccounts() {
    return this.service.listAccounts();
  }

  @Roles(SystemRole.ADMIN)
  @Post('accounts')
  createAccount(@CurrentUser() user: AuthUser, @Body() dto: UpsertAccountDto) {
    return this.service.upsertAccount(user, dto);
  }

  @Roles(SystemRole.ADMIN)
  @Patch('accounts/:id')
  updateAccount(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpsertAccountDto,
  ) {
    return this.service.upsertAccount(user, dto, id);
  }

  @Roles(SystemRole.ADMIN)
  @Post('accounts/:id/sync')
  sync(@Param('id') id: string) {
    return this.service.syncAccount(id);
  }

  @Roles(SystemRole.ADMIN)
  @Post('sync-all')
  syncAll() {
    return this.service.syncAll();
  }

  @Get('posts')
  listPosts(
    @Query('accountId') accountId?: string,
    @Query('showId') showId?: string,
    @Query('take') take?: string,
  ) {
    return this.service.listPosts({ accountId, showId, take: take ? Number(take) : undefined });
  }

  /** Telegram postlari uchun ko'rishlarni qo'lda kiritish */
  @Roles(SystemRole.ADMIN)
  @Post('posts/:id/views')
  setViews(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetViewsDto) {
    return this.service.setPostViews(user, id, dto.views);
  }

  @Get('monthly')
  monthly(@Query('year') year?: string, @Query('month') month?: string) {
    const now = new Date();
    return this.service.monthlyComparison(
      year ? Number(year) : now.getFullYear(),
      month ? Number(month) : now.getMonth() + 1,
    );
  }

  @Get('accounts/:id/trend')
  trend(@Param('id') id: string, @Query('months') months?: string) {
    return this.service.accountTrend(id, months ? Number(months) : 12);
  }
}
