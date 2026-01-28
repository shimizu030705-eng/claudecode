# Meta広告キャンペーン自動作成・分析システム

Meta広告のキャンペーン作成から分析までを自動化するGoogle Apps Scriptシステム。

## 機能概要

1. **キャンペーン自動作成**: スプレッドシートの設定に基づいてMeta広告キャンペーンを自動作成
2. **動画情報の自動記録**: 広告に使用した動画情報を「videos」シートに自動記録
3. **動画定性分析**: Gemini AIによる動画クリエイティブの定性分析
4. **レポート自動取得**: Meta Insights APIからの広告パフォーマンスレポート

## 処理フロー

```
[手動] Google Driveに動画を格納
         ↓
[手動] スプレッドシートに動画URL・設定を記載
         ↓
[自動] GAS実行 → Meta広告に出稿
         ↓
[自動] 「videos」タブに動画情報を自動記録
       (A: 動画名, B: 固有ID, C: 動画URL, D: アップ日)
         ↓
[自動] Geminiによる動画の定性分析
         ↓
[自動] Meta Adsレポート取得（日次トリガー）
```

## ファイル構成

```
src/gas/
├── config.gs       # 設定・定数
├── main.gs         # メイン実行関数・メニュー
├── campaign.gs     # キャンペーン作成モジュール
├── analysis.gs     # 動画分析モジュール（Gemini）
├── report.gs       # レポート取得モジュール
└── notification.gs # 通知モジュール

docs/
├── system-design.md # システム設計書
└── setup-guide.md   # セットアップガイド
```

## シート構成

| シート名 | 用途 |
|----------|------|
| 共通設定 | APIトークン、アカウントID等の設定 |
| キャンペーン設定 | キャンペーン情報の入力・ステータス管理 |
| videos | 動画情報の自動記録 |
| analysis | Geminiによる動画分析結果 |
| 実行ログ | 処理実行履歴 |
| 昨日 / 過去7日間 / 直近1ヶ月 / 直近3ヶ月 | 広告レポート |

## セットアップ

詳細は [docs/setup-guide.md](docs/setup-guide.md) を参照。

### クイックスタート

1. Google スプレッドシートで新規ファイルを作成
2. **拡張機能** > **Apps Script** でエディタを開く
3. `src/gas/` 内の各ファイルをコピー
4. スプレッドシートをリロード
5. **Meta広告自動化** > **シート初期設定** を実行
6. 「共通設定」シートに必要な情報を入力

### 必要な情報

- Meta広告アカウントID
- FacebookページID
- Instagramビジネスアカウントid
- Meta Pixel ID
- Metaアクセストークン
- Gemini APIキー

## 使用API

- **Meta Marketing API v21.0**: キャンペーン・広告作成、レポート取得
- **Meta Insights API v24.0**: 広告パフォーマンスデータ
- **Gemini API**: 動画の定性分析
- **Google Maps Geocoding API**: 住所から座標への変換

## ライセンス

MIT License
