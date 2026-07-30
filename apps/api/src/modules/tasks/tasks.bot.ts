import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TelegramService } from '../telegram/telegram.service';
import { TasksService } from './tasks.service';
import { BTN } from '../telegram/keyboards';
import { fmtDateTime, dayjs } from '../../common/utils/dates';

@Injectable()
export class TasksBotHandlers implements OnModuleInit {
  private readonly logger = new Logger(TasksBotHandlers.name);

  constructor(
    private readonly telegram: TelegramService,
    private readonly tasks: TasksService,
  ) {}

  onModuleInit() {
    const bot = this.telegram.bot;
    if (!bot) return;

    bot.hears(BTN.MY_TASKS, async (ctx) => {
      const user = await this.telegram.resolveUser(ctx.from?.id);
      if (!user) return;

      const items = await this.tasks.myTasks(user.id);

      if (!items.length) {
        await ctx.reply("Hozircha bajarilishi kerak bo'lgan topshiriq yo'q. ✅");
        return;
      }

      const lines = items.map((task) => {
        const overdue = task.deadlineAt && task.deadlineAt < new Date();
        const icon = overdue ? '🔴' : task.status === 'IN_PROGRESS' ? '🔄' : '📋';
        const left = task.deadlineAt
          ? overdue
            ? 'MUDDAT O\'TDI'
            : `${dayjs(task.deadlineAt).diff(dayjs(), 'hour')} soat qoldi`
          : 'muddat belgilanmagan';

        return [
          `${icon} <b>#${task.number} — ${task.title}</b>`,
          `   Kimdan: ${task.fromUser.fullName} (${task.fromDepartment.name})`,
          task.deadlineAt ? `   Muddat: ${fmtDateTime(task.deadlineAt)} — ${left}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      });

      await ctx.reply(['<b>📋 Topshiriqlaringiz</b>', '', ...lines].join('\n\n'), {
        parse_mode: 'HTML',
      });
    });

    bot.callbackQuery(/^task:reject:(.+)$/, async (ctx) => {
      await ctx.answerCallbackQuery({
        text: "Rad etish sababini panelda yoki Mini App'da kiriting",
        show_alert: true,
      });
    });

    this.logger.log("Bot: topshiriq handlerlari ro'yxatdan o'tdi");
  }
}
