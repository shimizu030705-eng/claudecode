import cron from 'node-cron';
import { ScheduleConfig } from '../types';
import { ResearchService } from './research-service';

interface ScheduledTask {
  config: ScheduleConfig;
  task: cron.ScheduledTask;
}

export class Scheduler {
  private tasks: Map<string, ScheduledTask> = new Map();
  private researchService: ResearchService;

  constructor(researchService: ResearchService) {
    this.researchService = researchService;
  }

  /**
   * Add a scheduled research task
   */
  addSchedule(config: ScheduleConfig): void {
    const taskId = `${config.keyword}-${config.cronExpression}`;

    // Remove existing task if any
    this.removeSchedule(taskId);

    if (!config.enabled) {
      console.log(`Schedule for "${config.keyword}" is disabled, skipping.`);
      return;
    }

    // Validate cron expression
    if (!cron.validate(config.cronExpression)) {
      throw new Error(`Invalid cron expression: ${config.cronExpression}`);
    }

    const task = cron.schedule(config.cronExpression, async () => {
      console.log(`\n⏰ [${new Date().toISOString()}] Running scheduled research for: "${config.keyword}"`);
      try {
        const report = await this.researchService.runResearch(config.keyword, {
          minLikes: config.minLikes,
          maxResults: config.maxResults,
        });
        console.log(`✅ Research completed for "${config.keyword}"`);
        console.log(`   Report saved to: ${report.generatedAt}`);
      } catch (error) {
        console.error(`❌ Research failed for "${config.keyword}":`, error);
      }
    });

    this.tasks.set(taskId, { config, task });
    console.log(`📅 Scheduled research for "${config.keyword}" with cron: ${config.cronExpression}`);
  }

  /**
   * Remove a scheduled task
   */
  removeSchedule(taskId: string): void {
    const existing = this.tasks.get(taskId);
    if (existing) {
      existing.task.stop();
      this.tasks.delete(taskId);
      console.log(`Removed schedule: ${taskId}`);
    }
  }

  /**
   * Load multiple schedules from config
   */
  loadSchedules(schedules: ScheduleConfig[]): void {
    for (const schedule of schedules) {
      this.addSchedule(schedule);
    }
  }

  /**
   * Start all scheduled tasks
   */
  startAll(): void {
    for (const [taskId, { task }] of this.tasks) {
      task.start();
      console.log(`▶️ Started: ${taskId}`);
    }
  }

  /**
   * Stop all scheduled tasks
   */
  stopAll(): void {
    for (const [taskId, { task }] of this.tasks) {
      task.stop();
      console.log(`⏹️ Stopped: ${taskId}`);
    }
  }

  /**
   * List all scheduled tasks
   */
  listSchedules(): { taskId: string; config: ScheduleConfig }[] {
    return [...this.tasks.entries()].map(([taskId, { config }]) => ({
      taskId,
      config,
    }));
  }

  /**
   * Get human-readable schedule description
   */
  static describeCron(expression: string): string {
    const parts = expression.split(' ');
    if (parts.length !== 5) return expression;

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    // Common patterns
    if (minute === '0' && hour === '*') return '毎時0分';
    if (minute === '*/30') return '30分ごと';
    if (minute === '0' && hour !== '*') return `毎日 ${hour}:00`;
    if (dayOfWeek !== '*') return `毎週 ${this.getDayName(dayOfWeek)} ${hour}:${minute}`;

    return expression;
  }

  private static getDayName(day: string): string {
    const days: Record<string, string> = {
      '0': '日曜日',
      '1': '月曜日',
      '2': '火曜日',
      '3': '水曜日',
      '4': '木曜日',
      '5': '金曜日',
      '6': '土曜日',
    };
    return days[day] || day;
  }
}

// Cron expression helper
export const CronPresets = {
  // 毎時
  HOURLY: '0 * * * *',
  // 30分ごと
  EVERY_30_MINUTES: '*/30 * * * *',
  // 毎日9時
  DAILY_9AM: '0 9 * * *',
  // 毎日9時、12時、18時
  THREE_TIMES_DAILY: '0 9,12,18 * * *',
  // 毎日8時から20時まで2時間ごと
  EVERY_2_HOURS_DAYTIME: '0 8,10,12,14,16,18,20 * * *',
  // 平日の9時
  WEEKDAYS_9AM: '0 9 * * 1-5',
};
