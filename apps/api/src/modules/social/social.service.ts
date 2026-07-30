import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SocialPlatform } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { YoutubeProvider, type FetchedPost } from './providers/youtube.provider';
import { InstagramProvider } from './providers/instagram.provider';
import { TelegramChannelProvider } from './providers/telegram-channel.provider';
import { dayjs, monthRange, uzMonthName } from '../../common/utils/dates';
import type { AuthUser } from '../../common/auth/auth.types';

export interface UpsertAccountInput {
  platform: SocialPlatform;
  name: string;
  externalId: string;
  handle?: string;
  url?: string;
  showId?: string | null;
  isActive?: boolean;
}

@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly youtube: YoutubeProvider,
    private readonly instagram: InstagramProvider,
    private readonly telegramChannel: TelegramChannelProvider,
  ) {}

  // ============================================================
  //  Akkauntlar
  // ============================================================

  listAccounts() {
    return this.prisma.socialAccount.findMany({
      include: {
        show: { select: { id: true, name: true } },
        _count: { select: { posts: true } },
      },
      orderBy: [{ platform: 'asc' }, { name: 'asc' }],
    });
  }

  async upsertAccount(actor: AuthUser, dto: UpsertAccountInput, id?: string) {
    const account = id
      ? await this.prisma.socialAccount.update({
          where: { id },
          data: {
            name: dto.name,
            handle: dto.handle,
            url: dto.url,
            showId: dto.showId || null,
            isActive: dto.isActive,
          },
        })
      : await this.prisma.socialAccount.create({
          data: {
            platform: dto.platform,
            name: dto.name,
            externalId: dto.externalId,
            handle: dto.handle,
            url: dto.url,
            showId: dto.showId || null,
          },
        });

    await this.audit.log(actor.id, id ? 'social.update' : 'social.create', 'SocialAccount', account.id, null, account);
    return account;
  }

  // ============================================================
  //  Sinxronizatsiya
  // ============================================================

  async syncAccount(accountId: string) {
    const account = await this.prisma.socialAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Akkaunt topilmadi');

    try {
      let posts: FetchedPost[] = [];
      let followers = 0;
      let totalViews = BigInt(0);

      switch (account.platform) {
        case SocialPlatform.YOUTUBE: {
          if (!this.youtube.isConfigured) {
            throw new Error('YOUTUBE_API_KEY sozlanmagan');
          }
          const info = await this.youtube.fetchAccount(account.externalId);
          followers = info?.followers ?? 0;
          totalViews = info?.totalViews ?? BigInt(0);
          posts = await this.youtube.fetchPosts(account.externalId);
          break;
        }

        case SocialPlatform.INSTAGRAM: {
          if (!this.instagram.isConfigured) {
            throw new Error('INSTAGRAM_ACCESS_TOKEN sozlanmagan');
          }
          const info = await this.instagram.fetchAccount(account.externalId);
          followers = info?.followers ?? 0;
          posts = await this.instagram.fetchPosts(account.externalId);
          break;
        }

        case SocialPlatform.TELEGRAM: {
          // Postlar channel_post orqali avtomatik yoziladi,
          // ko'rishlar soni qo'lda kiritiladi (Bot API bermaydi)
          followers = (await this.telegramChannel.fetchSubscribers(account.externalId)) ?? 0;
          break;
        }
      }

      // Postlarni saqlash va o'sish kesimini yozish
      for (const post of posts) {
        const saved = await this.prisma.socialPost.upsert({
          where: {
            accountId_externalId: { accountId: account.id, externalId: post.externalId },
          },
          create: {
            accountId: account.id,
            externalId: post.externalId,
            showId: account.showId,
            title: post.title,
            url: post.url,
            thumbnailUrl: post.thumbnailUrl,
            publishedAt: post.publishedAt,
            views: post.views,
            likes: post.likes,
            comments: post.comments,
            shares: post.shares ?? 0,
          },
          update: {
            title: post.title,
            views: post.views,
            likes: post.likes,
            comments: post.comments,
            shares: post.shares ?? 0,
            lastSyncedAt: new Date(),
          },
        });

        await this.prisma.socialPostMetric.create({
          data: {
            postId: saved.id,
            views: post.views,
            likes: post.likes,
            comments: post.comments,
            shares: post.shares ?? 0,
          },
        });
      }

      await this.prisma.socialAccountSnapshot.create({
        data: { accountId: account.id, followers, totalViews },
      });

      await this.prisma.socialAccount.update({
        where: { id: account.id },
        data: { lastSyncedAt: new Date(), syncError: null },
      });

      this.logger.log(`${account.name}: ${posts.length} ta post sinxronlandi`);
      return { ok: true, posts: posts.length, followers };
    } catch (error) {
      const message = (error as Error).message;
      await this.prisma.socialAccount.update({
        where: { id: account.id },
        data: { syncError: message, lastSyncedAt: new Date() },
      });
      this.logger.warn(`${account.name} sinxronlanmadi: ${message}`);
      return { ok: false, error: message };
    }
  }

  async syncAll() {
    const accounts = await this.prisma.socialAccount.findMany({ where: { isActive: true } });
    const results: {
      account: string;
      ok: boolean;
      posts?: number;
      followers?: number;
      error?: string;
    }[] = [];
    for (const account of accounts) {
      results.push({ account: account.name, ...(await this.syncAccount(account.id)) });
    }
    return results;
  }

  /**
   * Telegram postlari uchun ko'rishlar sonini qo'lda kiritish.
   * (Bot API bu ma'lumotni bermaydi — 1-bosqich cheklovi)
   */
  async setPostViews(actor: AuthUser, postId: string, views: number) {
    if (views < 0) throw new BadRequestException("Ko'rishlar soni manfiy bo'la olmaydi");

    const post = await this.prisma.socialPost.update({
      where: { id: postId },
      data: { views, lastSyncedAt: new Date() },
    });

    await this.prisma.socialPostMetric.create({
      data: { postId, views, likes: post.likes, comments: post.comments, shares: post.shares },
    });

    await this.audit.log(actor.id, 'social.setViews', 'SocialPost', postId, null, { views });
    return post;
  }

  // ============================================================
  //  Oylik solishtirma tahlil
  // ============================================================

  /** Berilgan oy uchun har akkauntning ko'rsatkichlarini hisoblaydi */
  async computeMonthly(year: number, month: number) {
    const { start, end } = monthRange(year, month);
    const accounts = await this.prisma.socialAccount.findMany({ where: { isActive: true } });

    const results: Awaited<ReturnType<typeof this.prisma.socialMonthlyStat.upsert>>[] = [];

    for (const account of accounts) {
      const posts = await this.prisma.socialPost.findMany({
        where: { accountId: account.id, publishedAt: { gte: start, lte: end } },
        select: { views: true, likes: true, comments: true },
      });

      const views = posts.reduce((sum, p) => sum + p.views, 0);
      const likes = posts.reduce((sum, p) => sum + p.likes, 0);
      const comments = posts.reduce((sum, p) => sum + p.comments, 0);

      // Oldingi oy
      const prev = dayjs(start).subtract(1, 'month');
      const previous = await this.prisma.socialMonthlyStat.findUnique({
        where: {
          accountId_year_month: {
            accountId: account.id,
            year: prev.year(),
            month: prev.month() + 1,
          },
        },
      });

      const prevViews = previous?.views ?? 0;
      const deltaPercent = prevViews
        ? Number((((views - prevViews) / prevViews) * 100).toFixed(1))
        : 0;

      const snapshot = await this.prisma.socialAccountSnapshot.findFirst({
        where: { accountId: account.id, capturedAt: { lte: end } },
        orderBy: { capturedAt: 'desc' },
      });

      const stat = await this.prisma.socialMonthlyStat.upsert({
        where: { accountId_year_month: { accountId: account.id, year, month } },
        create: {
          accountId: account.id,
          year,
          month,
          views,
          likes,
          comments,
          postCount: posts.length,
          followers: snapshot?.followers ?? 0,
          prevViews,
          deltaPercent,
        },
        update: {
          views,
          likes,
          comments,
          postCount: posts.length,
          followers: snapshot?.followers ?? 0,
          prevViews,
          deltaPercent,
          computedAt: new Date(),
        },
      });

      results.push(stat);
    }

    return results;
  }

  /** Panel uchun: oylik solishtirma, ko'rsatuvlar kesimida */
  async monthlyComparison(year: number, month: number) {
    await this.computeMonthly(year, month);

    const stats = await this.prisma.socialMonthlyStat.findMany({
      where: { year, month },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            platform: true,
            handle: true,
            url: true,
            show: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { views: 'desc' },
    });

    // Ko'rsatuvlar kesimida yig'ish
    const byShow = new Map<string, { showId: string | null; name: string; views: number; prevViews: number }>();

    for (const stat of stats) {
      const key = stat.account.show?.id ?? '__none__';
      const bucket = byShow.get(key) ?? {
        showId: stat.account.show?.id ?? null,
        name: stat.account.show?.name ?? "Ko'rsatuvga bog'lanmagan",
        views: 0,
        prevViews: 0,
      };
      bucket.views += stat.views;
      bucket.prevViews += stat.prevViews;
      byShow.set(key, bucket);
    }

    const shows = [...byShow.values()]
      .map((s) => ({
        ...s,
        deltaPercent: s.prevViews
          ? Number((((s.views - s.prevViews) / s.prevViews) * 100).toFixed(1))
          : 0,
      }))
      .sort((a, b) => b.views - a.views);

    const totalViews = stats.reduce((sum, s) => sum + s.views, 0);
    const totalPrev = stats.reduce((sum, s) => sum + s.prevViews, 0);

    return {
      period: { year, month, label: `${uzMonthName(month)} ${year}` },
      total: {
        views: totalViews,
        prevViews: totalPrev,
        deltaPercent: totalPrev
          ? Number((((totalViews - totalPrev) / totalPrev) * 100).toFixed(1))
          : 0,
        posts: stats.reduce((sum, s) => sum + s.postCount, 0),
        followers: stats.reduce((sum, s) => sum + s.followers, 0),
      },
      accounts: stats,
      shows,
    };
  }

  /** Bir akkauntning oylar bo'yicha dinamikasi (grafik uchun) */
  async accountTrend(accountId: string, months = 12) {
    const from = dayjs().subtract(months, 'month');

    return this.prisma.socialMonthlyStat.findMany({
      where: {
        accountId,
        OR: [
          { year: { gt: from.year() } },
          { year: from.year(), month: { gte: from.month() + 1 } },
        ],
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });
  }

  async listPosts(params: { accountId?: string; showId?: string; take?: number }) {
    return this.prisma.socialPost.findMany({
      where: {
        accountId: params.accountId,
        showId: params.showId,
      },
      include: {
        account: { select: { id: true, name: true, platform: true } },
        show: { select: { id: true, name: true } },
      },
      orderBy: { publishedAt: 'desc' },
      take: Math.min(params.take ?? 50, 200),
    });
  }
}
