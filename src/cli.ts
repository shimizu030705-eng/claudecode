import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import { ResearchService } from './services/research-service';
import { Scheduler, CronPresets } from './services/scheduler';
import { AppConfig, ScheduleConfig, GoogleSheetsConfig } from './types';

// Load environment variables
dotenv.config();

const program = new Command();

function loadConfig(): AppConfig {
  const configPath = path.join(process.cwd(), 'config.json');
  let schedules: ScheduleConfig[] = [];
  let googleSheets: GoogleSheetsConfig | undefined;

  if (fs.existsSync(configPath)) {
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    schedules = configData.schedules || [];
    googleSheets = configData.googleSheets;
  }

  // Allow env vars to override config file
  if (process.env.GOOGLE_SPREADSHEET_ID) {
    googleSheets = {
      spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
      credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json',
      sheetName: process.env.GOOGLE_SHEET_NAME,
    };
  }

  return {
    threadsAccessToken: process.env.THREADS_ACCESS_TOKEN || '',
    threadsUserId: process.env.THREADS_USER_ID || '',
    googleSheets,
    schedules,
  };
}

program
  .name('threads-research')
  .description('Automated Threads research tool with Google Sheets output')
  .version('1.0.0');

// Search command
program
  .command('search')
  .description('Search Threads posts by keyword and save to Google Sheets')
  .argument('<keyword>', 'Keyword to search for')
  .option('-l, --min-likes <number>', 'Minimum likes filter', '0')
  .option('-m, --max-results <number>', 'Maximum results', '50')
  .option('--since <date>', 'Search since date (ISO format)')
  .option('--until <date>', 'Search until date (ISO format)')
  .action(async (keyword: string, options) => {
    const config = loadConfig();

    if (!config.threadsAccessToken) {
      console.error('❌ Error: THREADS_ACCESS_TOKEN is not set');
      console.error('   Please set it in your .env file');
      process.exit(1);
    }

    const researchService = new ResearchService(config);
    await researchService.initialize();

    try {
      const report = await researchService.runResearch(keyword, {
        minLikes: parseInt(options.minLikes),
        maxResults: parseInt(options.maxResults),
        since: options.since,
        until: options.until,
      });

      researchService.printReport(report);
    } catch (error) {
      console.error('❌ Research failed:', error);
      process.exit(1);
    }
  });

// Schedule command
program
  .command('schedule')
  .description('Run scheduled research tasks')
  .option('-c, --config <path>', 'Path to config file', 'config.json')
  .action(async (options) => {
    const config = loadConfig();

    if (!config.threadsAccessToken) {
      console.error('❌ Error: THREADS_ACCESS_TOKEN is not set');
      process.exit(1);
    }

    if (config.schedules.length === 0) {
      console.error('❌ No schedules configured in config.json');
      console.log('\nExample config.json:');
      console.log(JSON.stringify({
        googleSheets: {
          spreadsheetId: 'your_spreadsheet_id',
          credentialsPath: './credentials.json',
          sheetName: 'リサーチ結果',
        },
        schedules: [
          {
            keyword: 'AI',
            cronExpression: '0 9,12,18 * * *',
            minLikes: 10,
            maxResults: 50,
            enabled: true,
          },
        ],
      }, null, 2));
      process.exit(1);
    }

    const researchService = new ResearchService(config);
    await researchService.initialize();

    const scheduler = new Scheduler(researchService);

    scheduler.loadSchedules(config.schedules);
    scheduler.startAll();

    console.log('\n🚀 Scheduler started. Press Ctrl+C to stop.\n');

    // List schedules
    const schedules = scheduler.listSchedules();
    console.log('Active schedules:');
    schedules.forEach(({ taskId, config }) => {
      console.log(`  • ${config.keyword}: ${Scheduler.describeCron(config.cronExpression)}`);
    });

    // Keep process running
    process.on('SIGINT', () => {
      console.log('\n\n⏹️ Stopping scheduler...');
      scheduler.stopAll();
      process.exit(0);
    });
  });

// Add schedule command
program
  .command('add-schedule')
  .description('Add a new scheduled research task')
  .argument('<keyword>', 'Keyword to search for')
  .option('-c, --cron <expression>', 'Cron expression', CronPresets.THREE_TIMES_DAILY)
  .option('-l, --min-likes <number>', 'Minimum likes filter', '0')
  .option('-m, --max-results <number>', 'Maximum results', '50')
  .action((keyword: string, options) => {
    const configPath = path.join(process.cwd(), 'config.json');
    let config: { schedules: ScheduleConfig[]; googleSheets?: GoogleSheetsConfig } = { schedules: [] };

    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }

    const newSchedule: ScheduleConfig = {
      keyword,
      cronExpression: options.cron,
      minLikes: parseInt(options.minLikes),
      maxResults: parseInt(options.maxResults),
      enabled: true,
    };

    config.schedules.push(newSchedule);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    console.log(`✅ Schedule added for "${keyword}"`);
    console.log(`   Cron: ${options.cron} (${Scheduler.describeCron(options.cron)})`);
  });

// List presets command
program
  .command('presets')
  .description('List available cron presets')
  .action(() => {
    console.log('\n📅 Available Cron Presets:\n');
    console.log('  HOURLY              : 毎時0分');
    console.log('                        0 * * * *\n');
    console.log('  EVERY_30_MINUTES    : 30分ごと');
    console.log('                        */30 * * * *\n');
    console.log('  DAILY_9AM           : 毎日9時');
    console.log('                        0 9 * * *\n');
    console.log('  THREE_TIMES_DAILY   : 毎日9時、12時、18時');
    console.log('                        0 9,12,18 * * *\n');
    console.log('  EVERY_2_HOURS_DAYTIME: 毎日8時から20時まで2時間ごと');
    console.log('                         0 8,10,12,14,16,18,20 * * *\n');
    console.log('  WEEKDAYS_9AM        : 平日の9時');
    console.log('                        0 9 * * 1-5\n');
  });

program.parse();
