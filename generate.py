#!/usr/bin/env python3
"""
ジム動画広告自動生成スクリプト

使用例:
    # 単一の地域で生成
    python generate.py --location 渋谷 --template templates/main.mp4

    # 複数の地域で一括生成
    python generate.py --locations 渋谷,新宿,池袋 --template templates/main.mp4

    # 地域リストファイルから生成
    python generate.py --locations-file locations.txt --template templates/main.mp4
"""

import argparse
import tempfile
from pathlib import Path

from dotenv import load_dotenv

import config
from src.tts import generate_intro_speech
from src.video import create_intro_video, concat_videos, normalize_video

load_dotenv()


def generate_ad_video(
    location: str,
    template_video: Path,
    output_path: Path = None,
    font_path: str = None,
) -> Path:
    """
    指定した地域名で動画広告を生成する

    Args:
        location: 地域名（例: "渋谷"）
        template_video: テンプレート動画（本編）のパス
        output_path: 出力ファイルパス（Noneの場合は自動生成）
        font_path: フォントファイルパス

    Returns:
        生成された動画ファイルのパス
    """
    if output_path is None:
        output_path = config.OUTPUT_DIR / f"gym_ad_{location}.mp4"

    print(f"[{location}] 動画広告を生成中...")

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_dir = Path(temp_dir)

        # 1. 音声を生成
        print(f"  - 音声を生成中...")
        audio_path = temp_dir / "intro_audio.mp3"
        generate_intro_speech(location, audio_path)

        # 2. 冒頭動画を生成（テロップ + 音声）
        print(f"  - 冒頭動画を生成中...")
        intro_video_path = temp_dir / "intro.mp4"
        create_intro_video(
            location=location,
            audio_path=audio_path,
            output_path=intro_video_path,
            font_path=font_path,
        )

        # 3. テンプレート動画を正規化（フォーマット統一）
        print(f"  - テンプレート動画を処理中...")
        normalized_template = temp_dir / "normalized_template.mp4"
        normalize_video(template_video, normalized_template)

        # 4. 冒頭動画も正規化
        normalized_intro = temp_dir / "normalized_intro.mp4"
        normalize_video(intro_video_path, normalized_intro)

        # 5. 動画を結合
        print(f"  - 動画を結合中...")
        concat_videos([normalized_intro, normalized_template], output_path)

    print(f"  ✓ 完成: {output_path}")
    return output_path


def main():
    parser = argparse.ArgumentParser(
        description="ジム動画広告自動生成ツール",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )

    # 地域指定オプション（どれか1つを指定）
    location_group = parser.add_mutually_exclusive_group(required=True)
    location_group.add_argument(
        "--location", "-l",
        help="生成する地域名（単一）"
    )
    location_group.add_argument(
        "--locations", "-L",
        help="生成する地域名（カンマ区切りで複数指定）"
    )
    location_group.add_argument(
        "--locations-file", "-f",
        type=Path,
        help="地域名リストファイル（1行1地域）"
    )

    # その他のオプション
    parser.add_argument(
        "--template", "-t",
        type=Path,
        required=True,
        help="テンプレート動画（本編）のパス"
    )
    parser.add_argument(
        "--output-dir", "-o",
        type=Path,
        default=config.OUTPUT_DIR,
        help=f"出力ディレクトリ（デフォルト: {config.OUTPUT_DIR}）"
    )
    parser.add_argument(
        "--font",
        type=Path,
        help="使用するフォントファイルのパス"
    )

    args = parser.parse_args()

    # 地域リストを構築
    if args.location:
        locations = [args.location]
    elif args.locations:
        locations = [loc.strip() for loc in args.locations.split(",")]
    else:
        with open(args.locations_file, "r", encoding="utf-8") as f:
            locations = [line.strip() for line in f if line.strip()]

    # テンプレート動画の存在確認
    if not args.template.exists():
        print(f"エラー: テンプレート動画が見つかりません: {args.template}")
        return 1

    # 出力ディレクトリを設定
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    # 各地域で動画を生成
    print(f"\n=== ジム動画広告生成 ===")
    print(f"地域数: {len(locations)}")
    print(f"テンプレート: {args.template}")
    print(f"出力先: {output_dir}\n")

    success_count = 0
    for location in locations:
        try:
            output_path = output_dir / f"gym_ad_{location}.mp4"
            generate_ad_video(
                location=location,
                template_video=args.template,
                output_path=output_path,
                font_path=str(args.font) if args.font else None,
            )
            success_count += 1
        except Exception as e:
            print(f"  ✗ エラー [{location}]: {e}")

    print(f"\n=== 完了 ===")
    print(f"成功: {success_count}/{len(locations)}")

    return 0 if success_count == len(locations) else 1


if __name__ == "__main__":
    exit(main())
