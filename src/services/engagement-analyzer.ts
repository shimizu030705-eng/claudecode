import { ThreadsPost, SearchResult, EngagementAnalysis } from '../types';

export class EngagementAnalyzer {
  /**
   * Analyze engagement metrics from search results
   */
  analyze(searchResult: SearchResult, options: { minLikes?: number; topCount?: number } = {}): EngagementAnalysis {
    const { minLikes = 0, topCount = 10 } = options;
    const { posts } = searchResult;

    if (posts.length === 0) {
      return {
        topPosts: [],
        averageLikes: 0,
        averageReplies: 0,
        averageReposts: 0,
        totalEngagement: 0,
        engagementTrend: 'stable',
      };
    }

    // Filter by minimum likes if specified
    const filteredPosts = posts.filter(post => post.likes >= minLikes);

    // Calculate total engagement for each post
    const postsWithEngagement = filteredPosts.map(post => ({
      ...post,
      totalEngagement: post.likes + post.replies * 2 + post.reposts * 3 + post.quotes * 3,
    }));

    // Sort by total engagement (weighted: reposts and quotes are worth more)
    const sortedPosts = postsWithEngagement.sort((a, b) => b.totalEngagement - a.totalEngagement);

    // Get top posts
    const topPosts = sortedPosts.slice(0, topCount);

    // Calculate averages
    const totalLikes = filteredPosts.reduce((sum, post) => sum + post.likes, 0);
    const totalReplies = filteredPosts.reduce((sum, post) => sum + post.replies, 0);
    const totalReposts = filteredPosts.reduce((sum, post) => sum + post.reposts, 0);
    const totalEngagement = postsWithEngagement.reduce((sum, post) => sum + post.totalEngagement, 0);

    const count = filteredPosts.length || 1;

    // Determine engagement trend based on timestamp distribution
    const trend = this.determineTrend(filteredPosts);

    return {
      topPosts,
      averageLikes: Math.round(totalLikes / count),
      averageReplies: Math.round(totalReplies / count),
      averageReposts: Math.round(totalReposts / count),
      totalEngagement,
      engagementTrend: trend,
    };
  }

  /**
   * Determine if engagement is trending up, down, or stable
   */
  private determineTrend(posts: ThreadsPost[]): 'rising' | 'stable' | 'declining' {
    if (posts.length < 4) return 'stable';

    // Sort by timestamp
    const sorted = [...posts].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Split into halves
    const midpoint = Math.floor(sorted.length / 2);
    const olderPosts = sorted.slice(0, midpoint);
    const newerPosts = sorted.slice(midpoint);

    // Calculate average engagement for each half
    const avgEngagementOlder = this.calculateAverageEngagement(olderPosts);
    const avgEngagementNewer = this.calculateAverageEngagement(newerPosts);

    // Determine trend
    const changePercent = ((avgEngagementNewer - avgEngagementOlder) / (avgEngagementOlder || 1)) * 100;

    if (changePercent > 20) return 'rising';
    if (changePercent < -20) return 'declining';
    return 'stable';
  }

  /**
   * Calculate average engagement for a set of posts
   */
  private calculateAverageEngagement(posts: ThreadsPost[]): number {
    if (posts.length === 0) return 0;
    const total = posts.reduce(
      (sum, post) => sum + post.likes + post.replies * 2 + post.reposts * 3,
      0
    );
    return total / posts.length;
  }

  /**
   * Get engagement statistics summary
   */
  getSummary(analysis: EngagementAnalysis): string {
    const lines = [
      `📊 エンゲージメント分析結果`,
      ``,
      `トップ投稿数: ${analysis.topPosts.length}件`,
      `平均いいね数: ${analysis.averageLikes}`,
      `平均リプライ数: ${analysis.averageReplies}`,
      `平均リポスト数: ${analysis.averageReposts}`,
      `総エンゲージメント: ${analysis.totalEngagement}`,
      `トレンド: ${this.getTrendLabel(analysis.engagementTrend)}`,
    ];

    return lines.join('\n');
  }

  private getTrendLabel(trend: 'rising' | 'stable' | 'declining'): string {
    switch (trend) {
      case 'rising':
        return '📈 上昇中';
      case 'declining':
        return '📉 下降中';
      default:
        return '➡️ 安定';
    }
  }
}
