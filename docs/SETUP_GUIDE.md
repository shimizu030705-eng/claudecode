# Meta広告自動化システム セットアップガイド

## 1. 前提条件

### 1.1 必要なアカウント
- Google アカウント（Google Drive、スプレッドシート用）
- Meta ビジネスアカウント（広告アカウントへのアクセス権限）
- Google Cloud Platform アカウント（Gemini API用、オプション）

### 1.2 必要な権限
- Meta 広告アカウントの管理者権限
- Facebook ページの管理者権限
- Instagram ビジネスアカウントへのアクセス権限（オプション）

## 2. Meta API の設定

### 2.1 アプリの作成
1. [Meta for Developers](https://developers.facebook.com/) にアクセス
2. 「マイアプリ」→「アプリを作成」
3. アプリタイプ：「ビジネス」を選択
4. 「Marketing API」を追加

### 2.2 アクセストークンの取得
1. Graph API Explorer で以下の権限を付与:
   - `ads_management`
   - `ads_read`
   - `business_management`
   - `pages_read_engagement`
   - `pages_manage_ads`
   - `instagram_basic`
   - `instagram_content_publish`

2. 「Get Token」→「Get User Access Token」をクリック
3. 長期トークンへの変換（推奨）:
   ```
   https://graph.facebook.com/v21.0/oauth/access_token?
     grant_type=fb_exchange_token&
     client_id={app-id}&
     client_secret={app-secret}&
     fb_exchange_token={short-lived-token}
   ```

### 2.3 必要なIDの確認
1. **広告アカウントID**: 広告マネージャーのURL、または
   ```
   GET /me/adaccounts?fields=id,name
   ```

2. **ページID**:
   ```
   GET /me/accounts?fields=id,name
   ```

3. **InstagramアカウントID**:
   ```
   GET /{page-id}?fields=instagram_business_account
   ```

4. **ピクセルID**: イベントマネージャーで確認

## 3. Google Cloud Platform の設定（Gemini API用）

### 3.1 プロジェクト作成
1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. 新しいプロジェクトを作成

### 3.2 Gemini API の有効化
1. 「APIとサービス」→「ライブラリ」
2. 「Generative Language API」を検索して有効化

### 3.3 API キーの取得
1. 「APIとサービス」→「認証情報」
2. 「認証情報を作成」→「APIキー」
3. キーを制限（Generative Language APIのみに制限推奨）

## 4. スプレッドシートの設定

### 4.1 新しいスプレッドシートを作成
1. [Google スプレッドシート](https://sheets.google.com/) で新規作成

### 4.2 Apps Script の設定
1. メニュー「拡張機能」→「Apps Script」
2. エディタで既存のコードを削除
3. 以下のファイルを作成（`+`ボタンでファイル追加）:
   - `01_config.gs`
   - `02_main.gs`
   - `03_meta_api.gs`
   - `04_drive_utils.gs`
   - `05_gemini_analysis.gs`
   - `06_sheet_utils.gs`
   - `07_utils.gs`
   - `08_performance_report.gs`

4. 各ファイルに対応するコードをコピー＆ペースト
5. 保存（Ctrl+S / Cmd+S）

### 4.3 シートの初期設定
1. スプレッドシートに戻る
2. ページを再読み込み（F5）
3. メニューに「Meta広告自動化」が表示される
4. 「Meta広告自動化」→「シート初期設定」を実行
5. 初回実行時に認証を許可

### 4.4 共通設定の入力
「共通設定」シートに以下を入力:

| 行 | 項目 | 値 |
|----|------|-----|
| 1 | 広告アカウントID | act_XXXXXXXXXX |
| 2 | ページID | ページのID |
| 3 | InstagramアカウントID | InstagramのID |
| 4 | ピクセルID | ピクセルのID |
| 5 | 年齢下限 | 18 |
| 6 | 年齢上限 | 65 |
| 7 | CPA上限(円) | 5000 |
| 8 | 通知メールアドレス | your@email.com |
| 9 | Meta Access Token | トークン |
| 10 | Gemini API Key | APIキー |

## 5. 使い方

### 5.1 キャンペーン作成

#### Step 1: 動画をGoogle Driveにアップロード
1. Google Drive に動画ファイルをアップロード
2. 動画の共有設定を「リンクを知っている全員」に変更（推奨）
3. 動画のURLをコピー

#### Step 2: キャンペーン設定シートに入力
「キャンペーン設定」シートに以下を入力:

| 列 | 項目 | 例 |
|----|------|-----|
| A | キャンペーン種別 | リード獲得 |
| B | キャンペーン番号 | 001 |
| C | キャンペーン名 | 夏季キャンペーン |
| D | 住所 | 東京都渋谷区渋谷1-1-1 |
| E | ターゲット半径(km) | 10 |
| F | 日予算(円) | 5000 |
| G | 開始日 | 2025-02-01 |
| H | 開始時刻 | 09:00 |
| I | 終了日 | 2025-02-28 |
| J | 終了時刻 | 23:59 |
| K | LP URL | https://example.com/lp |
| L | 広告見出し | 今だけ限定！ |
| M | 広告本文 | 詳しくはこちら |
| N | 動画URL | https://drive.google.com/... |
| O | 動画クリエイティブ名 | summer_v1 |

#### Step 3: GASを実行
1. メニュー「Meta広告自動化」→「キャンペーン作成を実行」
2. 処理完了後、結果が表示される
3. 「videos」シートに動画情報が自動記録される

### 5.2 動画分析

#### Step 1: 分析対象の確認
「videos」シートに分析したい動画が登録されていることを確認

#### Step 2: 分析を実行
1. メニュー「Meta広告自動化」→「動画分析を実行」
2. Gemini APIで動画を分析
3. 結果が「analysis」シートに出力される

### 5.3 パフォーマンスレポート

#### 手動実行
1. Apps Scriptエディタを開く
2. 実行する関数を選択:
   - `runReport_Yesterday` - 昨日のレポート
   - `runReport_Last7D` - 過去7日間
   - `runReport_Last30D` - 直近1ヶ月
   - `runReport_Last90D` - 直近3ヶ月
   - `runAllReports` - 全期間

#### 自動実行の設定
1. Apps Scriptエディタで `createDailyReportTrigger` を実行
2. 毎日6時に自動でレポートが更新される

## 6. トラブルシューティング

### 6.1 Meta API エラー

#### トークン失効 (code=190)
```
Metaトークン失効(code=190)
```
→ アクセストークンを再発行してください

#### 権限エラー
```
Permissions error
```
→ トークンの権限スコープを確認してください

### 6.2 動画アップロードエラー

#### タイムアウト
```
動画のアップロードがタイムアウトしました
```
→ 動画サイズを小さくするか、分割してください

#### ファイルが見つからない
```
URLからファイルIDを抽出できません
```
→ Google DriveのURLが正しいか確認してください

### 6.3 Gemini API エラー

#### API キーエラー
```
Gemini API Keyが設定されていません
```
→ 共通設定シートにAPIキーを入力してください

#### ファイルサイズエラー
```
ファイルが大きすぎます
```
→ 動画を200MB以下に圧縮してください

## 7. 注意事項

### 7.1 セキュリティ
- アクセストークンは絶対に外部に漏らさないでください
- スプレッドシートの共有設定に注意してください

### 7.2 API制限
- Meta API: レート制限あり（大量のリクエストに注意）
- Gemini API: 無料枠の制限あり

### 7.3 コスト
- Meta広告: 設定した予算に応じて課金
- Gemini API: 使用量に応じて課金（無料枠あり）

## 8. よくある質問

**Q: InstagramアカウントIDがわからない**
A: 「Meta広告自動化」→「InstagramアカウントID取得」を実行

**Q: キャンペーンが作成されたが配信されない**
A: キャンペーンは「一時停止」状態で作成されます。広告マネージャーで有効化してください

**Q: 動画分析が途中で止まる**
A: GASの実行時間制限（6分）に達した可能性があります。再実行すると続きから処理されます
