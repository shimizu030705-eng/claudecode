# Threads Research Automation Tool

Threadsのリサーチ作業を自動化するツールです。指定したキーワードで定期的に検索し、エンゲージメントの高い投稿をGoogle スプレッドシートに自動で蓄積します。

## 機能

- **キーワード検索**: Threads APIを使用して投稿を検索
- **エンゲージメント分析**: いいね・リプライ・リポスト数でランキング
- **Google Sheets出力**: 結果を自動でスプレッドシートに追記
- **定期実行**: cronスケジュールで1日に複数回自動実行

## 費用

**完全無料で運用可能です**

| サービス | 費用 |
|---------|------|
| Threads API | 無料 |
| Google Sheets API | 無料 |

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

### 3. Google Sheets APIの設定

#### 3-1. Google Cloud Projectの作成

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 新しいプロジェクトを作成
3. 「APIとサービス」→「ライブラリ」から「Google Sheets API」を有効化

#### 3-2. サービスアカウントの作成

1. 「APIとサービス」→「認証情報」→「認証情報を作成」
2. 「サービスアカウント」を選択
3. 名前を入力して作成
4. 作成したサービスアカウントをクリック
5. 「キー」タブ →「鍵を追加」→「新しい鍵を作成」
6. JSON形式でダウンロード
7. ダウンロードしたファイルを `credentials.json` としてプロジェクトルートに保存

#### 3-3. スプレッドシートの準備

1. [Google Sheets](https://sheets.google.com/) で新しいスプレッドシートを作成
2. URLからスプレッドシートIDを取得（`https://docs.google.com/spreadsheets/d/{ここがID}/edit`）
3. スプレッドシートを開き、「共有」をクリック
4. サービスアカウントのメールアドレス（`xxx@xxx.iam.gserviceaccount.com`）を追加し、「編集者」権限を付与

### 4. 環境変数の設定

```bash
cp .env.example .env
```

`.env` ファイルを編集:

```env
THREADS_ACCESS_TOKEN=your_access_token
THREADS_USER_ID=your_user_id
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id
GOOGLE_CREDENTIALS_PATH=./credentials.json
GOOGLE_SHEET_NAME=リサーチ結果
```

### 5. スケジュール設定

```bash
cp config.example.json config.json
```

## 使い方

### 単発検索

```bash
npm run search "AI"
npm run search "スタートアップ" -- --min-likes 10
```

### 定期実行

```bash
npm run schedule
```

### スケジュールの追加

```bash
npx ts-node src/cli.ts add-schedule "AI" --cron "0 9,12,18 * * *"
```

## 設定例 (config.json)

```json
{
  "googleSheets": {
    "spreadsheetId": "1ABC123...",
    "credentialsPath": "./credentials.json",
    "sheetName": "リサーチ結果"
  },
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

## スプレッドシート出力形式

| 検索日時 | キーワード | 投稿者 | 投稿内容 | いいね数 | リプライ数 | リポスト数 | 投稿日時 | URL |
|---------|-----------|--------|---------|---------|-----------|-----------|---------|-----|
| 1/27 9:00 | AI | @user1 | 投稿内容... | 1,234 | 89 | 234 | 1/27 8:30 | https://... |

## cronプリセット

| プリセット | 説明 | cron式 |
|-----------|------|--------|
| HOURLY | 毎時0分 | `0 * * * *` |
| EVERY_30_MINUTES | 30分ごと | `*/30 * * * *` |
| DAILY_9AM | 毎日9時 | `0 9 * * *` |
| THREE_TIMES_DAILY | 毎日9時、12時、18時 | `0 9,12,18 * * *` |
| EVERY_2_HOURS_DAYTIME | 8時〜20時の2時間ごと | `0 8,10,12,14,16,18,20 * * *` |

## API制限

- Threads API: 7日間で500クエリまで
- 複数のアクセストークンを使用することでスケール可能

## 参考リンク

- [Threads API Documentation](https://developers.facebook.com/docs/threads)
- [Google Sheets API](https://developers.google.com/sheets/api)
