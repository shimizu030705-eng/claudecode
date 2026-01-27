# ジム動画広告自動生成ツール

地域名を指定するだけで、「◯◯でジムをお探しの方へ」という冒頭付きの動画広告を自動生成するツールです。

## 機能

- 地域名に応じた音声（ナレーション）の自動生成
- テロップ（字幕）付きの冒頭動画の自動生成
- 本編動画との自動結合
- 複数地域の一括処理

## 必要な環境

- Python 3.10以上
- FFmpeg（システムにインストール済みであること）
- OpenAI APIキー（音声合成に使用）

## セットアップ

```bash
# 依存パッケージのインストール
pip install -r requirements.txt

# 環境変数の設定
cp .env.example .env
# .env ファイルを編集して OPENAI_API_KEY を設定
```

## 使い方

### 1. テンプレート動画（本編）を用意

`templates/` ディレクトリに本編動画を配置します。

### 2. 動画を生成

```bash
# 単一の地域で生成
python generate.py --location 渋谷 --template templates/main.mp4

# 複数の地域で一括生成
python generate.py --locations 渋谷,新宿,池袋 --template templates/main.mp4

# 地域リストファイルから生成
python generate.py --locations-file locations.txt --template templates/main.mp4
```

### オプション

| オプション | 短縮形 | 説明 |
|-----------|-------|------|
| `--location` | `-l` | 生成する地域名（単一） |
| `--locations` | `-L` | 生成する地域名（カンマ区切りで複数） |
| `--locations-file` | `-f` | 地域名リストファイル（1行1地域） |
| `--template` | `-t` | テンプレート動画のパス（必須） |
| `--output-dir` | `-o` | 出力ディレクトリ（デフォルト: `output/`） |
| `--font` | - | 使用するフォントファイルのパス |

## 出力

生成された動画は `output/` ディレクトリに保存されます。

```
output/
├── gym_ad_渋谷.mp4
├── gym_ad_新宿.mp4
└── gym_ad_池袋.mp4
```

## 設定のカスタマイズ

`config.py` で以下の設定を変更できます：

- **動画サイズ**: `VIDEO_WIDTH`, `VIDEO_HEIGHT`（デフォルト: 1080x1920 縦型）
- **フレームレート**: `VIDEO_FPS`（デフォルト: 30）
- **テロップ**: フォントサイズ、色、位置など
- **音声**: 声の種類、速度

## ディレクトリ構成

```
.
├── config.py          # 設定ファイル
├── generate.py        # メインスクリプト
├── requirements.txt   # 依存パッケージ
├── src/
│   ├── tts.py         # 音声合成モジュール
│   └── video.py       # 動画処理モジュール
├── templates/         # テンプレート動画置き場
├── output/            # 出力動画保存先
└── fonts/             # カスタムフォント置き場
```
