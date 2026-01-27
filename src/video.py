"""動画処理モジュール（FFmpeg使用）"""

import subprocess
import tempfile
from pathlib import Path

import config


def get_video_duration(video_path: Path) -> float:
    """動画の長さを取得する"""
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(video_path)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return float(result.stdout.strip())


def get_audio_duration(audio_path: Path) -> float:
    """音声の長さを取得する"""
    return get_video_duration(audio_path)


def create_intro_video(
    location: str,
    audio_path: Path,
    output_path: Path,
    background_color: str = "black",
    font_path: str = None,
) -> Path:
    """
    テロップと音声付きの冒頭動画を生成する

    Args:
        location: 地域名
        audio_path: ナレーション音声ファイルパス
        output_path: 出力ファイルパス
        background_color: 背景色
        font_path: フォントファイルパス（Noneの場合はシステムフォント）

    Returns:
        生成された動画ファイルのパス
    """
    text = f"{location}でジムをお探しの方へ"

    # 音声の長さを取得して、それに合わせた動画を作成
    duration = get_audio_duration(audio_path)
    # 前後に少し余白を追加
    duration = duration + 0.5

    # フォント設定
    if font_path:
        font_setting = f"fontfile={font_path}"
    else:
        # システムの日本語フォントを検索
        font_setting = "font=Noto Sans CJK JP"

    # FFmpegコマンドを構築
    filter_complex = (
        f"color=c={background_color}:s={config.VIDEO_WIDTH}x{config.VIDEO_HEIGHT}:d={duration}:r={config.VIDEO_FPS}[bg];"
        f"[bg]drawtext="
        f"{font_setting}:"
        f"text='{text}':"
        f"fontsize={config.TELOP_FONT_SIZE}:"
        f"fontcolor={config.TELOP_FONT_COLOR}:"
        f"x=(w-text_w)/2:"
        f"y={config.TELOP_POSITION_Y}:"
        f"box=1:"
        f"boxcolor={config.TELOP_BG_COLOR}:"
        f"boxborderw=20[v]"
    )

    cmd = [
        "ffmpeg",
        "-y",
        "-i", str(audio_path),
        "-filter_complex", filter_complex,
        "-map", "[v]",
        "-map", "0:a",
        "-c:v", "libx264",
        "-preset", "fast",
        "-c:a", "aac",
        "-shortest",
        str(output_path)
    ]

    output_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(cmd, check=True, capture_output=True)

    return output_path


def concat_videos(video_paths: list[Path], output_path: Path) -> Path:
    """
    複数の動画を結合する

    Args:
        video_paths: 結合する動画ファイルパスのリスト
        output_path: 出力ファイルパス

    Returns:
        結合された動画ファイルのパス
    """
    # 一時的なファイルリストを作成
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
        for video_path in video_paths:
            f.write(f"file '{video_path}'\n")
        list_file = f.name

    try:
        cmd = [
            "ffmpeg",
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", list_file,
            "-c", "copy",
            str(output_path)
        ]

        output_path.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(cmd, check=True, capture_output=True)
    finally:
        Path(list_file).unlink()

    return output_path


def normalize_video(input_path: Path, output_path: Path) -> Path:
    """
    動画を標準フォーマットに変換する（結合前の前処理）

    Args:
        input_path: 入力動画ファイルパス
        output_path: 出力ファイルパス

    Returns:
        変換された動画ファイルのパス
    """
    cmd = [
        "ffmpeg",
        "-y",
        "-i", str(input_path),
        "-vf", f"scale={config.VIDEO_WIDTH}:{config.VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,pad={config.VIDEO_WIDTH}:{config.VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2",
        "-r", str(config.VIDEO_FPS),
        "-c:v", "libx264",
        "-preset", "fast",
        "-c:a", "aac",
        "-ar", "44100",
        str(output_path)
    ]

    output_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(cmd, check=True, capture_output=True)

    return output_path
