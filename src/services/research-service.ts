import { ThreadsClient } from '../api/threads-client';
import { EngagementAnalyzer } from './engagement-analyzer';
import { GoogleSheetsClient, SheetsConfig } from './google-sheets';
import { ResearchReport, AppConfig } from '../types';

export class ResearchService {
  private threadsClient: ThreadsClient;
  private engagementAnalyzer: EngagementAnalyzer;
  private sheetsClient: GoogleSheetsClient | null = null;

  constructor(config: AppConfig) {
    this.threadsClient = new ThreadsClient(config.threadsAccessToken, config.threadsUserId);
    this.engagementAnalyzer = new EngagementAnalyzer();

    // Initialize Google Sheets if configured
    if (config.googleSheets) {
      this.sheetsClient = new GoogleSheetsClient(config.googleSheets);
    }
  }

  /**
   * Initialize the service (create headers in spreadsheet, etc.)
   */
  async initialize(): Promise<void> {
    if (this.sheetsClient?.isConfigured()) {
      await this.sheetsClient.initializeSheet();
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

    console.log(`\n🔍 「${keyword}」を検索中...`);

    // Step 1: Search for posts
    const searchResult = await this.threadsClient.searchByKeyword(keyword, {
      since,
      until,
      limit: maxResults,
    });
    console.log(`   ${searchResult.totalFound}件の投稿を取得`);

    // Step 2: Analyze engagement
    console.log(`📊 エンゲージメント分析中...`);
    const engagementAnalysis = this.engagementAnalyzer.analyze(searchResult, {
      minLikes,
      topCount: 20,
    });

    // Step 3: Generate report
    const report: ResearchReport = {
      keyword,
      searchResult,
      engagementAnalysis,
      generatedAt: new Date().toISOString(),
    };

    // Step 4: Save to Google Sheets
    if (this.sheetsClient?.isConfigured()) {
      console.log(`📤 スプレッドシートに出力中...`);
      await this.sheetsClient.appendPosts(keyword, engagementAnalysis.topPosts);
      console.log(`   🔗 ${this.sheetsClient.getSpreadsheetUrl()}`);
    } else {
      console.log(`⚠️ Google Sheets未設定のため、コンソール出力のみ`);
    }

    return report;
  }

  /**
   * Format report as human-readable summary
   */
  formatReportSummary(report: ResearchReport): string {
    const lines = [
      ``,
      `═══════════════════════════════════════════════════════════`,
      `  Threads リサーチレポート`,
      `  キーワード: 「${report.keyword}」`,
      `  生成日時: ${new Date(report.generatedAt).toLocaleString('ja-JP')}`,
      `═══════════════════════════════════════════════════════════`,
      ``,
      `【検索結果】`,
      `  総投稿数: ${report.searchResult.totalFound}件`,
      ``,
      this.engagementAnalyzer.getSummary(report.engagementAnalysis),
      ``,
      `【トップ投稿】`,
    ];

    report.engagementAnalysis.topPosts.slice(0, 5).forEach((post, i) => {
      lines.push(`  ${i + 1}. @${post.username}`);
      lines.push(`     「${post.text.slice(0, 80)}${post.text.length > 80 ? '...' : ''}」`);
      lines.push(`     👍 ${post.likes} | 💬 ${post.replies} | 🔄 ${post.reposts}`);
      lines.push(`     🔗 ${post.permalink}`);
      lines.push(``);
    });

    if (this.sheetsClient?.isConfigured()) {
      lines.push(`📊 全データ: ${this.sheetsClient.getSpreadsheetUrl()}`);
    }

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
