import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  EvaluationTargetType,
  EvaluationTrigger,
  EvaluatorKind,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AccessService } from '../../common/auth/access.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../telegram/notifications.service';
import { TelegramService } from '../telegram/telegram.service';
import { openMiniApp } from '../telegram/keyboards';
import { dayjs, monthRange } from '../../common/utils/dates';
import type { AuthUser } from '../../common/auth/auth.types';
import type { SubmitEvaluationDto, UpsertRuleDto } from './dto';

@Injectable()
export class EvaluationsService {
  private readonly logger = new Logger(EvaluationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly telegram: TelegramService,
  ) {}

  // ============================================================
  //  Baholash matritsasi (kim kimni baholaydi)
  // ============================================================

  listRules() {
    return this.prisma.evaluationRule.findMany({
      include: {
        criteria: { orderBy: { sortOrder: 'asc' } },
        evaluatorUser: { select: { id: true, fullName: true } },
        evaluatorDepartment: { select: { id: true, name: true } },
        targetDepartment: { select: { id: true, name: true } },
        targetCrewRole: { select: { id: true, name: true } },
        _count: { select: { evaluations: true } },
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async upsertRule(actor: AuthUser, dto: UpsertRuleDto, id?: string) {
    this.validateRule(dto);

    const rule = await this.prisma.$transaction(async (tx) => {
      const data = {
        name: dto.name,
        targetType: dto.targetType,
        trigger: dto.trigger ?? EvaluationTrigger.AFTER_EPISODE,
        evaluatorKind: dto.evaluatorKind,
        evaluatorUserId: dto.evaluatorUserId || null,
        evaluatorDepartmentId: dto.evaluatorDepartmentId || null,
        targetDepartmentId: dto.targetDepartmentId || null,
        targetCrewRoleId: dto.targetCrewRoleId || null,
        windowHours: dto.windowHours ?? 48,
        isActive: dto.isActive ?? true,
      };

      const saved = id
        ? await tx.evaluationRule.update({ where: { id }, data })
        : await tx.evaluationRule.create({ data });

      if (dto.criteria?.length) {
        // Ishlatilgan mezonlarni o'chirmaymiz — eski baholar buzilmasligi uchun
        const keepIds = dto.criteria.filter((c) => c.id).map((c) => c.id!);

        await tx.evaluationCriterion.deleteMany({
          where: {
            ruleId: saved.id,
            id: { notIn: keepIds.length ? keepIds : ['__none__'] },
            scores: { none: {} },
          },
        });

        for (const [index, criterion] of dto.criteria.entries()) {
          const payload = {
            name: criterion.name,
            weight: criterion.weight ?? 1,
            maxScore: criterion.maxScore ?? 5,
            sortOrder: criterion.sortOrder ?? index,
          };

          if (criterion.id) {
            await tx.evaluationCriterion.update({ where: { id: criterion.id }, data: payload });
          } else {
            await tx.evaluationCriterion.create({ data: { ...payload, ruleId: saved.id } });
          }
        }
      }

      return tx.evaluationRule.findUnique({
        where: { id: saved.id },
        include: { criteria: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    await this.audit.log(actor.id, id ? 'evalRule.update' : 'evalRule.create', 'EvaluationRule', rule!.id, null, rule);
    return rule;
  }

  private validateRule(dto: UpsertRuleDto) {
    if (dto.evaluatorKind === EvaluatorKind.SPECIFIC_USER && !dto.evaluatorUserId) {
      throw new BadRequestException('Aniq baholovchi tanlanishi kerak');
    }

    if (
      dto.targetType === EvaluationTargetType.SHOW &&
      !([EvaluatorKind.ASSIGNED_CREW, EvaluatorKind.SPECIFIC_USER] as EvaluatorKind[]).includes(
        dto.evaluatorKind,
      )
    ) {
      throw new BadRequestException(
        "Prodakshnni faqat biriktirilgan hodimlar yoki aniq belgilangan hodim baholay oladi",
      );
    }
  }

  // ============================================================
  //  Baholash oynasini ochish
  // ============================================================

  /**
   * Efir tugagach barcha tegishli baholash yozuvlarini ochadi.
   * Har bir qoida uchun "kim kimni baholaydi" juftliklari hosil qilinadi.
   */
  async openForEpisode(episodeId: string) {
    const episode = await this.prisma.showEpisode.findUnique({
      where: { id: episodeId },
      include: {
        show: { select: { id: true, name: true, productionId: true } },
        assignments: {
          include: {
            user: { select: { id: true, fullName: true, departmentId: true } },
            crewRole: { select: { id: true } },
          },
        },
      },
    });

    if (!episode) throw new NotFoundException('Efir topilmadi');
    if (!episode.assignments.length) return { created: 0 };

    const rules = await this.prisma.evaluationRule.findMany({
      where: { isActive: true, trigger: EvaluationTrigger.AFTER_EPISODE },
      include: { criteria: true },
    });

    const showLeaders = await this.prisma.showLeader.findMany({
      where: { showId: episode.showId },
      select: { userId: true },
    });

    let created = 0;
    const notifyUsers = new Set<string>();

    for (const rule of rules) {
      if (!rule.criteria.length) continue;

      const pairs = await this.buildPairs(rule, episode, showLeaders.map((l) => l.userId));

      for (const pair of pairs) {
        const exists = await this.prisma.evaluation.findFirst({
          where: {
            ruleId: rule.id,
            evaluatorId: pair.evaluatorId,
            episodeId,
            targetUserId: pair.targetUserId ?? null,
            targetShowId: pair.targetShowId ?? null,
          },
          select: { id: true },
        });
        if (exists) continue;

        await this.prisma.evaluation.create({
          data: {
            ruleId: rule.id,
            evaluatorId: pair.evaluatorId,
            targetType: rule.targetType,
            targetUserId: pair.targetUserId ?? null,
            targetShowId: pair.targetShowId ?? null,
            episodeId,
            overallScore: 0,
            expiresAt: dayjs().add(rule.windowHours, 'hour').toDate(),
          },
        });

        created++;
        notifyUsers.add(pair.evaluatorId);
      }
    }

    // Baholovchilarga botga xabar
    for (const userId of notifyUsers) {
      const pending = await this.prisma.evaluation.count({
        where: { evaluatorId: userId, submittedAt: null, expiresAt: { gt: new Date() } },
      });

      await this.notifications.notify({
        userId,
        type: NotificationType.EVALUATION_OPEN,
        title: '⭐ Baholash oynasi ochildi',
        body: [
          `<b>${episode.show.name}</b> yakunlandi.`,
          '',
          `Sizda ${pending} ta baholash kutilmoqda.`,
          'Oyna belgilangan muddatdan keyin yopiladi.',
        ].join('\n'),
        payload: { episodeId },
        extra: {
          reply_markup: this.telegram.miniAppKeyboard('⭐ Baholashni ochish', '/baholash'),
        },
      });
    }

    this.logger.log(`Efir ${episodeId}: ${created} ta baholash ochildi`);
    return { created };
  }

  /** Qoidaga ko'ra "baholovchi → baholanuvchi" juftliklarini hosil qiladi */
  private async buildPairs(
    rule: Prisma.EvaluationRuleGetPayload<{ include: { criteria: true } }>,
    episode: any,
    showLeaderIds: string[],
  ): Promise<{ evaluatorId: string; targetUserId?: string; targetShowId?: string }[]> {
    // Baholanadigan hodimlar (qoidadagi filtrlarga mos)
    const targets = episode.assignments.filter((assignment: any) => {
      if (rule.targetCrewRoleId && assignment.crewRoleId !== rule.targetCrewRoleId) return false;
      if (rule.targetDepartmentId && assignment.user.departmentId !== rule.targetDepartmentId) {
        return false;
      }
      return true;
    });

    if (!targets.length) return [];

    const pairs: { evaluatorId: string; targetUserId?: string; targetShowId?: string }[] = [];

    // --- Prodakshnni baholash ---
    if (rule.targetType === EvaluationTargetType.SHOW) {
      if (rule.evaluatorKind === EvaluatorKind.ASSIGNED_CREW) {
        for (const assignment of targets) {
          pairs.push({ evaluatorId: assignment.userId, targetShowId: episode.showId });
        }
      } else if (rule.evaluatorKind === EvaluatorKind.SPECIFIC_USER && rule.evaluatorUserId) {
        pairs.push({ evaluatorId: rule.evaluatorUserId, targetShowId: episode.showId });
      }
      return pairs;
    }

    // --- Hodimni baholash ---
    for (const assignment of targets) {
      const targetUserId = assignment.userId;

      switch (rule.evaluatorKind) {
        case EvaluatorKind.DEPARTMENT_HEAD: {
          if (!assignment.user.departmentId) break;
          const heads = await this.prisma.departmentHead.findMany({
            where: { departmentId: assignment.user.departmentId },
            select: { userId: true },
          });
          for (const head of heads) {
            if (head.userId !== targetUserId) {
              pairs.push({ evaluatorId: head.userId, targetUserId });
            }
          }
          break;
        }

        case EvaluatorKind.SHOW_LEADER: {
          for (const leaderId of showLeaderIds) {
            if (leaderId !== targetUserId) pairs.push({ evaluatorId: leaderId, targetUserId });
          }
          break;
        }

        case EvaluatorKind.CREW_PEER: {
          for (const peer of episode.assignments) {
            if (peer.userId !== targetUserId) {
              pairs.push({ evaluatorId: peer.userId, targetUserId });
            }
          }
          break;
        }

        case EvaluatorKind.SPECIFIC_USER: {
          if (rule.evaluatorUserId && rule.evaluatorUserId !== targetUserId) {
            pairs.push({ evaluatorId: rule.evaluatorUserId, targetUserId });
          }
          break;
        }

        default:
          break;
      }
    }

    return pairs;
  }

  // ============================================================
  //  Baholash
  // ============================================================

  /** Menga ochilgan, hali topshirilmagan baholashlar */
  async myPending(userId: string) {
    return this.prisma.evaluation.findMany({
      where: {
        evaluatorId: userId,
        submittedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: {
        rule: { include: { criteria: { orderBy: { sortOrder: 'asc' } } } },
        targetUser: { select: { id: true, fullName: true, position: true } },
        targetShow: { select: { id: true, name: true } },
        episode: {
          select: { id: true, title: true, airAt: true, recordAt: true, show: { select: { name: true } } },
        },
      },
      orderBy: { openedAt: 'asc' },
    });
  }

  async submit(userId: string, evaluationId: string, dto: SubmitEvaluationDto) {
    const evaluation = await this.prisma.evaluation.findUnique({
      where: { id: evaluationId },
      include: { rule: { include: { criteria: true } } },
    });

    if (!evaluation) throw new NotFoundException('Baholash topilmadi');
    if (evaluation.evaluatorId !== userId) {
      throw new ForbiddenException('Bu baholash sizga tegishli emas');
    }
    if (evaluation.submittedAt) {
      throw new BadRequestException('Bu baholash allaqachon topshirilgan');
    }
    if (evaluation.expiresAt && evaluation.expiresAt < new Date()) {
      throw new BadRequestException('Baholash oynasi yopilgan');
    }

    const criteriaById = new Map(evaluation.rule.criteria.map((c) => [c.id, c]));

    // Har bir mezon bahosi kelganini va chegaradan chiqmaganini tekshiramiz
    for (const criterion of evaluation.rule.criteria) {
      const score = dto.scores.find((s) => s.criterionId === criterion.id);
      if (!score) {
        throw new BadRequestException(`"${criterion.name}" mezoni baholanmagan`);
      }
      if (score.score < 0 || score.score > criterion.maxScore) {
        throw new BadRequestException(
          `"${criterion.name}" uchun baho 0 dan ${criterion.maxScore} gacha bo'lishi kerak`,
        );
      }
    }

    // Vaznli o'rtacha (5 ballik shkalaga keltirilgan)
    let weightedSum = 0;
    let weightTotal = 0;
    for (const score of dto.scores) {
      const criterion = criteriaById.get(score.criterionId);
      if (!criterion) continue;
      weightedSum += (score.score / criterion.maxScore) * 5 * criterion.weight;
      weightTotal += criterion.weight;
    }
    const overallScore = weightTotal ? Number((weightedSum / weightTotal).toFixed(2)) : 0;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.evaluationScore.deleteMany({ where: { evaluationId } });
      await tx.evaluationScore.createMany({
        data: dto.scores.map((s) => ({
          evaluationId,
          criterionId: s.criterionId,
          score: s.score,
        })),
      });

      return tx.evaluation.update({
        where: { id: evaluationId },
        data: { overallScore, comment: dto.comment, submittedAt: new Date() },
      });
    });

    await this.audit.log(userId, 'evaluation.submit', 'Evaluation', evaluationId, null, {
      overallScore,
    });

    return updated;
  }

  // ============================================================
  //  Natijalar
  // ============================================================

  /** Hodimning reytingi va baholar tarixi */
  async userRating(actor: AuthUser, userId: string, months = 6) {
    await this.access.assertManagesUser(actor, userId);

    const since = dayjs().subtract(months, 'month').startOf('month').toDate();

    const evaluations = await this.prisma.evaluation.findMany({
      where: {
        targetUserId: userId,
        submittedAt: { not: null, gte: since },
      },
      include: {
        rule: { select: { name: true } },
        evaluator: { select: { id: true, fullName: true } },
        episode: { select: { id: true, title: true, show: { select: { name: true } } } },
        scores: { include: { criterion: { select: { name: true } } } },
      },
      orderBy: { submittedAt: 'desc' },
    });

    const average = evaluations.length
      ? Number(
          (evaluations.reduce((sum, e) => sum + e.overallScore, 0) / evaluations.length).toFixed(2),
        )
      : null;

    // Oylik dinamika
    const byMonth = new Map<string, { sum: number; count: number }>();
    for (const evaluation of evaluations) {
      const key = dayjs(evaluation.submittedAt!).format('YYYY-MM');
      const bucket = byMonth.get(key) ?? { sum: 0, count: 0 };
      bucket.sum += evaluation.overallScore;
      bucket.count++;
      byMonth.set(key, bucket);
    }

    return {
      average,
      count: evaluations.length,
      monthly: [...byMonth.entries()]
        .map(([month, v]) => ({ month, average: Number((v.sum / v.count).toFixed(2)), count: v.count }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      evaluations,
    };
  }

  /** Prodakshn (ko'rsatuv) reytingi — hodimlar qo'ygan baholar */
  async showRating(showId: string, months = 6) {
    const since = dayjs().subtract(months, 'month').startOf('month').toDate();

    const evaluations = await this.prisma.evaluation.findMany({
      where: { targetShowId: showId, submittedAt: { not: null, gte: since } },
      include: {
        evaluator: { select: { id: true, fullName: true, position: true } },
        episode: { select: { id: true, title: true, airAt: true } },
        scores: { include: { criterion: { select: { name: true } } } },
      },
      orderBy: { submittedAt: 'desc' },
    });

    const average = evaluations.length
      ? Number(
          (evaluations.reduce((sum, e) => sum + e.overallScore, 0) / evaluations.length).toFixed(2),
        )
      : null;

    // Mezonlar bo'yicha o'rtacha — qaysi jihat oqsayotganini ko'rsatadi
    const byCriterion = new Map<string, { sum: number; count: number }>();
    for (const evaluation of evaluations) {
      for (const score of evaluation.scores) {
        const key = score.criterion.name;
        const bucket = byCriterion.get(key) ?? { sum: 0, count: 0 };
        bucket.sum += score.score;
        bucket.count++;
        byCriterion.set(key, bucket);
      }
    }

    return {
      average,
      count: evaluations.length,
      byCriterion: [...byCriterion.entries()].map(([name, v]) => ({
        name,
        average: Number((v.sum / v.count).toFixed(2)),
      })),
      evaluations,
    };
  }

  /** Oylik reyting jadvali — hisobotlar uchun */
  async monthlyLeaderboard(year: number, month: number, departmentId?: string) {
    const { start, end } = monthRange(year, month);

    const evaluations = await this.prisma.evaluation.findMany({
      where: {
        targetUserId: { not: null },
        submittedAt: { not: null, gte: start, lte: end },
        targetUser: departmentId ? { departmentId } : undefined,
      },
      select: {
        overallScore: true,
        targetUser: {
          select: {
            id: true,
            fullName: true,
            position: true,
            department: { select: { name: true } },
          },
        },
      },
    });

    const byUser = new Map<string, { user: any; sum: number; count: number }>();
    for (const evaluation of evaluations) {
      if (!evaluation.targetUser) continue;
      const bucket = byUser.get(evaluation.targetUser.id) ?? {
        user: evaluation.targetUser,
        sum: 0,
        count: 0,
      };
      bucket.sum += evaluation.overallScore;
      bucket.count++;
      byUser.set(evaluation.targetUser.id, bucket);
    }

    return [...byUser.values()]
      .map((b) => ({
        user: b.user,
        average: Number((b.sum / b.count).toFixed(2)),
        count: b.count,
      }))
      .sort((a, b) => b.average - a.average);
  }
}
