# Meta広告キャンペーン自動作成・分析システム

Google Apps Script (GAS) を使用して、Meta広告のキャンペーン作成から動画分析までを自動化するシステムです。

## 機能概要

### 1. キャンペーン自動作成
- スプレッドシートに設定を入力してGASを実行するだけで広告を出稿
- キャンペーン、広告セット、クリエイティブ、広告を一括作成
- 住所から自動で緯度経度を取得してエリアターゲティング
- 処理結果をメールで通知

### 2. 動画情報の自動記録
- 広告出稿時に「videos」シートへ動画情報を自動記録
  - A列: 動画名
  - B列: 固有ID（Meta video_id）
  - C列: 動画URL
  - D列: アップ日

### 3. 動画の定性分析
- Gemini APIを使用して動画クリエイティブを自動分析
- 冒頭3秒の映像・コピー、訴求軸、感情、CTAなどを抽出
- 正規化されたタグで分類

### 4. パフォーマンスレポート
- Meta Insights APIからレポートを自動取得
- 日次での詳細な指標を記録

## 処理フロー

```
[1] ドライブに動画を手動格納
        ↓
[2] スプレッドシートに動画URL・設定を入力
        ↓
[3] GAS実行
        ↓
    ┌───────────────────────────────────────┐
    │ [3-1] Meta広告に広告を出稿            │
    │ [3-2] videosタブに動画情報を自動記録  │
    └───────────────────────────────────────┘
        ↓
[4] 動画の定性分析（Gemini API）
        ↓
[5] 分析結果をanalysisシートに出力
```

## ファイル構成

```
src/gas/
├── 01_config.gs          # 設定・定数定義
├── 02_main.gs            # メイン実行関数
├── 03_meta_api.gs        # Meta Marketing API操作
├── 04_drive_utils.gs     # Google Drive操作
├── 05_gemini_analysis.gs # Gemini API動画分析
├── 06_sheet_utils.gs     # スプレッドシート操作
├── 07_utils.gs           # ユーティリティ関数
└── 08_performance_report.gs # パフォーマンスレポート

docs/
├── SYSTEM_DESIGN.md      # システム設計書
└── SETUP_GUIDE.md        # セットアップガイド
```

## シート構成

| シート名 | 用途 |
|---------|------|
| キャンペーン設定 | 広告出稿の設定を入力 |
| 共通設定 | API認証情報・共通パラメータ |
| videos | 出稿した動画の情報を自動記録 |
| analysis | 動画の定性分析結果 |
| 実行ログ | 処理履歴 |
| 昨日/過去7日間/直近1ヶ月/直近3ヶ月 | パフォーマンスレポート |

## クイックスタート

1. 新しいスプレッドシートを作成
2. Apps Script エディタを開く
3. `src/gas/` 内のファイルをコピー
4. スプレッドシートに戻り、メニュー「Meta広告自動化」→「シート初期設定」を実行
5. 「共通設定」シートにAPI情報を入力
6. 「キャンペーン設定」シートに広告設定を入力
7. 「Meta広告自動化」→「キャンペーン作成を実行」

詳細は [セットアップガイド](docs/SETUP_GUIDE.md) を参照してください。

## 必要な権限

### Meta API
- `ads_management`
- `ads_read`
- `business_management`
- `pages_read_engagement`
- `pages_manage_ads`
- `instagram_basic`
- `instagram_content_publish`

### Google APIs
- Google Drive（ファイル読み取り）
- Google Maps（ジオコーディング）
- Gmail（通知メール送信）

## 技術仕様

- Meta Marketing API v21.0
- Gemini API (gemini-2.5-flash)
- Google Apps Script

## 制限事項

- 動画ファイルサイズ: 最大200MB（Gemini分析時）
- 1回の実行で処理する動画数: 最大5件
- GAS実行時間制限: 6分

## ライセンス

MIT License
