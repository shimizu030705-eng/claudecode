"""設定管理モジュール"""

import os
from pathlib import Path

import yaml
from dotenv import load_dotenv


def load_config(config_path: str = None) -> dict:
    """YAML設定ファイルと環境変数を読み込む"""
    load_dotenv()

    if config_path is None:
        config_path = Path(__file__).parent.parent / "config" / "settings.yaml"

    with open(config_path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    # 環境変数で機密情報を上書き
    _apply_env_overrides(config)

    return config


def _apply_env_overrides(config: dict) -> None:
    """環境変数から機密設定を上書き"""
    env_mappings = {
        "SLACK_WEBHOOK_URL": ("notifications", "channels", "slack", "webhook_url"),
        "DISCORD_WEBHOOK_URL": ("notifications", "channels", "discord", "webhook_url"),
        "LINE_NOTIFY_TOKEN": ("notifications", "channels", "line", "token"),
    }

    for env_key, config_path in env_mappings.items():
        value = os.getenv(env_key)
        if value:
            obj = config
            for key in config_path[:-1]:
                obj = obj[key]
            obj[config_path[-1]] = value
