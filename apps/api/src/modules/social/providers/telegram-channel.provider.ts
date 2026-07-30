import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SocialPlatform } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TelegramService } from '../../telegram/telegram.service';

/**
 * Telegram kanal statistikasi.
 *
 * MUHIM CHEKLOV: Telegram Bot API post ko'rishlar sonini (views) bermaydi —
 * bu ma'lumot faqat MTProto (foydalanuvchi akkaunti) orqali olinadi.
 *
 * Shuning uchun bu yerda:
 *   • postlar AVTOMATIK ro'yxatga olinadi (bot kanalga admin qilinsa)
 *   • obunachilar soni AVTOMATIK olinadi (getChatMemberCount)
 *   • ko'rishlar soni QO'LDA kiritiladi (panelda "Ko'rishlarni kiritish")
 *
 * 2-bosqichda MTProto klienti qo'shilsa, ko'rishlar ham avtomatlashadi.
 */
@Injectable()
export class TelegramChannelProvider implements OnModuleInit {
  private readonly logger = new Logger(TelegramChannelProvider.name);

  constructor(
    private readonly telegram: TelegramService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    const bot = this.telegram.bot;
    if (!bot) return;

    // Kanalga yangi post chiqqanda uni bazaga yozamiz
    bot.on('channel_post', async (ctx) => {
      const chatId = String(ctx.chat.id);

      const account = await this.prisma.socialAccount.findFirst({
        where: { platform: SocialPlatform.TELEGRAM, externalId: chatId, isActive: true },
      });
      if (!account) return;

      const post = ctx.channelPost;
      const text = post.text ?? post.caption ?? '';
      const username = (ctx.chat as any).username;

      await this.prisma.socialPost.upsert({
        where: {
          accountId_externalId: {
            accountId: account.id,
            externalId: String(post.message_id),
          },
        },
        create: {
          accountId: account.id,
          externalId: String(post.message_id),
          showId: account.showId,
          title: text.slice(0, 200),
          url: username ? `https://t.me/${username}/${post.message_id}` : null,
          publishedAt: new Date(post.date * 1000),
        },
        update: {},
      });

      this.logger.log(`Telegram post yozildi: ${account.name} #${post.message_id}`);
    });

    this.logger.log("Telegram kanal handlerlari ro'yxatdan o'tdi");
  }

  /** Obunachilar soni — bu Bot API orqali olinadi */
  async fetchSubscribers(chatId: string): Promise<number | null> {
    const bot = this.telegram.bot;
    if (!bot) return null;

    try {
      return await bot.api.getChatMemberCount(chatId);
    } catch (error) {
      this.logger.warn(`Obunachilar soni olinmadi (${chatId}): ${(error as Error).message}`);
      return null;
    }
  }
}
