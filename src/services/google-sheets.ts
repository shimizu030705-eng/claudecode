import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import * as fs from 'fs';
import { ThreadsPost } from '../types';

export interface SheetsConfig {
  spreadsheetId: string;
  credentialsPath: string;
  sheetName?: string;
}

export class GoogleSheetsClient {
  private sheets: ReturnType<typeof google.sheets> | null = null;
  private spreadsheetId: string;
  private sheetName: string;

  constructor(config: SheetsConfig) {
    this.spreadsheetId = config.spreadsheetId;
    this.sheetName = config.sheetName || 'リサーチ結果';

    if (config.credentialsPath && fs.existsSync(config.credentialsPath)) {
      this.initializeClient(config.credentialsPath);
    }
  }

  private initializeClient(credentialsPath: string): void {
    try {
      const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));

      const auth = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.sheets = google.sheets({ version: 'v4', auth });
    } catch (error) {
      console.error('Failed to initialize Google Sheets client:', error);
    }
  }

  /**
   * Check if the client is properly configured
   */
  isConfigured(): boolean {
    return this.sheets !== null && !!this.spreadsheetId;
  }

  /**
   * Initialize the spreadsheet with headers if needed
   */
  async initializeSheet(): Promise<void> {
    if (!this.sheets) return;

    const headers = [
      ['検索日時', 'キーワード', '投稿者', '投稿内容', 'いいね数', 'リプライ数', 'リポスト数', '投稿日時', 'URL']
    ];

    try {
      // Check if sheet has data
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A1:I1`,
      });

      // If no headers, add them
      if (!response.data.values || response.data.values.length === 0) {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${this.sheetName}!A1:I1`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: headers,
          },
        });
        console.log('📊 Spreadsheet headers initialized');
      }
    } catch (error: any) {
      // If sheet doesn't exist, create it
      if (error.code === 400) {
        console.log(`Creating new sheet: ${this.sheetName}`);
        await this.createSheet();
        await this.initializeSheet();
      } else {
        throw error;
      }
    }
  }

  /**
   * Create a new sheet in the spreadsheet
   */
  private async createSheet(): Promise<void> {
    if (!this.sheets) return;

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title: this.sheetName,
              },
            },
          },
        ],
      },
    });
  }

  /**
   * Append posts to the spreadsheet
   */
  async appendPosts(keyword: string, posts: ThreadsPost[]): Promise<number> {
    if (!this.sheets) {
      console.warn('⚠️ Google Sheets not configured. Skipping spreadsheet output.');
      return 0;
    }

    const searchedAt = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

    const rows = posts.map(post => [
      searchedAt,
      keyword,
      `@${post.username}`,
      post.text.replace(/\n/g, ' ').slice(0, 500), // Limit text length, remove newlines
      post.likes,
      post.replies,
      post.reposts,
      post.timestamp,
      post.permalink,
    ]);

    try {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:I`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: rows,
        },
      });

      console.log(`✅ ${posts.length}件の投稿をスプレッドシートに追加しました`);
      return posts.length;
    } catch (error) {
      console.error('Failed to append to spreadsheet:', error);
      throw error;
    }
  }

  /**
   * Get the spreadsheet URL
   */
  getSpreadsheetUrl(): string {
    return `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}`;
  }
}
