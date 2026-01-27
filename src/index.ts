// Threads Research Automation Tool
// Main entry point

export { ThreadsClient } from './api/threads-client';
export { EngagementAnalyzer } from './services/engagement-analyzer';
export { AIAnalyzer } from './services/ai-analyzer';
export { ResearchService } from './services/research-service';
export { Scheduler, CronPresets } from './services/scheduler';
export * from './types';

// Example usage
import dotenv from 'dotenv';
import { ResearchService } from './services/research-service';
import { Scheduler, CronPresets } from './services/scheduler';
import { AppConfig } from './types';

dotenv.config();

async function main() {
  console.log('🔬 Threads Research Automation Tool');
  console.log('====================================\n');

  // Check for required environment variables
  if (!process.env.THREADS_ACCESS_TOKEN) {
    console.log('⚠️  Setup required!');
    console.log('\nPlease create a .env file with the following:');
    console.log('  THREADS_ACCESS_TOKEN=your_access_token');
    console.log('  THREADS_USER_ID=your_user_id');
    console.log('  CLAUDE_API_KEY=your_claude_api_key (optional)');
    console.log('\nTo get your Threads API credentials:');
    console.log('  1. Go to https://developers.facebook.com/');
    console.log('  2. Create a new app or select existing');
    console.log('  3. Add Threads API product');
    console.log('  4. Generate access token');
    console.log('\nThen run:');
    console.log('  npm run search <keyword>');
    console.log('  npm run schedule');
    return;
  }

  const config: AppConfig = {
    threadsAccessToken: process.env.THREADS_ACCESS_TOKEN,
    threadsUserId: process.env.THREADS_USER_ID || '',
    claudeApiKey: process.env.CLAUDE_API_KEY,
    outputDir: process.env.OUTPUT_DIR || './reports',
    schedules: [
      {
        keyword: 'AI',
        cronExpression: CronPresets.THREE_TIMES_DAILY,
        minLikes: 10,
        maxResults: 50,
        enabled: true,
      },
    ],
  };

  const researchService = new ResearchService(config);

  // Example: Run a single research
  console.log('Running example research...\n');
  try {
    const report = await researchService.runResearch('AI', {
      minLikes: 5,
      maxResults: 20,
    });
    researchService.printReport(report);
  } catch (error) {
    console.error('Research failed:', error);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}
