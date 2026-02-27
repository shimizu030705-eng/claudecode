"""バックテストエンジンのユニットテスト"""

import numpy as np
import pandas as pd
import pytest

from src.backtest.engine import BacktestEngine


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
        },
        "risk_management": {
            "stop_loss_percent": 3.0,
            "take_profit_percent": 5.0,
            "trailing_stop_percent": 2.0,
            "max_position_ratio": 20.0,
            "initial_capital": 1000000,
        },
        "backtest": {
            "commission_rate": 0.1,
            "slippage": 0.05,
        },
    }


@pytest.fixture
def engine(config):
    return BacktestEngine(config)


@pytest.fixture
def sample_df():
    """100日分のサンプルデータ"""
    np.random.seed(42)
    n = 100
    dates = pd.date_range("2025-01-01", periods=n, freq="B")

    base = 1000
    trend = np.linspace(0, 50, n)
    noise = np.random.randn(n) * 15
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


class TestBacktestEngine:
    def test_run_basic(self, engine, sample_df):
        """基本的なバックテスト実行"""
        result = engine.run("TEST.T", sample_df)

        assert result is not None
        assert result.symbol == "TEST.T"
        assert result.initial_capital == 1000000
        assert result.final_capital > 0
        assert 0 <= result.win_rate <= 100

    def test_run_insufficient_data(self, engine):
        """データ不足時のバックテスト"""
        short_df = pd.DataFrame(
            {
                "Open": [100] * 10,
                "High": [105] * 10,
                "Low": [95] * 10,
                "Close": [100] * 10,
                "Volume": [10000] * 10,
            },
            index=pd.date_range("2025-01-01", periods=10),
        )
        result = engine.run("TEST.T", short_df)
        assert result is None

    def test_max_drawdown_calculation(self, engine):
        """最大ドローダウン計算"""
        curve = [100, 110, 105, 115, 90, 100, 95]
        max_dd, max_dd_pct = engine._calculate_max_drawdown(curve)

        assert max_dd == 25  # 115 - 90
        assert abs(max_dd_pct - (25 / 115) * 100) < 0.01

    def test_max_drawdown_empty(self, engine):
        """空データのドローダウン"""
        max_dd, max_dd_pct = engine._calculate_max_drawdown([])
        assert max_dd == 0.0

    def test_sharpe_ratio_calculation(self, engine):
        """シャープレシオ計算"""
        # 上昇トレンドの資産曲線
        curve = [100 + i * 0.5 for i in range(100)]
        sharpe = engine._calculate_sharpe_ratio(curve)

        assert sharpe > 0  # 上昇トレンドなら正

    def test_format_result(self, engine, sample_df):
        """結果フォーマット"""
        result = engine.run("TEST.T", sample_df)
        if result:
            formatted = engine.format_result(result)
            assert "TEST.T" in formatted
            assert "初期資金" in formatted
            assert "勝率" in formatted

    def test_equity_curve_generated(self, engine, sample_df):
        """資産曲線が生成されるか"""
        result = engine.run("TEST.T", sample_df)
        if result:
            assert len(result.equity_curve) > 0
            assert result.equity_curve[0] == 1000000
