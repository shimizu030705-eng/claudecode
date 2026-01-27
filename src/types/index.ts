// Threads API Types

export interface ThreadsPost {
  id: string;
  text: string;
  username: string;
  timestamp: string;
  permalink: string;
  media_type?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'CAROUSEL';
  media_url?: string;
  // Engagement metrics
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  views?: number;
}

export interface SearchResult {
  posts: ThreadsPost[];
  keyword: string;
  searchedAt: string;
  totalFound: number;
}

export interface EngagementAnalysis {
  topPosts: ThreadsPost[];
  averageLikes: number;
  averageReplies: number;
  averageReposts: number;
  totalEngagement: number;
  engagementTrend: 'rising' | 'stable' | 'declining';
}

export interface ResearchReport {
  keyword: string;
  searchResult: SearchResult;
  engagementAnalysis: EngagementAnalysis;
  generatedAt: string;
}

export interface ScheduleConfig {
  keyword: string;
  cronExpression: string;
  minLikes?: number;
  maxResults?: number;
  enabled: boolean;
}

export interface GoogleSheetsConfig {
  spreadsheetId: string;
  credentialsPath: string;
  sheetName?: string;
}

export interface AppConfig {
  threadsAccessToken: string;
  threadsUserId: string;
  googleSheets?: GoogleSheetsConfig;
  schedules: ScheduleConfig[];
}
