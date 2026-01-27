# Threads Research Automation Tool

Threadsのリサーチ作業を自動化するツールです。指定したキーワードで定期的に検索し、エンゲージメントの高い投稿を収集・分析します。

## 機能

- **キーワード検索**: Threads APIを使用して投稿を検索
- **エンゲージメント分析**: いいね・リプライ・リポスト数でランキング
- **AI分析**: Claude APIを使用したトレンド分析とインサイト生成
- **定期実行**: cronスケジュールで1日に複数回自動実行
- **レポート出力**: JSON形式とテキスト形式でレポートを保存

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. Threads API認証情報の取得

1. [Meta for Developers](https://developers.facebook.com/) にアクセス
2. 新しいアプリを作成（または既存のアプリを選択）
3. Threads API を追加
4. アクセストークンを生成

### 3. 環境変数の設定

```bash
cp .env.example .env
```

`.env` ファイルを編集:

```env
THREADS_ACCESS_TOKEN=your_access_token
THREADS_USER_ID=your_user_id
CLAUDE_API_KEY=your_claude_api_key  # オプション
OUTPUT_DIR=./reports
```

### 4. スケジュール設定（オプション）

```bash
cp config.example.json config.json
```

## 使い方

### 単発検索

キーワードで検索して分析:

```bash
# 基本的な検索
npm run search "AI"

# オプション付き
npm run search "スタートアップ" -- --min-likes 10 --max-results 30
```

### 定期実行

設定したスケジュールで自動実行:

```bash
npm run schedule
```

### スケジュールの追加

```bash
# 毎日9時、12時、18時に実行
npx ts-node src/cli.ts add-schedule "AI" --cron "0 9,12,18 * * *"

# 30分ごとに実行
npx ts-node src/cli.ts add-schedule "トレンド" --cron "*/30 * * * *"
```

### cronプリセット一覧

```bash
npx ts-node src/cli.ts presets
```

| プリセット | 説明 | cron式 |
|-----------|------|--------|
| HOURLY | 毎時0分 | `0 * * * *` |
| EVERY_30_MINUTES | 30分ごと | `*/30 * * * *` |
| DAILY_9AM | 毎日9時 | `0 9 * * *` |
| THREE_TIMES_DAILY | 毎日9時、12時、18時 | `0 9,12,18 * * *` |
| EVERY_2_HOURS_DAYTIME | 8時〜20時の2時間ごと | `0 8,10,12,14,16,18,20 * * *` |
| WEEKDAYS_9AM | 平日9時 | `0 9 * * 1-5` |

## 設定ファイル (config.json)

```json
{
  "schedules": [
    {
      "keyword": "AI",
      "cronExpression": "0 9,12,18 * * *",
      "minLikes": 10,
      "maxResults": 50,
      "enabled": true
    }
  ]
}
```

## 出力例

レポートは `./reports` ディレクトリに保存されます:

```
═══════════════════════════════════════════════════════════
  Threads リサーチレポート
  キーワード: "AI"
  生成日時: 2026-01-27T10:00:00.000Z
═══════════════════════════════════════════════════════════

【検索結果】
  総投稿数: 50件

📊 エンゲージメント分析結果

トップ投稿数: 10件
平均いいね数: 156
平均リプライ数: 23
平均リポスト数: 45
トレンド: 📈 上昇中

🤖 AI分析レポート

【サマリー】
AIに関する投稿は活発で、特に生成AIツールの
活用事例に関心が集まっています...
```

## API制限について

Threads APIには以下の制限があります:

- **検索クエリ**: 7日間で500クエリまで
- 1日3回の検索を行う場合、約23キーワードまで対応可能

## ライセンス

MIT

## 参考リンク

- [Threads API Documentation](https://developers.facebook.com/docs/threads)
- [Threads API Postman Collection](https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api)
