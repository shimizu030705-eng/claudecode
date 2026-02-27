# 株式デイトレード自動運用ツール

ファンダメンタルズ分析とテクニカル分析を自動で定期実行し、リスク管理を最大限に行う株式デイトレード自動運用ツール。

## 主な機能

### テクニカル分析
- RSI (相対力指数)
- MACD (移動平均収束拡散法)
- ボリンジャーバンド
- 移動平均線クロスオーバー (SMA/EMA)
- VWAP (出来高加重平均価格)
- 出来高急増検知

### ファンダメンタルズ分析
- バリュエーション評価 (PER, PBR, PSR)
- 収益性評価 (ROE, ROA, 利益率)
- 成長性評価 (売上成長率, 利益成長率)
- 財務健全性評価 (負債比率, 流動比率)
- A〜Fグレード判定

### リスク管理
- 自動ストップロス / テイクプロフィット
- トレーリングストップ
- ポジションサイジング (リスクベース)
- ポートフォリオドローダウン監視
- 最大ポジション数制限
- 日次取引回数制限
- 急変動リアルタイム検知

### 通知システム
- Slack / Discord / LINE Notify / コンソール
- 取引実行通知、リスクアラート、日次サマリー

### バックテスト
- 過去データによる戦略検証
- 勝率、プロフィットファクター、シャープレシオ算出
- 手数料・スリッページ考慮

## セットアップ

```bash
pip install -r requirements.txt
cp .env.example .env  # 通知設定を編集
```

## 使い方

```bash
# ウォッチリスト全銘柄をスキャン & 自動取引判断
python main.py scan

# リアルタイム監視モード (30秒間隔)
python main.py monitor

# バックテスト実行
python main.py backtest --symbol 7203.T --period 6mo

# ファンダメンタルズ分析
python main.py fundamental --symbol 7203.T

# ポートフォリオサマリー
python main.py summary
```

## テスト

```bash
pytest tests/ -v
```

## プロジェクト構造

```
├── main.py                    # エントリーポイント
├── config/
│   └── settings.yaml          # 設定ファイル
├── src/
│   ├── config.py              # 設定読み込み
│   ├── data/
│   │   └── fetcher.py         # 株価・ファンダメンタルズデータ取得
│   ├── analysis/
│   │   ├── technical.py       # テクニカル分析エンジン
│   │   └── fundamental.py     # ファンダメンタルズ分析エンジン
│   ├── risk/
│   │   └── manager.py         # リスク管理・ポジション管理
│   ├── notification/
│   │   └── notifier.py        # 通知システム (Slack/Discord/LINE)
│   ├── trading/
│   │   └── engine.py          # トレーディングエンジン (統合判断)
│   └── backtest/
│       └── engine.py          # バックテストエンジン
├── tests/                     # ユニットテスト
├── requirements.txt
└── .env.example
```

## 注意事項

- デフォルトは **ペーパートレードモード** (実際の注文は発行しません)
- 実取引を行う場合は証券会社APIとの連携が別途必要です
- 投資判断は自己責任で行ってください。本ツールは利益を保証するものではありません
