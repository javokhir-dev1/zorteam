import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FetchedAccount, FetchedPost } from './youtube.provider';

/**
 * Instagram Graph API.
 *
 * Talab: sahifa Business yoki Creator turida bo'lishi va
 * Facebook ilovasi orqali uzoq muddatli access token olinishi kerak
 * (instagram_basic, instagram_manage_insights ruxsatlari bilan).
 */
@Injectable()
export class InstagramProvider {
  private readonly logger = new Logger(InstagramProvider.name);
  private readonly base = 'https://graph.facebook.com/v21.0';

  constructor(private readonly config: ConfigService) {}

  get isConfigured(): boolean {
    return Boolean(this.config.get<string>('social.instagramToken'));
  }

  private get token(): string {
    return this.config.get<string>('social.instagramToken') ?? '';
  }

  async fetchAccount(accountId: string): Promise<FetchedAccount | null> {
    const url = `${this.base}/${accountId}?fields=followers_count,media_count&access_token=${this.token}`;
    const data = await this.get(url);
    if (!data) return null;

    return {
      followers: Number(data.followers_count ?? 0),
      totalViews: BigInt(0), // Instagram umumiy ko'rishlar sonini bermaydi
    };
  }

  async fetchPosts(accountId: string, limit = 50): Promise<FetchedPost[]> {
    const fields = [
      'id',
      'caption',
      'media_type',
      'media_url',
      'thumbnail_url',
      'permalink',
      'timestamp',
      'like_count',
      'comments_count',
    ].join(',');

    const url = `${this.base}/${accountId}/media?fields=${fields}&limit=${limit}&access_token=${this.token}`;
    const data = await this.get(url);

    const posts: FetchedPost[] = [];

    for (const item of data?.data ?? []) {
      // Ko'rishlar soni alohida insights so'rovi orqali olinadi
      let views = 0;
      try {
        const metric = item.media_type === 'VIDEO' ? 'video_views' : 'impressions';
        const insightsUrl = `${this.base}/${item.id}/insights?metric=${metric}&access_token=${this.token}`;
        const insights = await this.get(insightsUrl);
        views = Number(insights?.data?.[0]?.values?.[0]?.value ?? 0);
      } catch {
        // Insights ba'zi post turlarida mavjud emas — bu xato emas
      }

      posts.push({
        externalId: item.id,
        title: (item.caption ?? '').slice(0, 200),
        url: item.permalink,
        thumbnailUrl: item.thumbnail_url ?? item.media_url,
        publishedAt: new Date(item.timestamp),
        views,
        likes: Number(item.like_count ?? 0),
        comments: Number(item.comments_count ?? 0),
      });
    }

    return posts;
  }

  private async get(url: string): Promise<any> {
    const response = await fetch(url);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Instagram API (${response.status}): ${text.slice(0, 300)}`);
    }
    return response.json();
  }
}
