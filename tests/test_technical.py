"""テクニカル分析のユニットテスト"""

import numpy as np
import pandas as pd
import pytest

from src.analysis.technical import Signal, TechnicalAnalyzer, TechnicalSignal


@pytest.fixture
def config():
    return {
        "technical_analysis": {
            "sma_periods": [5, 25, 75],
            "ema_periods": [12, 26],
            "rsi_period": 14,
            "rsi_overbought": 70,
            "rsi_oversold": 30,
            "macd_fast": 12,
            "macd_slow": 26,
            "macd_signal": 9,
            "bollinger_period": 20,
            "bollinger_std": 2,
            "volume_sma_period": 20,
            "volume_spike_threshold": 2.0,
        }
    }


@pytest.fixture
def analyzer(config):
    return TechnicalAnalyzer(config)


@pytest.fixture
def sample_df():
    """100日分のサンプルOHLCVデータ"""
    np.random.seed(42)
    n = 100
    dates = pd.date_range("2025-01-01", periods=n, freq="B")

    # トレンドを持つ価格データ
    base = 1000
    trend = np.linspace(0, 100, n)
    noise = np.random.randn(n) * 10
    close = base + trend + noise

    df = pd.DataFrame(
        {
            "Open": close - np.random.rand(n) * 5,
            "High": close + np.random.rand(n) * 10,
            "Low": close - np.random.rand(n) * 10,
            "Close": close,
            "Volume": np.random.randint(100000, 1000000, n),
        },
        index=dates,
    )
    return df


class TestTechnicalAnalyzer:
    def test_calculate_all_indicators(self, analyzer, sample_df):
        """全指標が正しく追加されるか"""
        result = analyzer.calculate_all_indicators(sample_df)

        assert "SMA_5" in result.columns
        assert "SMA_25" in result.columns
        assert "EMA_12" in result.columns
        assert "RSI" in result.columns
        assert "MACD" in result.columns
        assert "MACD_Signal" in result.columns
        assert "MACD_Hist" in result.columns
        assert "BB_Upper" in result.columns
        assert "BB_Lower" in result.columns
        assert "VWAP" in result.columns
        assert "Volume_SMA" in result.columns

    def test_rsi_range(self, analyzer, sample_df):
        """RSIが0-100の範囲に収まるか"""
        df = analyzer._add_rsi(sample_df.copy())
        rsi_values = df["RSI"].dropna()

        assert all(0 <= v <= 100 for v in rsi_values)

    def test_bollinger_bands_order(self, analyzer, sample_df):
        """ボリンジャーバンドの上限 > 中間 > 下限であるか"""
        df = analyzer._add_bollinger(sample_df.copy())
        valid = df.dropna(subset=["BB_Upper", "BB_Middle", "BB_Lower"])

        assert all(valid["BB_Upper"] >= valid["BB_Middle"])
        assert all(valid["BB_Middle"] >= valid["BB_Lower"])

    def test_analyze_returns_signals(self, analyzer, sample_df):
        """analyze()がシグナルリストを返すか"""
        signals = analyzer.analyze(sample_df)

        assert isinstance(signals, list)
        assert len(signals) > 0
        assert all(isinstance(s, TechnicalSignal) for s in signals)

    def test_analyze_insufficient_data(self, analyzer):
        """データ不足時に空リストを返すか"""
        short_df = pd.DataFrame(
            {"Close": [100, 101, 102], "Volume": [1000, 1000, 1000]},
            index=pd.date_range("2025-01-01", periods=3),
        )
        signals = analyzer.analyze(short_df)
        assert signals == []

    def test_composite_signal_buy(self, analyzer):
        """買いシグナルの統合判断"""
        signals = [
            TechnicalSignal("RSI", Signal.BUY, 0.8, 25, "RSI低"),
            TechnicalSignal("MACD", Signal.BUY, 0.7, 0.5, "MACDクロス"),
            TechnicalSignal("BB", Signal.NEUTRAL, 0.3, 0.5, "中立"),
        ]
        signal, confidence = analyzer.get_composite_signal(signals)

        assert signal in (Signal.BUY, Signal.STRONG_BUY)
        assert confidence > 0

    def test_composite_signal_sell(self, analyzer):
        """売りシグナルの統合判断"""
        signals = [
            TechnicalSignal("RSI", Signal.SELL, 0.8, 80, "RSI高"),
            TechnicalSignal("MACD", Signal.STRONG_SELL, 0.9, -0.5, "MACDクロス"),
            TechnicalSignal("BB", Signal.SELL, 0.6, 0.9, "上限"),
        ]
        signal, confidence = analyzer.get_composite_signal(signals)

        assert signal in (Signal.SELL, Signal.STRONG_SELL)
        assert confidence > 0

    def test_composite_signal_neutral(self, analyzer):
        """中立シグナルの統合判断"""
        signals = [
            TechnicalSignal("RSI", Signal.NEUTRAL, 0.3, 50, "中立"),
            TechnicalSignal("MACD", Signal.NEUTRAL, 0.2, 0, "中立"),
        ]
        signal, confidence = analyzer.get_composite_signal(signals)

        assert signal == Signal.NEUTRAL

    def test_composite_signal_empty(self, analyzer):
        """空シグナルリスト"""
        signal, confidence = analyzer.get_composite_signal([])
        assert signal == Signal.NEUTRAL
        assert confidence == 0.0
