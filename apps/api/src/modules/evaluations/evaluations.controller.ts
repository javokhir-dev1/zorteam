import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { SystemRole } from '@prisma/client';
import { EvaluationsService } from './evaluations.service';
import { SubmitEvaluationDto, UpsertRuleDto } from './dto';
import { Roles, CurrentUser } from '../../common/auth/decorators';
import type { AuthUser } from '../../common/auth/auth.types';

@Controller('evaluations')
export class EvaluationsController {
  constructor(private readonly service: EvaluationsService) {}

  // ---- Baholash matritsasi (admin) ----

  @Roles(SystemRole.ADMIN, SystemRole.VIEWER)
  @Get('rules')
  listRules() {
    return this.service.listRules();
  }

  @Roles(SystemRole.ADMIN)
  @Post('rules')
  createRule(@CurrentUser() user: AuthUser, @Body() dto: UpsertRuleDto) {
    return this.service.upsertRule(user, dto);
  }

  @Roles(SystemRole.ADMIN)
  @Patch('rules/:id')
  updateRule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertRuleDto) {
    return this.service.upsertRule(user, dto, id);
  }

  // ---- Hodim uchun ----

  @Get('my-pending')
  myPending(@CurrentUser() user: AuthUser) {
    return this.service.myPending(user.id);
  }

  @Post(':id/submit')
  submit(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SubmitEvaluationDto,
  ) {
    return this.service.submit(user.id, id, dto);
  }

  // ---- Natijalar ----

  @Get('user/:userId')
  userRating(
    @CurrentUser() user: AuthUser,
    @Param('userId') userId: string,
    @Query('months') months?: string,
  ) {
    return this.service.userRating(user, userId, months ? Number(months) : 6);
  }

  @Roles(SystemRole.ADMIN, SystemRole.DEPT_HEAD, SystemRole.VIEWER)
  @Get('show/:showId')
  showRating(@Param('showId') showId: string, @Query('months') months?: string) {
    return this.service.showRating(showId, months ? Number(months) : 6);
  }

  @Roles(SystemRole.ADMIN, SystemRole.DEPT_HEAD, SystemRole.VIEWER)
  @Get('leaderboard')
  leaderboard(
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('departmentId') departmentId?: string,
  ) {
    const now = new Date();
    return this.service.monthlyLeaderboard(
      year ? Number(year) : now.getFullYear(),
      month ? Number(month) : now.getMonth() + 1,
      departmentId,
    );
  }

  /** Efir uchun baholash oynasini qo'lda ochish */
  @Roles(SystemRole.ADMIN, SystemRole.DEPT_HEAD)
  @Post('open/:episodeId')
  open(@Param('episodeId') episodeId: string) {
    return this.service.openForEpisode(episodeId);
  }
}
