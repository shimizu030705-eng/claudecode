#!/usr/bin/env python3
"""
ジム店舗別動画広告 自動生成スクリプト

使い方:
    # 単一店舗
    python generate_gym_ad.py --location "渋谷"

    # 複数店舗一括生成
    python generate_gym_ad.py --locations "渋谷,新宿,池袋"

    # 本編動画を指定
    python generate_gym_ad.py --location "渋谷" --main-video ./templates/main.mp4
"""

import argparse
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import yaml
from openai import OpenAI


def load_config(config_path: str = "config.yaml") -> dict:
    """設定ファイルを読み込む"""
    default_config = {
        "openai": {
            "model": "tts-1",
            "voice": "nova",  # alloy, echo, fable, onyx, nova, shimmer
        },
        "video": {
            "intro_duration": 3,  # 冒頭の秒数
            "width": 1920,
            "height": 1080,
            "fps": 30,
            "font_size": 72,
            "font_color": "white",
            "background_color": "black",
        },
        "text": {
            "template": "{location}でジムをお探しの方へ",
        },
    }

    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            user_config = yaml.safe_load(f) or {}
        # マージ
        for key, value in user_config.items():
            if isinstance(value, dict) and key in default_config:
                default_config[key].update(value)
            else:
                default_config[key] = value

    return default_config


def generate_speech(text: str, output_path: str, config: dict) -> str:
    """OpenAI TTSで音声を生成"""
    client = OpenAI()

    response = client.audio.speech.create(
        model=config["openai"]["model"],
        voice=config["openai"]["voice"],
        input=text,
    )

    response.stream_to_file(output_path)
    return output_path


def get_audio_duration(audio_path: str) -> float:
    """音声ファイルの長さを取得"""
    result = subprocess.run(
        [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            audio_path,
        ],
        capture_output=True,
        text=True,
    )
    return float(result.stdout.strip())


def create_intro_video(
    text: str,
    audio_path: str,
    output_path: str,
    config: dict,
) -> str:
    """テロップ付き冒頭動画を生成"""
    video_config = config["video"]
    duration = get_audio_duration(audio_path)

    # 余白を追加（音声の前後に0.5秒ずつ）
    total_duration = duration + 1.0
    audio_delay = 0.5  # 音声開始を0.5秒遅らせる

    # FFmpegコマンドを構築
    # 日本語フォントを指定（環境に応じて調整が必要な場合あり）
    font_options = [
        "fontsize={}".format(video_config["font_size"]),
        "fontcolor={}".format(video_config["font_color"]),
        "x=(w-text_w)/2",
        "y=(h-text_h)/2",
    ]

    # システムで利用可能な日本語フォントを探す
    font_paths = [
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
        "/System/Library/Fonts/ヒラギノ角ゴシック W4.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "C:/Windows/Fonts/msgothic.ttc",
    ]

    font_file = None
    for fp in font_paths:
        if os.path.exists(fp):
            font_file = fp
            break

    if font_file:
        font_options.insert(0, f"fontfile={font_file}")

    drawtext_filter = "drawtext=text='{}':{}".format(
        text.replace("'", "\\'"),
        ":".join(font_options),
    )

    cmd = [
        "ffmpeg",
        "-y",
        "-f", "lavfi",
        "-i", f"color=c={video_config['background_color']}:s={video_config['width']}x{video_config['height']}:d={total_duration}:r={video_config['fps']}",
        "-i", audio_path,
        "-filter_complex",
        f"[0:v]{drawtext_filter}[v];[1:a]adelay={int(audio_delay*1000)}|{int(audio_delay*1000)}[a]",
        "-map", "[v]",
        "-map", "[a]",
        "-c:v", "libx264",
        "-c:a", "aac",
        "-shortest",
        output_path,
    ]

    subprocess.run(cmd, check=True, capture_output=True)
    return output_path


def get_video_properties(video_path: str) -> dict:
    """動画のプロパティを取得"""
    result = subprocess.run(
        [
            "ffprobe",
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,r_frame_rate",
            "-of", "json",
            video_path,
        ],
        capture_output=True,
        text=True,
    )
    import json
    data = json.loads(result.stdout)
    stream = data["streams"][0]

    # フレームレートを計算
    fps_parts = stream["r_frame_rate"].split("/")
    fps = int(fps_parts[0]) / int(fps_parts[1]) if len(fps_parts) == 2 else float(fps_parts[0])

    return {
        "width": stream["width"],
        "height": stream["height"],
        "fps": fps,
    }


