"""設定ファイル"""

from pathlib import Path

# ディレクトリ設定
BASE_DIR = Path(__file__).parent
TEMPLATES_DIR = BASE_DIR / "templates"
OUTPUT_DIR = BASE_DIR / "output"
FONTS_DIR = BASE_DIR / "fonts"

# 動画設定
VIDEO_WIDTH = 1080
VIDEO_HEIGHT = 1920  # 縦型動画（9:16）
VIDEO_FPS = 30

# テロップ設定
TELOP_FONT_SIZE = 64
TELOP_FONT_COLOR = "white"
TELOP_BG_COLOR = "black@0.7"  # 半透明の黒背景
TELOP_POSITION_Y = 200  # 上からの位置

# 音声設定
TTS_VOICE = "nova"  # OpenAI TTS voice: alloy, echo, fable, onyx, nova, shimmer
TTS_SPEED = 1.0

# 冒頭部分の長さ（秒）
INTRO_DURATION = 3.0
