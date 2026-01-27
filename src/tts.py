"""音声合成（TTS）モジュール"""

import os
from pathlib import Path

from openai import OpenAI
from dotenv import load_dotenv

import config

load_dotenv()


def generate_speech(text: str, output_path: Path, voice: str = None) -> Path:
    """
    テキストから音声を生成する

    Args:
        text: 読み上げるテキスト
        output_path: 出力ファイルパス
        voice: 使用する音声（デフォルトはconfig.TTS_VOICE）

    Returns:
        生成された音声ファイルのパス
    """
    client = OpenAI()

    voice = voice or config.TTS_VOICE

    response = client.audio.speech.create(
        model="tts-1",
        voice=voice,
        input=text,
        speed=config.TTS_SPEED,
    )

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    response.stream_to_file(str(output_path))

    return output_path


def generate_intro_speech(location: str, output_path: Path) -> Path:
    """
    冒頭ナレーション用の音声を生成する

    Args:
        location: 地域名（例: "渋谷", "新宿"）
        output_path: 出力ファイルパス

    Returns:
        生成された音声ファイルのパス
    """
    text = f"{location}でジムをお探しの方へ"
    return generate_speech(text, output_path)
