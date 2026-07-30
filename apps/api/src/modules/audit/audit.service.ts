import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * Tizimdagi muhim o'zgarishlarni jurnalga yozadi.
 * "Kim, qachon, nimani o'zgartirdi" savoliga javob beradi —
 * davomat va baholar bilan bog'liq nizolarda muhim.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(
    actorId: string | null,
    action: string,
    entityType: string,
    entityId?: string | null,
    before?: unknown,
    after?: unknown,
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: actorId ?? null,
          action,
          entityType,
          entityId: entityId ?? null,
          before: before ? (JSON.parse(JSON.stringify(before, replacer)) as any) : undefined,
          after: after ? (JSON.parse(JSON.stringify(after, replacer)) as any) : undefined,
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
        },
      });
    } catch (error) {
      // Jurnal yozilmasa ham asosiy amal to'xtamasligi kerak
      this.logger.warn(`Audit yozilmadi (${action}): ${(error as Error).message}`);
    }
  }

  async list(params: {
    entityType?: string;
    entityId?: string;
    actorId?: string;
    take?: number;
    skip?: number;
  }) {
    const { entityType, entityId, actorId, take = 50, skip = 0 } = params;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where: { entityType, entityId, actorId },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: { actor: { select: { id: true, fullName: true } } },
      }),
      this.prisma.auditLog.count({ where: { entityType, entityId, actorId } }),
    ]);

    return { items, total };
  }
}

/** BigInt va Date qiymatlarini JSON'ga xavfsiz aylantirish */
function replacer(_key: string, value: unknown) {
  if (typeof value === 'bigint') return value.toString();
  return value;
}
