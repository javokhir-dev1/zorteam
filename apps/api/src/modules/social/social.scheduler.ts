import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SocialService } from './social.service';
import { dayjs } from '../../common/utils/dates';

@Injectable()
export class SocialScheduler {
  private readonly logger = new Logger(SocialScheduler.name);
  private busy = false;

  constructor(private readonly social: SocialService) {}

  /** Har kuni tunda statistikani yangilaymiz */
  @Cron('30 3 * * *', { timeZone: process.env.TZ || 'Asia/Tashkent' })
  async dailySync() {
    if (this.busy) return;
    this.busy = true;
    try {
      const results = await this.social.syncAll();
      const failed = results.filter((r) => !r.ok);
      this.logger.log(
        `Ijtimoiy tarmoq sinxronizatsiyasi: ${results.length - failed.length}/${results.length} muvaffaqiyatli`,
      );
    } catch (error) {
      this.logger.error(`Sinxronizatsiya xatosi: ${(error as Error).message}`);
    } finally {
      this.busy = false;
    }
  }

  /** Oy boshida o'tgan oyning yakuniy ko'rsatkichlarini hisoblaymiz */
  @Cron('0 5 1 * *', { timeZone: process.env.TZ || 'Asia/Tashkent' })
  async monthlyRollup() {
    try {
      const prev = dayjs().subtract(1, 'month');
      await this.social.computeMonthly(prev.year(), prev.month() + 1);
      this.logger.log(`${prev.format('YYYY-MM')} oylik statistikasi hisoblandi`);
    } catch (error) {
      this.logger.error(`Oylik hisoblash xatosi: ${(error as Error).message}`);
    }
  }
}
