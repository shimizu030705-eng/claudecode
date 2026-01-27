import * as fs from 'fs';
import * as path from 'path';
import { ThreadsClient } from '../api/threads-client';
import { EngagementAnalyzer } from './engagement-analyzer';
import { AIAnalyzer } from './ai-analyzer';
import { ResearchReport, AppConfig } from '../types';
import dayjs from 'dayjs';

export class ResearchService {
  private threadsClient: ThreadsClient;
  private engagementAnalyzer: EngagementAnalyzer;
  private aiAnalyzer: AIAnalyzer;
  private outputDir: string;

  constructor(config: AppConfig) {
    this.threadsClient = new ThreadsClient(config.threadsAccessToken, config.threadsUserId);
    this.engagementAnalyzer = new EngagementAnalyzer();
    this.aiAnalyzer = new AIAnalyzer(config.claudeApiKey);
    this.outputDir = config.outputDir;

    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Run a complete research cycle for a keyword
   */
  async runResearch(
    keyword: string,
    options: {
      minLikes?: number;
      maxResults?: number;
      since?: string;
      until?: string;
    } = {}
  ): Promise<ResearchReport> {
    const { minLikes = 0, maxResults = 50, since, until } = options;

    console.log(`\n🔍 Searching for: "${keyword}"...`);

    // Step 1: Search for posts
    const searchResult = await this.threadsClient.searchByKeyword(keyword, {
      since,
      until,
      limit: maxResults,
    });
    console.log(`   Found ${searchResult.totalFound} posts`);

    // Step 2: Analyze engagement
    console.log(`📊 Analyzing engagement...`);
    const engagementAnalysis = this.engagementAnalyzer.analyze(searchResult, {
      minLikes,
      topCount: 10,
    });

    // Step 3: AI Analysis
    console.log(`🤖 Running AI analysis...`);
    const aiAnalysis = await this.aiAnalyzer.analyze(searchResult, engagementAnalysis);

    // Step 4: Generate report
    const report: ResearchReport = {
      keyword,
      searchResult,
      engagementAnalysis,
      aiAnalysis,
      generatedAt: new Date().toISOString(),
    };

    // Step 5: Save report
    const reportPath = this.saveReport(report);
    console.log(`💾 Report saved: ${reportPath}`);

    return report;
  }

  /**
   * Save report to file
   */
  private saveReport(report: ResearchReport): string {
    const timestamp = dayjs().format('YYYY-MM-DD_HH-mm-ss');
    const sanitizedKeyword = report.keyword.replace(/[^a-zA-Z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g, '_');
    const filename = `report_${sanitizedKeyword}_${timestamp}.json`;
    const filepath = path.join(this.outputDir, filename);

    fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf-8');

    // Also save a human-readable summary
    const summaryPath = filepath.replace('.json', '_summary.txt');
    fs.writeFileSync(summaryPath, this.formatReportSummary(report), 'utf-8');

    return filepath;
  }

  /**
   * Format report as human-readable summary
   */
  formatReportSummary(report: ResearchReport): string {
    const lines = [
      `═══════════════════════════════════════════════════════════`,
      `  Threads リサーチレポート`,
      `  キーワード: "${report.keyword}"`,
      `  生成日時: ${report.generatedAt}`,
      `═══════════════════════════════════════════════════════════`,
      ``,
      `【検索結果】`,
      `  総投稿数: ${report.searchResult.totalFound}件`,
      `  検索日時: ${report.searchResult.searchedAt}`,
      ``,
      this.engagementAnalyzer.getSummary(report.engagementAnalysis),
      ``,
      this.aiAnalyzer.formatReport(report.aiAnalysis),
      ``,
      `【トップ投稿】`,
    ];

    report.engagementAnalysis.topPosts.slice(0, 5).forEach((post, i) => {
      lines.push(`  ${i + 1}. @${post.username}`);
      lines.push(`     "${post.text.slice(0, 100)}${post.text.length > 100 ? '...' : ''}"`);
      lines.push(`     👍 ${post.likes} | 💬 ${post.replies} | 🔄 ${post.reposts}`);
      lines.push(`     🔗 ${post.permalink}`);
      lines.push(``);
    });

    lines.push(`═══════════════════════════════════════════════════════════`);

    return lines.join('\n');
  }

  /**
   * Print report to console
   */
  printReport(report: ResearchReport): void {
    console.log(this.formatReportSummary(report));
  }
}