def concatenate_videos(intro_path: str, main_path: str, output_path: str) -> str:
    """冒頭動画と本編動画を結合"""
    # 本編動画のプロパティを取得して冒頭動画を合わせる
    props = get_video_properties(main_path)

    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        f.write(f"file '{intro_path}'\n")
        f.write(f"file '{main_path}'\n")
        concat_list = f.name

    try:
        # まず冒頭動画を本編と同じ解像度・フレームレートに変換
        intro_resized = intro_path.replace(".mp4", "_resized.mp4")

        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i", intro_path,
                "-vf", f"scale={props['width']}:{props['height']}:force_original_aspect_ratio=decrease,pad={props['width']}:{props['height']}:(ow-iw)/2:(oh-ih)/2",
                "-r", str(props["fps"]),
                "-c:v", "libx264",
                "-c:a", "aac",
                intro_resized,
            ],
            check=True,
            capture_output=True,
        )

        # 結合リストを更新
        with open(concat_list, "w") as f:
            f.write(f"file '{intro_resized}'\n")
            f.write(f"file '{main_path}'\n")

        # 結合
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", concat_list,
                "-c", "copy",
                output_path,
            ],
            check=True,
            capture_output=True,
        )

        # 一時ファイルを削除
        if os.path.exists(intro_resized):
            os.remove(intro_resized)

    finally:
        os.remove(concat_list)

    return output_path


def generate_gym_ad(
    location: str,
    main_video_path: str | None,
    output_dir: str,
    config: dict,
) -> str:
    """ジム広告動画を生成"""
    os.makedirs(output_dir, exist_ok=True)

    # テキストを生成
    text = config["text"]["template"].format(location=location)
    print(f"生成中: {text}")

    # 一時ファイル用ディレクトリ
    with tempfile.TemporaryDirectory() as temp_dir:
        # 1. 音声を生成
        audio_path = os.path.join(temp_dir, "speech.mp3")
        print("  → 音声を生成中...")
        generate_speech(text, audio_path, config)

        # 2. 冒頭動画を生成
        intro_path = os.path.join(temp_dir, "intro.mp4")
        print("  → 冒頭動画を生成中...")
        create_intro_video(text, audio_path, intro_path, config)

        # 3. 本編と結合（本編がある場合）
        if main_video_path and os.path.exists(main_video_path):
            output_path = os.path.join(output_dir, f"gym_ad_{location}.mp4")
            print("  → 本編と結合中...")
            concatenate_videos(intro_path, main_video_path, output_path)
        else:
            # 本編がない場合は冒頭のみを出力
            output_path = os.path.join(output_dir, f"gym_intro_{location}.mp4")
            subprocess.run(
                ["cp", intro_path, output_path],
                check=True,
            )
            if not main_video_path:
                print("  ⚠ 本編動画が指定されていないため、冒頭のみを出力しました")
            else:
                print(f"  ⚠ 本編動画が見つかりません: {main_video_path}")

    print(f"  ✓ 完成: {output_path}")
    return output_path


def main():
    parser = argparse.ArgumentParser(
        description="ジム店舗別動画広告を自動生成",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用例:
    # 単一店舗の動画を生成
    python generate_gym_ad.py --location "渋谷"

    # 複数店舗を一括生成
    python generate_gym_ad.py --locations "渋谷,新宿,池袋,横浜"

    # 本編動画を指定
    python generate_gym_ad.py --location "渋谷" --main-video ./my_video.mp4

    # 出力先を指定
    python generate_gym_ad.py --location "渋谷" --output-dir ./my_output

環境変数:
    OPENAI_API_KEY: OpenAI APIキー（必須）
        """,
    )

    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--location", "-l",
        help="地域名（例: 渋谷）",
    )
    group.add_argument(
        "--locations", "-L",
        help="カンマ区切りの地域名リスト（例: 渋谷,新宿,池袋）",
    )

    parser.add_argument(
        "--main-video", "-m",
        default="./templates/main_video.mp4",
        help="本編動画のパス（デフォルト: ./templates/main_video.mp4）",
    )
    parser.add_argument(
        "--output-dir", "-o",
        default="./output",
        help="出力ディレクトリ（デフォルト: ./output）",
    )
    parser.add_argument(
        "--config", "-c",
        default="config.yaml",
        help="設定ファイルのパス（デフォルト: config.yaml）",
    )

    args = parser.parse_args()

    # APIキーの確認
    if not os.environ.get("OPENAI_API_KEY"):
        print("エラー: OPENAI_API_KEY 環境変数を設定してください")
        print("  export OPENAI_API_KEY='your-api-key'")
        sys.exit(1)

    # FFmpegの確認
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
    except FileNotFoundError:
        print("エラー: FFmpegがインストールされていません")
        print("  Ubuntu: sudo apt install ffmpeg")
        print("  Mac: brew install ffmpeg")
        sys.exit(1)

    # 設定を読み込み
    config = load_config(args.config)

    # 地域リストを作成
    if args.location:
        locations = [args.location]
    else:
        locations = [loc.strip() for loc in args.locations.split(",")]

    # 各地域の動画を生成
    print(f"\n{'='*50}")
    print(f"ジム動画広告生成 - {len(locations)}店舗")
    print(f"{'='*50}\n")

    generated = []
    for location in locations:
        try:
            output_path = generate_gym_ad(
                location=location,
                main_video_path=args.main_video,
                output_dir=args.output_dir,
                config=config,
            )
            generated.append(output_path)
        except Exception as e:
            print(f"  ✗ エラー ({location}): {e}")

    print(f"\n{'='*50}")
    print(f"完了: {len(generated)}/{len(locations)} 件の動画を生成しました")
    print(f"{'='*50}\n")


if __name__ == "__main__":
    main()
