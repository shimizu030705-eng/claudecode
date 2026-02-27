"""通知・アラートシステム

各種チャンネル (Slack, Discord, LINE, コンソール) への通知を管理する。
"""

import json
import logging
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Optional

import requests

logger = logging.getLogger(__name__)


class NotificationChannel(ABC):
    """通知チャンネルの基底クラス"""

    @abstractmethod
    def send(self, title: str, message: str, level: str = "info") -> bool:
        """通知を送信"""
        pass


class ConsoleNotifier(NotificationChannel):
    """コンソール通知"""

    LEVEL_COLORS = {
        "info": "\033[94m",     # 青
        "warning": "\033[93m",  # 黄
        "danger": "\033[91m",   # 赤
        "critical": "\033[95m", # マゼンタ
        "success": "\033[92m",  # 緑
    }
    RESET = "\033[0m"

    def send(self, title: str, message: str, level: str = "info") -> bool:
        color = self.LEVEL_COLORS.get(level, "")
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"{color}[{timestamp}] [{level.upper()}] {title}{self.RESET}")
        print(f"  {message}")
        return True


class SlackNotifier(NotificationChannel):
    """Slack通知"""

    LEVEL_EMOJI = {
        "info": ":information_source:",
        "warning": ":warning:",
        "danger": ":rotating_light:",
        "critical": ":skull:",
        "success": ":white_check_mark:",
    }

    def __init__(self, webhook_url: str):
        self.webhook_url = webhook_url

    def send(self, title: str, message: str, level: str = "info") -> bool:
        if not self.webhook_url:
            return False

        emoji = self.LEVEL_EMOJI.get(level, "")
        payload = {
            "text": f"{emoji} *{title}*\n{message}",
        }

        try:
            resp = requests.post(
                self.webhook_url,
                json=payload,
                timeout=10,
            )
            return resp.status_code == 200
        except Exception as e:
            logger.error(f"Slack通知エラー: {e}")
            return False


class DiscordNotifier(NotificationChannel):
    """Discord通知"""

    LEVEL_COLORS = {
        "info": 3447003,      # 青
        "warning": 16776960,  # 黄
        "danger": 15158332,   # 赤
        "critical": 10181046, # 紫
        "success": 3066993,   # 緑
    }

    def __init__(self, webhook_url: str):
        self.webhook_url = webhook_url

    def send(self, title: str, message: str, level: str = "info") -> bool:
        if not self.webhook_url:
            return False

        color = self.LEVEL_COLORS.get(level, 0)
        payload = {
            "embeds": [{
                "title": title,
                "description": message,
                "color": color,
                "timestamp": datetime.now().isoformat(),
            }],
        }

        try:
            resp = requests.post(
                self.webhook_url,
                json=payload,
                headers={"Content-Type": "application/json"},
                timeout=10,
            )
            return resp.status_code in (200, 204)
        except Exception as e:
            logger.error(f"Discord通知エラー: {e}")
            return False


class LineNotifier(NotificationChannel):
    """LINE Notify通知"""

    API_URL = "https://notify-api.line.me/api/notify"

    def __init__(self, token: str):
        self.token = token

    def send(self, title: str, message: str, level: str = "info") -> bool:
        if not self.token:
            return False

        level_marker = {"warning": "⚠", "danger": "🔴", "critical": "🚨", "success": "✅"}.get(level, "ℹ")
        text = f"\n{level_marker} {title}\n{message}"

        try:
            resp = requests.post(
                self.API_URL,
                headers={"Authorization": f"Bearer {self.token}"},
                data={"message": text},
                timeout=10,
            )
            return resp.status_code == 200
        except Exception as e:
            logger.error(f"LINE通知エラー: {e}")
            return False


class NotificationManager:
    """通知マネージャー

    複数チャンネルへの通知配信と通知履歴管理を行う。
    """

    def __init__(self, config: dict):
        self.config = config.get("notifications", {})
        self.enabled = self.config.get("enabled", True)
        self.channels: list[NotificationChannel] = []
        self.history: list[dict] = []

        self._setup_channels()

    def _setup_channels(self) -> None:
        """設定に基づいてチャンネルを初期化"""
        channels_config = self.config.get("channels", {})

        # コンソール (常時有効)
        if channels_config.get("console", {}).get("enabled", True):
            self.channels.append(ConsoleNotifier())

        # Slack
        slack = channels_config.get("slack", {})
        if slack.get("enabled") and slack.get("webhook_url"):
            self.channels.append(SlackNotifier(slack["webhook_url"]))

        # Discord
        discord = channels_config.get("discord", {})
        if discord.get("enabled") and discord.get("webhook_url"):
            self.channels.append(DiscordNotifier(discord["webhook_url"]))

        # LINE
        line = channels_config.get("line", {})
        if line.get("enabled") and line.get("token"):
            self.channels.append(LineNotifier(line["token"]))

        logger.info(f"通知チャンネル: {len(self.channels)}個を初期化")

    def notify(self, title: str, message: str, level: str = "info") -> None:
        """全チャンネルに通知を送信"""
        if not self.enabled:
            return

        record = {
            "title": title,
            "message": message,
            "level": level,
            "timestamp": datetime.now().isoformat(),
            "results": {},
        }

        for channel in self.channels:
            name = type(channel).__name__
            try:
                success = channel.send(title, message, level)
                record["results"][name] = success
            except Exception as e:
                logger.error(f"通知送信エラー [{name}]: {e}")
                record["results"][name] = False

        self.history.append(record)

    def notify_trade(self, symbol: str, action: str, price: float, quantity: int, pnl: float = None) -> None:
        """取引通知"""
        title = f"取引実行: {symbol} {action.upper()}"
        message = f"{quantity}株 @ ¥{price:,.0f}"
        if pnl is not None:
            message += f" (損益: ¥{pnl:+,.0f})"

        level = "success" if (pnl and pnl > 0) else "info"
        self.notify(title, message, level)

    def notify_risk_alert(self, alert) -> None:
        """リスクアラート通知"""
        self.notify(
            f"リスクアラート ({alert.level})",
            alert.message,
            alert.level,
        )

    def notify_daily_summary(self, summary: str) -> None:
        """日次サマリー通知"""
        self.notify("日次サマリー", summary, "info")

    def notify_system_error(self, error: str) -> None:
        """システムエラー通知"""
        self.notify("システムエラー", error, "critical")
