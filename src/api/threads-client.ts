import axios, { AxiosInstance } from 'axios';
import { ThreadsPost, SearchResult } from '../types';

const THREADS_API_BASE = 'https://graph.threads.net/v1.0';

export class ThreadsClient {
  private client: AxiosInstance;
  private accessToken: string;
  private userId: string;

  constructor(accessToken: string, userId: string) {
    this.accessToken = accessToken;
    this.userId = userId;
    this.client = axios.create({
      baseURL: THREADS_API_BASE,
      timeout: 30000,
    });
  }

  /**
   * Search posts by keyword using the Threads API
   * Note: Uses the keyword_search endpoint available since late 2024
   */
  async searchByKeyword(
    keyword: string,
    options: {
      since?: string; // ISO date string
      until?: string; // ISO date string
      limit?: number;
    } = {}
  ): Promise<SearchResult> {
    const { since, until, limit = 50 } = options;

    const params: Record<string, string | number> = {
      q: keyword,
      access_token: this.accessToken,
      fields: 'id,text,username,timestamp,permalink,media_type,media_url,like_count,reply_count,repost_count,quote_count',
      limit,
    };

    if (since) params.since = since;
    if (until) params.until = until;

    try {
      const response = await this.client.get('/keyword_search', { params });

      const posts: ThreadsPost[] = (response.data.data || []).map((post: any) => ({
        id: post.id,
        text: post.text || '',
        username: post.username || '',
        timestamp: post.timestamp,
        permalink: post.permalink || '',
        media_type: post.media_type,
        media_url: post.media_url,
        likes: post.like_count || 0,
        replies: post.reply_count || 0,
        reposts: post.repost_count || 0,
        quotes: post.quote_count || 0,
      }));

      return {
        posts,
        keyword,
        searchedAt: new Date().toISOString(),
        totalFound: posts.length,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Threads API error: ${error.response?.data?.error?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get detailed metrics for a specific post
   */
  async getPostMetrics(postId: string): Promise<ThreadsPost | null> {
    try {
      const response = await this.client.get(`/${postId}`, {
        params: {
          access_token: this.accessToken,
          fields: 'id,text,username,timestamp,permalink,media_type,like_count,reply_count,repost_count,quote_count,views',
        },
      });

      const post = response.data;
      return {
        id: post.id,
        text: post.text || '',
        username: post.username || '',
        timestamp: post.timestamp,
        permalink: post.permalink || '',
        media_type: post.media_type,
        likes: post.like_count || 0,
        replies: post.reply_count || 0,
        reposts: post.repost_count || 0,
        quotes: post.quote_count || 0,
        views: post.views,
      };
    } catch (error) {
      console.error(`Failed to get metrics for post ${postId}:`, error);
      return null;
    }
  }

  /**
   * Check API rate limit status
   */
  async checkRateLimit(): Promise<{ remaining: number; resetAt: string }> {
    // Note: Threads API has a limit of 500 queries per 7 days
    // This is a simplified implementation - in production, you'd track this locally
    return {
      remaining: -1, // Unknown without tracking
      resetAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }
}
