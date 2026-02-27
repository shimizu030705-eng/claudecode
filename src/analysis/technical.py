"""テクニカル分析エンジン

各種テクニカル指標を計算し、売買シグナルを生成する。
"""

import logging
from dataclasses import dataclass
from enum import Enum
from typing import Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


class Signal(Enum):
    """売買シグナル"""
    STRONG_BUY = "strong_buy"
    BUY = "buy"
    NEUTRAL = "neutral"
    SELL = "sell"
    STRONG_SELL = "strong_sell"


@dataclass
class TechnicalSignal:
    """テクニカルシグナルの結果"""
    indicator: str
    signal: Signal
    strength: float  # 0.0 ~ 1.0
    value: float
    description: str


class TechnicalAnalyzer:
    """テクニカル分析エンジン"""

    def __init__(self, config: dict):
        self.config = config.get("technical_analysis", {})
        self.sma_periods = self.config.get("sma_periods", [5, 25, 75])
        self.ema_periods = self.config.get("ema_periods", [12, 26])
        self.rsi_period = self.config.get("rsi_period", 14)
        self.rsi_overbought = self.config.get("rsi_overbought", 70)
        self.rsi_oversold = self.config.get("rsi_oversold", 30)
        self.macd_fast = self.config.get("macd_fast", 12)
        self.macd_slow = self.config.get("macd_slow", 26)
        self.macd_signal = self.config.get("macd_signal", 9)
        self.bb_period = self.config.get("bollinger_period", 20)
        self.bb_std = self.config.get("bollinger_std", 2)
        self.vol_sma_period = self.config.get("volume_sma_period", 20)
        self.vol_spike_threshold = self.config.get("volume_spike_threshold", 2.0)

    def analyze(self, df: pd.DataFrame) -> list[TechnicalSignal]:
        """全テクニカル指標を分析してシグナルリストを返す"""
        if df is None or df.empty or len(df) < self.bb_period:
            logger.warning("分析に必要なデータが不足しています")
            return []

        signals = []

        rsi_signal = self._analyze_rsi(df)
        if rsi_signal:
            signals.append(rsi_signal)

        macd_signal = self._analyze_macd(df)
        if macd_signal:
            signals.append(macd_signal)

        bb_signal = self._analyze_bollinger(df)
        if bb_signal:
            signals.append(bb_signal)

        sma_signal = self._analyze_sma_crossover(df)
        if sma_signal:
            signals.append(sma_signal)

        vol_signal = self._analyze_volume(df)
        if vol_signal:
            signals.append(vol_signal)

        vwap_signal = self._analyze_vwap(df)
        if vwap_signal:
            signals.append(vwap_signal)

        return signals

    def calculate_all_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """全指標をDataFrameに追加して返す"""
        df = df.copy()
        df = self._add_sma(df)
        df = self._add_ema(df)
        df = self._add_rsi(df)
        df = self._add_macd(df)
        df = self._add_bollinger(df)
        df = self._add_vwap(df)
        df = self._add_volume_indicators(df)
        return df

    # ==================== 指標計算 ====================

    def _add_sma(self, df: pd.DataFrame) -> pd.DataFrame:
        """単純移動平均線"""
        for period in self.sma_periods:
            df[f"SMA_{period}"] = df["Close"].rolling(window=period).mean()
        return df

    def _add_ema(self, df: pd.DataFrame) -> pd.DataFrame:
        """指数移動平均線"""
        for period in self.ema_periods:
            df[f"EMA_{period}"] = df["Close"].ewm(span=period, adjust=False).mean()
        return df

    def _add_rsi(self, df: pd.DataFrame) -> pd.DataFrame:
        """RSI (相対力指数)"""
        delta = df["Close"].diff()
        gain = delta.where(delta > 0, 0.0)
        loss = (-delta).where(delta < 0, 0.0)

        avg_gain = gain.rolling(window=self.rsi_period).mean()
        avg_loss = loss.rolling(window=self.rsi_period).mean()

        rs = avg_gain / avg_loss.replace(0, np.nan)
        df["RSI"] = 100 - (100 / (1 + rs))
        return df

    def _add_macd(self, df: pd.DataFrame) -> pd.DataFrame:
        """MACD"""
        ema_fast = df["Close"].ewm(span=self.macd_fast, adjust=False).mean()
        ema_slow = df["Close"].ewm(span=self.macd_slow, adjust=False).mean()

        df["MACD"] = ema_fast - ema_slow
        df["MACD_Signal"] = df["MACD"].ewm(span=self.macd_signal, adjust=False).mean()
        df["MACD_Hist"] = df["MACD"] - df["MACD_Signal"]
        return df

    def _add_bollinger(self, df: pd.DataFrame) -> pd.DataFrame:
        """ボリンジャーバンド"""
        sma = df["Close"].rolling(window=self.bb_period).mean()
        std = df["Close"].rolling(window=self.bb_period).std()

        df["BB_Upper"] = sma + (std * self.bb_std)
        df["BB_Middle"] = sma
        df["BB_Lower"] = sma - (std * self.bb_std)
        df["BB_Width"] = (df["BB_Upper"] - df["BB_Lower"]) / df["BB_Middle"]
        df["BB_Position"] = (df["Close"] - df["BB_Lower"]) / (
            df["BB_Upper"] - df["BB_Lower"]
        ).replace(0, np.nan)
        return df

    def _add_vwap(self, df: pd.DataFrame) -> pd.DataFrame:
        """VWAP (出来高加重平均価格)"""
        if "Volume" not in df.columns:
            return df

        typical_price = (df["High"] + df["Low"] + df["Close"]) / 3
        cumulative_tp_vol = (typical_price * df["Volume"]).cumsum()
        cumulative_vol = df["Volume"].cumsum()

        df["VWAP"] = cumulative_tp_vol / cumulative_vol.replace(0, np.nan)
        return df

    def _add_volume_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """出来高指標"""
        if "Volume" not in df.columns:
            return df

        df["Volume_SMA"] = df["Volume"].rolling(window=self.vol_sma_period).mean()
        df["Volume_Ratio"] = df["Volume"] / df["Volume_SMA"].replace(0, np.nan)
        return df

    # ==================== シグナル分析 ====================

    def _analyze_rsi(self, df: pd.DataFrame) -> Optional[TechnicalSignal]:
        """RSI分析"""
        df = self._add_rsi(df.copy())
        rsi = df["RSI"].iloc[-1]

        if pd.isna(rsi):
            return None

        if rsi <= self.rsi_oversold:
            strength = min((self.rsi_oversold - rsi) / self.rsi_oversold, 1.0)
            if rsi <= 20:
                return TechnicalSignal(
                    "RSI", Signal.STRONG_BUY, strength, rsi,
                    f"RSI={rsi:.1f}: 極端な売られすぎ"
                )
            return TechnicalSignal(
                "RSI", Signal.BUY, strength, rsi,
                f"RSI={rsi:.1f}: 売られすぎゾーン"
            )
        elif rsi >= self.rsi_overbought:
            strength = min((rsi - self.rsi_overbought) / (100 - self.rsi_overbought), 1.0)
            if rsi >= 80:
                return TechnicalSignal(
                    "RSI", Signal.STRONG_SELL, strength, rsi,
                    f"RSI={rsi:.1f}: 極端な買われすぎ"
                )
            return TechnicalSignal(
                "RSI", Signal.SELL, strength, rsi,
                f"RSI={rsi:.1f}: 買われすぎゾーン"
            )
        else:
            return TechnicalSignal(
                "RSI", Signal.NEUTRAL, 0.3, rsi,
                f"RSI={rsi:.1f}: 中立ゾーン"
            )

    def _analyze_macd(self, df: pd.DataFrame) -> Optional[TechnicalSignal]:
        """MACD分析"""
        df = self._add_macd(df.copy())

        if len(df) < 2:
            return None

        macd = df["MACD"].iloc[-1]
        signal = df["MACD_Signal"].iloc[-1]
        hist = df["MACD_Hist"].iloc[-1]
        prev_hist = df["MACD_Hist"].iloc[-2]

        if pd.isna(macd) or pd.isna(prev_hist):
            return None

        # ゴールデンクロス / デッドクロス検出
        if prev_hist <= 0 and hist > 0:
            strength = min(abs(hist) / (abs(macd) + 1e-10), 1.0)
            return TechnicalSignal(
                "MACD", Signal.BUY, max(strength, 0.7), hist,
                f"MACDゴールデンクロス (MACD={macd:.2f})"
            )
        elif prev_hist >= 0 and hist < 0:
            strength = min(abs(hist) / (abs(macd) + 1e-10), 1.0)
            return TechnicalSignal(
                "MACD", Signal.SELL, max(strength, 0.7), hist,
                f"MACDデッドクロス (MACD={macd:.2f})"
            )
        elif hist > 0:
            return TechnicalSignal(
                "MACD", Signal.BUY, 0.4, hist,
                f"MACD強気圏 (ヒストグラム={hist:.2f})"
            )
        else:
            return TechnicalSignal(
                "MACD", Signal.SELL, 0.4, hist,
                f"MACD弱気圏 (ヒストグラム={hist:.2f})"
            )

    def _analyze_bollinger(self, df: pd.DataFrame) -> Optional[TechnicalSignal]:
        """ボリンジャーバンド分析"""
        df = self._add_bollinger(df.copy())

        close = df["Close"].iloc[-1]
        upper = df["BB_Upper"].iloc[-1]
        lower = df["BB_Lower"].iloc[-1]
        position = df["BB_Position"].iloc[-1]

        if pd.isna(position):
            return None

        if close <= lower:
            strength = min(abs(position), 1.0)
            return TechnicalSignal(
                "Bollinger", Signal.BUY, max(strength, 0.6), position,
                f"下限バンド接触 (位置={position:.2f})"
            )
        elif close >= upper:
            strength = min(abs(position - 1), 1.0)
            return TechnicalSignal(
                "Bollinger", Signal.SELL, max(strength, 0.6), position,
                f"上限バンド接触 (位置={position:.2f})"
            )
        elif position < 0.2:
            return TechnicalSignal(
                "Bollinger", Signal.BUY, 0.4, position,
                f"下限バンド付近 (位置={position:.2f})"
            )
        elif position > 0.8:
            return TechnicalSignal(
                "Bollinger", Signal.SELL, 0.4, position,
                f"上限バンド付近 (位置={position:.2f})"
            )
        else:
            return TechnicalSignal(
                "Bollinger", Signal.NEUTRAL, 0.2, position,
                f"バンド中間 (位置={position:.2f})"
            )

    def _analyze_sma_crossover(self, df: pd.DataFrame) -> Optional[TechnicalSignal]:
        """移動平均線クロスオーバー分析"""
        if len(self.sma_periods) < 2:
            return None

        df = self._add_sma(df.copy())
        short_period = self.sma_periods[0]
        long_period = self.sma_periods[1]

        short_col = f"SMA_{short_period}"
        long_col = f"SMA_{long_period}"

        if len(df) < 2 or pd.isna(df[short_col].iloc[-1]) or pd.isna(df[long_col].iloc[-1]):
            return None

        curr_short = df[short_col].iloc[-1]
        curr_long = df[long_col].iloc[-1]
        prev_short = df[short_col].iloc[-2]
        prev_long = df[long_col].iloc[-2]

        if pd.isna(prev_short) or pd.isna(prev_long):
            return None

        # ゴールデンクロス
        if prev_short <= prev_long and curr_short > curr_long:
            return TechnicalSignal(
                "SMA_Cross", Signal.BUY, 0.8, curr_short - curr_long,
                f"SMAゴールデンクロス ({short_period}日線が{long_period}日線を上抜け)"
            )
        # デッドクロス
        elif prev_short >= prev_long and curr_short < curr_long:
            return TechnicalSignal(
                "SMA_Cross", Signal.SELL, 0.8, curr_short - curr_long,
                f"SMAデッドクロス ({short_period}日線が{long_period}日線を下抜け)"
            )
        elif curr_short > curr_long:
            diff_pct = (curr_short - curr_long) / curr_long * 100
            return TechnicalSignal(
                "SMA_Cross", Signal.BUY, 0.3, diff_pct,
                f"短期線が長期線の上方 (乖離{diff_pct:.2f}%)"
            )
        else:
            diff_pct = (curr_short - curr_long) / curr_long * 100
            return TechnicalSignal(
                "SMA_Cross", Signal.SELL, 0.3, diff_pct,
                f"短期線が長期線の下方 (乖離{diff_pct:.2f}%)"
            )

    def _analyze_volume(self, df: pd.DataFrame) -> Optional[TechnicalSignal]:
        """出来高分析"""
        df = self._add_volume_indicators(df.copy())

        if "Volume_Ratio" not in df.columns:
            return None

        vol_ratio = df["Volume_Ratio"].iloc[-1]
        if pd.isna(vol_ratio):
            return None

        close_change = 0
        if len(df) >= 2:
            close_change = (df["Close"].iloc[-1] - df["Close"].iloc[-2]) / df["Close"].iloc[-2] * 100

        if vol_ratio >= self.vol_spike_threshold:
            if close_change > 0:
                return TechnicalSignal(
                    "Volume", Signal.BUY, min(vol_ratio / 3, 1.0), vol_ratio,
                    f"出来高急増+上昇 (通常の{vol_ratio:.1f}倍, 変動{close_change:+.2f}%)"
                )
            elif close_change < 0:
                return TechnicalSignal(
                    "Volume", Signal.SELL, min(vol_ratio / 3, 1.0), vol_ratio,
                    f"出来高急増+下落 (通常の{vol_ratio:.1f}倍, 変動{close_change:+.2f}%)"
                )

        return TechnicalSignal(
            "Volume", Signal.NEUTRAL, 0.1, vol_ratio,
            f"出来高通常 (通常の{vol_ratio:.1f}倍)"
        )

    def _analyze_vwap(self, df: pd.DataFrame) -> Optional[TechnicalSignal]:
        """VWAP分析"""
        df = self._add_vwap(df.copy())

        if "VWAP" not in df.columns:
            return None

        vwap = df["VWAP"].iloc[-1]
        close = df["Close"].iloc[-1]

        if pd.isna(vwap):
            return None

        deviation = (close - vwap) / vwap * 100

        if deviation > 1.0:
            return TechnicalSignal(
                "VWAP", Signal.SELL, min(abs(deviation) / 3, 1.0), deviation,
                f"VWAP上方乖離 ({deviation:+.2f}%)"
            )
        elif deviation < -1.0:
            return TechnicalSignal(
                "VWAP", Signal.BUY, min(abs(deviation) / 3, 1.0), deviation,
                f"VWAP下方乖離 ({deviation:+.2f}%)"
            )
        else:
            return TechnicalSignal(
                "VWAP", Signal.NEUTRAL, 0.1, deviation,
                f"VWAP付近 ({deviation:+.2f}%)"
            )

    def get_composite_signal(self, signals: list[TechnicalSignal]) -> tuple[Signal, float]:
        """複数シグナルを統合して最終判断を出す

        Returns:
            tuple: (最終シグナル, 信頼度 0.0-1.0)
        """
        if not signals:
            return Signal.NEUTRAL, 0.0

        buy_score = 0.0
        sell_score = 0.0

        for s in signals:
            if s.signal in (Signal.STRONG_BUY, Signal.BUY):
                weight = 1.5 if s.signal == Signal.STRONG_BUY else 1.0
                buy_score += s.strength * weight
            elif s.signal in (Signal.STRONG_SELL, Signal.SELL):
                weight = 1.5 if s.signal == Signal.STRONG_SELL else 1.0
                sell_score += s.strength * weight

        total = buy_score + sell_score
        if total == 0:
            return Signal.NEUTRAL, 0.0

        if buy_score > sell_score:
            confidence = buy_score / (len(signals) * 1.5)
            if confidence > 0.7:
                return Signal.STRONG_BUY, min(confidence, 1.0)
            return Signal.BUY, min(confidence, 1.0)
        elif sell_score > buy_score:
            confidence = sell_score / (len(signals) * 1.5)
            if confidence > 0.7:
                return Signal.STRONG_SELL, min(confidence, 1.0)
            return Signal.SELL, min(confidence, 1.0)
        else:
            return Signal.NEUTRAL, 0.0
