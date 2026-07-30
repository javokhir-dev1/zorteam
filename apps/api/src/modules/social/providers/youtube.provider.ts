import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface FetchedPost {
  externalId: string;
  title: string;
  url: string;
  thumbnailUrl?: string;
  publishedAt: Date;
  views: number;
  likes: number;
  comments: number;
  shares?: number;
}

export interface FetchedAccount {
  followers: number;
  totalViews: bigint;
}

/**
 * YouTube Data API v3.
 * Kerak: YOUTUBE_API_KEY (Google Cloud Console → API key).
 * Kanal ID kanal sahifasidan olinadi (UC... bilan boshlanadi).
 */
@Injectable()
export class YoutubeProvider {
  private readonly logger = new Logger(YoutubeProvider.name);
  private readonly base = 'https://www.googleapis.com/youtube/v3';

  constructor(private readonly config: ConfigService) {}

  get isConfigured(): boolean {
    return Boolean(this.config.get<string>('social.youtubeApiKey'));
  }

  private get apiKey(): string {
    return this.config.get<string>('social.youtubeApiKey') ?? '';
  }

  async fetchAccount(channelId: string): Promise<FetchedAccount | null> {
    const url = `${this.base}/channels?part=statistics,contentDetails&id=${channelId}&key=${this.apiKey}`;
    const data = await this.get(url);
    const item = data?.items?.[0];
    if (!item) return null;

    return {
      followers: Number(item.statistics?.subscriberCount ?? 0),
      totalViews: BigInt(item.statistics?.viewCount ?? 0),
    };
  }

  /** Oxirgi videolar va ularning ko'rish statistikasi */
  async fetchPosts(channelId: string, limit = 50): Promise<FetchedPost[]> {
    // 1. Kanalning "uploads" pleylisti
    const channelUrl = `${this.base}/channels?part=contentDetails&id=${channelId}&key=${this.apiKey}`;
    const channelData = await this.get(channelUrl);
    const uploadsId = channelData?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsId) return [];

    // 2. Pleylistdagi videolar
    const playlistUrl = `${this.base}/playlistItems?part=snippet,contentDetails&playlistId=${uploadsId}&maxResults=${Math.min(limit, 50)}&key=${this.apiKey}`;
    const playlistData = await this.get(playlistUrl);
    const videoIds: string[] = (playlistData?.items ?? [])
      .map((item: any) => item.contentDetails?.videoId)
      .filter(Boolean);

    if (!videoIds.length) return [];

    // 3. Videolar statistikasi
    const videosUrl = `${this.base}/videos?part=snippet,statistics&id=${videoIds.join(',')}&key=${this.apiKey}`;
    const videosData = await this.get(videosUrl);

    return (videosData?.items ?? []).map((video: any) => ({
      externalId: video.id,
      title: video.snippet?.title ?? '',
      url: `https://www.youtube.com/watch?v=${video.id}`,
      thumbnailUrl: video.snippet?.thumbnails?.medium?.url,
      publishedAt: new Date(video.snippet?.publishedAt),
      views: Number(video.statistics?.viewCount ?? 0),
      likes: Number(video.statistics?.likeCount ?? 0),
      comments: Number(video.statistics?.commentCount ?? 0),
    }));
  }

  private async get(url: string): Promise<any> {
    const response = await fetch(url);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`YouTube API (${response.status}): ${text.slice(0, 300)}`);
    }
    return response.json();
  }
}
