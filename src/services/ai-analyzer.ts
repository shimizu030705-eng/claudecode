import axios from 'axios';
import { SearchResult, EngagementAnalysis, AIAnalysisResult, ThreadsPost } from '../types';

export class AIAnalyzer {
  private apiKey: string | undefined;
  private apiEndpoint = 'https://api.anthropic.com/v1/messages';

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  /**
   * Analyze posts using Claude API
   */
  async analyze(
    searchResult: SearchResult,
    engagementAnalysis: EngagementAnalysis
  ): Promise<AIAnalysisResult> {
    // If no API key, return a basic local analysis
    if (!this.apiKey) {
      return this.localAnalysis(searchResult, engagementAnalysis);
    }

    const prompt = this.buildPrompt(searchResult, engagementAnalysis);

    try {
      const response = await axios.post(
        this.apiEndpoint,
        {
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
          },
        }
      );

      const content = response.data.content[0].text;
      return this.parseAIResponse(content);
    } catch (error) {
      console.error('AI analysis failed, falling back to local analysis:', error);
      return this.localAnalysis(searchResult, engagementAnalysis);
    }
  }

  /**
   * Build the prompt for AI analysis
   */
  private buildPrompt(searchResult: SearchResult, engagementAnalysis: EngagementAnalysis): string {
    const topPostsText = engagementAnalysis.topPosts
      .slice(0, 10)
      .map((post, i) => `${i + 1}. @${post.username}: "${post.text}" (いいね: ${post.likes}, リプライ: ${post.replies})`)
      .join('\n');

    return `以下のThreadsの投稿データを分析してください。

検索キーワード: "${searchResult.keyword}"
検索日時: ${searchResult.searchedAt}
総投稿数: ${searchResult.totalFound}

エンゲージメント概要:
- 平均いいね数: ${engagementAnalysis.averageLikes}
- 平均リプライ数: ${engagementAnalysis.averageReplies}
- 平均リポスト数: ${engagementAnalysis.averageReposts}
- トレンド: ${engagementAnalysis.engagementTrend}

トップ投稿:
${topPostsText}

以下の形式でJSON形式で分析結果を返してください:
{
  "summary": "全体的な傾向の要約（日本語で2-3文）",
  "keyTopics": ["主要トピック1", "主要トピック2", "主要トピック3"],
  "sentiment": "positive/neutral/negative/mixed のいずれか",
  "recommendations": ["アクション提案1", "アクション提案2"],
  "trendingThemes": ["注目テーマ1", "注目テーマ2"]
}`;
  }

  /**
   * Parse AI response into structured format
   */
  private parseAIResponse(content: string): AIAnalysisResult {
    try {
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || '',
          keyTopics: parsed.keyTopics || [],
          sentiment: parsed.sentiment || 'neutral',
          recommendations: parsed.recommendations || [],
          trendingThemes: parsed.trendingThemes || [],
          analyzedAt: new Date().toISOString(),
        };
      }
    } catch (error) {
      console.error('Failed to parse AI response:', error);
    }

    // Fallback
    return {
      summary: content.slice(0, 500),
      keyTopics: [],
      sentiment: 'neutral',
      recommendations: [],
      trendingThemes: [],
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Local analysis without AI API (fallback)
   */
  private localAnalysis(
    searchResult: SearchResult,
    engagementAnalysis: EngagementAnalysis
  ): AIAnalysisResult {
    const { posts } = searchResult;
    const { topPosts } = engagementAnalysis;

    // Extract common words from top posts
    const allText = topPosts.map(p => p.text).join(' ');
    const words = allText.split(/\s+/).filter(w => w.length > 2);
    const wordFreq = new Map<string, number>();
    words.forEach(w => {
      const normalized = w.toLowerCase().replace(/[^\w\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g, '');
      if (normalized.length > 2) {
        wordFreq.set(normalized, (wordFreq.get(normalized) || 0) + 1);
      }
    });

    const topWords = [...wordFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);

    // Determine sentiment based on engagement trend
    let sentiment: 'positive' | 'neutral' | 'negative' | 'mixed' = 'neutral';
    if (engagementAnalysis.engagementTrend === 'rising') sentiment = 'positive';
    else if (engagementAnalysis.engagementTrend === 'declining') sentiment = 'negative';

    return {
      summary: `「${searchResult.keyword}」に関する${posts.length}件の投稿を分析しました。平均${engagementAnalysis.averageLikes}いいねで、エンゲージメントは${engagementAnalysis.engagementTrend === 'rising' ? '上昇' : engagementAnalysis.engagementTrend === 'declining' ? '下降' : '安定'}傾向にあります。`,
      keyTopics: topWords.slice(0, 3),
      sentiment,
      recommendations: [
        `エンゲージメントの高い投稿のスタイルを参考にする`,
        `トップ投稿者（${topPosts[0]?.username || 'N/A'}など）の投稿戦略を分析する`,
      ],
      trendingThemes: topWords.slice(0, 3),
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Format analysis result for display
   */
  formatReport(analysis: AIAnalysisResult): string {
    const lines = [
      `🤖 AI分析レポート`,
      ``,
      `【サマリー】`,
      analysis.summary,
      ``,
      `【主要トピック】`,
      analysis.keyTopics.map(t => `  • ${t}`).join('\n'),
      ``,
      `【センチメント】`,
      `  ${this.getSentimentEmoji(analysis.sentiment)} ${this.getSentimentLabel(analysis.sentiment)}`,
      ``,
      `【注目テーマ】`,
      analysis.trendingThemes.map(t => `  • ${t}`).join('\n'),
      ``,
      `【推奨アクション】`,
      analysis.recommendations.map((r, i) => `  ${i + 1}. ${r}`).join('\n'),
      ``,
      `分析日時: ${analysis.analyzedAt}`,
    ];

    return lines.join('\n');
  }

  private getSentimentEmoji(sentiment: string): string {
    switch (sentiment) {
      case 'positive': return '😊';
      case 'negative': return '😟';
      case 'mixed': return '🤔';
      default: return '😐';
    }
  }

  private getSentimentLabel(sentiment: string): string {
    switch (sentiment) {
      case 'positive': return 'ポジティブ';
      case 'negative': return 'ネガティブ';
      case 'mixed': return '混在';
      default: return 'ニュートラル';
    }
  }
}
