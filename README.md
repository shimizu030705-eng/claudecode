# ジム動画広告 自動生成ツール

地域名を指定するだけで、冒頭のテロップと音声を自動生成し、本編動画と結合する仕組みです。

## セットアップ

### 1. 依存関係のインストール

```bash
pip install -r requirements.txt
```

### 2. FFmpegのインストール

```bash
# Ubuntu/Debian
sudo apt install ffmpeg

# Mac
brew install ffmpeg

# Windows
# https://ffmpeg.org/download.html からダウンロード
```

### 3. OpenAI APIキーの設定

```bash
export OPENAI_API_KEY='sk-your-api-key-here'
```

### 4. 本編動画の配置

本編動画を `templates/main_video.mp4` に配置してください。

## 使い方

### 単一店舗の動画を生成

```bash
python generate_gym_ad.py --location "渋谷"
```

### 複数店舗を一括生成

```bash
python generate_gym_ad.py --locations "渋谷,新宿,池袋,横浜,品川"
```

### 本編動画を指定

```bash
python generate_gym_ad.py --location "渋谷" --main-video ./my_video.mp4
```

### 出力先を指定

```bash
python generate_gym_ad.py --location "渋谷" --output-dir ./my_output
```

## 設定のカスタマイズ

`config.yaml` を編集して以下を変更できます：

- **音声**: 声の種類（nova, onyx, alloy など）
- **テロップ**: フォントサイズ、色
- **テンプレート文**: 「{location}でジムをお探しの方へ」の形式

## ファイル構成

```
.
├── generate_gym_ad.py    # メインスクリプト
├── config.yaml           # 設定ファイル
├── requirements.txt      # 依存パッケージ
├── templates/
│   └── main_video.mp4    # 本編動画（ここに配置）
└── output/               # 生成された動画の出力先
```

## 料金目安

OpenAI TTS（標準）: 約 **0.03円/動画**（1,000動画で約30円）
