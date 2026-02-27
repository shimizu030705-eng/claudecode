"""株式デイトレード自動運用ツール - メインエントリーポイント

使い方:
    # ウォッチリストのスキャン & 自動取引判断
    python main.py scan

    # リアルタイム監視モード
    python main.py monitor

    # バックテスト実行
    python main.py backtest --symbol 7203.T --period 6mo

    # ファンダメンタルズ分析
    python main.py fundamental --symbol 7203.T

    # ポートフォリオサマリー
    python main.py summary
"""

import argparse
import logging
import signal
import sys
import time
from datetime import datetime

from src.backtest.engine import BacktestEngine
from src.config import load_config
from src.data.fetcher import StockDataFetcher
from src.notification.notifier import NotificationManager
from src.trading.engine import TradingEngine

# ロギング設定
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


class AutoTrader:
    """自動トレードアプリケーション"""

    def __init__(self, config_path: str = None):
        self.config = load_config(config_path)
        self.engine = TradingEngine(self.config)
        self.running = False

        # グレースフルシャットダウン
        signal.signal(signal.SIGINT, self._shutdown)
        signal.signal(signal.SIGTERM, self._shutdown)

    def scan(self) -> None:
        """ウォッチリスト全銘柄をスキャンして取引判断"""
        logger.info("=== スキャン開始 ===")
        decisions = self.engine.run_scan()

        for decision in decisions:
            status = f"[{decision.action.upper()}]" if decision.action != "hold" else "[HOLD]"
            logger.info(
                f"{status} {decision.symbol}: "
                f"信頼度={decision.confidence:.2f}, "
                f"理由={', '.join(decision.reasons)}"
            )

            # ペーパートレードモード: 買い/売りシグナルを自動実行
            if self.config["general"]["mode"] == "paper" and decision.action != "hold":
                self.engine.execute_decision(decision)

        logger.info(f"=== スキャン完了: {len(decisions)}銘柄評価 ===")

    def monitor(self) -> None:
        """リアルタイム監視モード"""
        interval = self.config["watchlist"]["fetch_interval"]
        logger.info(f"=== リアルタイム監視開始 (間隔: {interval}秒) ===")

        self.running = True
        while self.running:
            try:
                # 全銘柄のリアルタイムデータ取得
                prices = {}
                realtime_data = self.engine.fetcher.fetch_all_watchlist()

                for symbol, data in realtime_data.items():
                    prices[symbol] = data["price"]

                    # 急変動チェック
                    if "instant_change_percent" in data:
                        alert = self.engine.risk_manager.check_price_volatility(
                            symbol, data["price"],
                            data["price"] / (1 + data.get("instant_change_percent", 0) / 100)
                        )
                        if alert:
                            self.engine.notifier.notify_risk_alert(alert)

                    logger.info(
                        f"[{symbol}] ¥{data['price']:,.0f} "
                        f"({data['change_percent']:+.2f}%) "
                        f"出来高: {data.get('volume', 'N/A')}"
                    )

                # ポジションリスク監視
                if prices:
                    alerts = self.engine.run_monitor(prices)
                    if alerts:
                        logger.warning(f"リスクアラート: {len(alerts)}件")

                time.sleep(interval)

            except Exception as e:
                logger.error(f"監視エラー: {e}")
                self.engine.notifier.notify_system_error(str(e))
                time.sleep(interval)

    def backtest(self, symbol: str, period: str = "6mo") -> None:
        """バックテスト実行"""
        logger.info(f"=== バックテスト: {symbol} (期間: {period}) ===")

        fetcher = StockDataFetcher(self.config)
        df = fetcher.fetch_historical(symbol, period=period)

        if df is None:
            logger.error("データ取得に失敗しました")
            return

        bt_engine = BacktestEngine(self.config)
        result = bt_engine.run(symbol, df)

        if result:
            print(bt_engine.format_result(result))
        else:
            logger.error("バックテスト実行に失敗しました")

    def fundamental(self, symbol: str) -> None:
        """ファンダメンタルズ分析"""
        logger.info(f"=== ファンダメンタルズ分析: {symbol} ===")

        fetcher = StockDataFetcher(self.config)
        data = fetcher.fetch_fundamentals(symbol)

        if data is None:
            logger.error("データ取得に失敗しました")
            return

        score = self.engine.fundamental.analyze(data)
        if score:
            print(self.engine.fundamental.get_summary(score))

    def summary(self) -> None:
        """ポートフォリオサマリー表示"""
        summary = self.engine.get_daily_summary()
        print(summary)
        self.engine.notifier.notify_daily_summary(summary)

    def _shutdown(self, signum, frame) -> None:
        """グレースフルシャットダウン"""
        logger.info("シャットダウン中...")
        self.running = False

        # 日次サマリー送信
        summary = self.engine.get_daily_summary()
        self.engine.notifier.notify_daily_summary(summary)

        logger.info("シャットダウン完了")
        sys.exit(0)


def main():
    parser = argparse.ArgumentParser(
        description="株式デイトレード自動運用ツール",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "command",
        choices=["scan", "monitor", "backtest", "fundamental", "summary"],
        help="実行コマンド",
    )
    parser.add_argument("--symbol", "-s", help="対象銘柄 (例: 7203.T)")
    parser.add_argument("--period", "-p", default="6mo", help="期間 (例: 3mo, 6mo, 1y)")
    parser.add_argument("--config", "-c", help="設定ファイルパス")

    args = parser.parse_args()

    trader = AutoTrader(args.config)

    if args.command == "scan":
        trader.scan()
    elif args.command == "monitor":
        trader.monitor()
    elif args.command == "backtest":
        if not args.symbol:
            parser.error("backtest コマンドには --symbol が必要です")
        trader.backtest(args.symbol, args.period)
    elif args.command == "fundamental":
        if not args.symbol:
            parser.error("fundamental コマンドには --symbol が必要です")
        trader.fundamental(args.symbol)
    elif args.command == "summary":
        trader.summary()


if __name__ == "__main__":
    main()
