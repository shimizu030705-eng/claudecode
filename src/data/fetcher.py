"""株価データ取得モジュール

Yahoo Finance APIを使用してリアルタイム・履歴データを取得する。
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

import numpy as np
import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)


class StockDataFetcher:
    """株価データの取得・管理を行うクラス"""

    def __init__(self, config: dict):
        self.config = config
        self.watchlist = config["watchlist"]["symbols"]
        self._cache: dict[str, pd.DataFrame] = {}
        self._last_prices: dict[str, float] = {}

    def fetch_realtime(self, symbol: str) -> Optional[dict]:
        """リアルタイム株価データを取得

        Returns:
            dict: {price, change, change_percent, volume, bid, ask, timestamp}
        """
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.fast_info

            current_price = info.get("lastPrice", info.get("last_price", 0))
            prev_close = info.get("previousClose", info.get("previous_close", 0))

            if current_price and prev_close:
                change = current_price - prev_close
                change_pct = (change / prev_close) * 100
            else:
                change = 0
                change_pct = 0

            data = {
                "symbol": symbol,
                "price": current_price,
                "previous_close": prev_close,
                "change": change,
                "change_percent": change_pct,
                "volume": info.get("lastVolume", info.get("last_volume", 0)),
                "market_cap": info.get("marketCap", info.get("market_cap", 0)),
                "timestamp": datetime.now(),
            }

            # 価格変動チェック
            if symbol in self._last_prices:
                prev = self._last_prices[symbol]
                if prev > 0:
                    instant_change = abs((current_price - prev) / prev * 100)
                    data["instant_change_percent"] = instant_change

            self._last_prices[symbol] = current_price
            return data

        except Exception as e:
            logger.error(f"リアルタイムデータ取得エラー [{symbol}]: {e}")
            return None

    def fetch_historical(
        self,
        symbol: str,
        period: str = "3mo",
        interval: str = "1d",
    ) -> Optional[pd.DataFrame]:
        """履歴データを取得

        Args:
            symbol: ティッカーシンボル
            period: 取得期間 (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max)
            interval: データ間隔 (1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1wk, 1mo)

        Returns:
            DataFrame: OHLCV データ
        """
        try:
            ticker = yf.Ticker(symbol)
            df = ticker.history(period=period, interval=interval)

            if df.empty:
                logger.warning(f"履歴データが空です [{symbol}]")
                return None

            df.index = pd.to_datetime(df.index)
            self._cache[f"{symbol}_{period}_{interval}"] = df

            logger.info(
                f"履歴データ取得完了 [{symbol}]: {len(df)}件 "
                f"({df.index[0].date()} ~ {df.index[-1].date()})"
            )
            return df

        except Exception as e:
            logger.error(f"履歴データ取得エラー [{symbol}]: {e}")
            return None

    def fetch_intraday(self, symbol: str, interval: str = "1m") -> Optional[pd.DataFrame]:
        """日中データを取得 (デイトレ用)"""
        return self.fetch_historical(symbol, period="1d", interval=interval)

    def fetch_fundamentals(self, symbol: str) -> Optional[dict]:
        """ファンダメンタルズデータを取得

        Returns:
            dict: 財務指標データ
        """
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info

            fundamentals = {
                "symbol": symbol,
                "name": info.get("longName", info.get("shortName", symbol)),
                "sector": info.get("sector", "N/A"),
                "industry": info.get("industry", "N/A"),
                # バリュエーション
                "per": info.get("trailingPE", info.get("forwardPE")),
                "pbr": info.get("priceToBook"),
                "psr": info.get("priceToSalesTrailing12Months"),
                "ev_ebitda": info.get("enterpriseToEbitda"),
                # 収益性
                "roe": _safe_percent(info.get("returnOnEquity")),
                "roa": _safe_percent(info.get("returnOnAssets")),
                "profit_margin": _safe_percent(info.get("profitMargins")),
                "operating_margin": _safe_percent(info.get("operatingMargins")),
                "gross_margin": _safe_percent(info.get("grossMargins")),
                # 成長性
                "revenue_growth": _safe_percent(info.get("revenueGrowth")),
                "earnings_growth": _safe_percent(info.get("earningsGrowth")),
                # 財務健全性
                "debt_to_equity": info.get("debtToEquity"),
                "current_ratio": info.get("currentRatio"),
                "quick_ratio": info.get("quickRatio"),
                # 配当
                "dividend_yield": _safe_percent(info.get("dividendYield")),
                "payout_ratio": _safe_percent(info.get("payoutRatio")),
                # その他
                "market_cap": info.get("marketCap"),
                "enterprise_value": info.get("enterpriseValue"),
                "beta": info.get("beta"),
                "fifty_two_week_high": info.get("fiftyTwoWeekHigh"),
                "fifty_two_week_low": info.get("fiftyTwoWeekLow"),
                "avg_volume": info.get("averageVolume"),
                "timestamp": datetime.now(),
            }

            logger.info(f"ファンダメンタルズデータ取得完了 [{symbol}]")
            return fundamentals

        except Exception as e:
            logger.error(f"ファンダメンタルズデータ取得エラー [{symbol}]: {e}")
            return None

    def fetch_all_watchlist(self) -> dict[str, dict]:
        """ウォッチリスト全銘柄のリアルタイムデータを取得"""
        results = {}
        for symbol in self.watchlist:
            data = self.fetch_realtime(symbol)
            if data:
                results[symbol] = data
        return results


def _safe_percent(value) -> Optional[float]:
    """安全にパーセント変換"""
    if value is None:
        return None
    try:
        return float(value) * 100
    except (TypeError, ValueError):
        return None
