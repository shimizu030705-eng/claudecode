"""リスク管理のユニットテスト"""

from datetime import datetime

import pytest

from src.risk.manager import OrderSide, Position, PositionStatus, RiskManager


@pytest.fixture
def config():
    return {
        "risk_management": {
            "max_portfolio_loss": 5.0,
            "max_single_loss": 2.0,
            "max_position_ratio": 20.0,
            "stop_loss_percent": 3.0,
            "trailing_stop_percent": 2.0,
            "take_profit_percent": 5.0,
            "max_positions": 3,
            "max_daily_trades": 10,
            "volatility_alert_threshold": 1.5,
            "max_drawdown": 8.0,
            "initial_capital": 1000000,
        }
    }


@pytest.fixture
def risk_manager(config):
    return RiskManager(config)


class TestPosition:
    def test_market_value(self):
        pos = Position(
            symbol="TEST.T",
            side=OrderSide.BUY,
            entry_price=1000,
            quantity=100,
            entry_time=datetime.now(),
            stop_loss=970,
            take_profit=1050,
        )
        assert pos.market_value == 100000

    def test_unrealized_pnl_profit(self):
        pos = Position(
            symbol="TEST.T",
            side=OrderSide.BUY,
            entry_price=1000,
            quantity=100,
            entry_time=datetime.now(),
            stop_loss=970,
            take_profit=1050,
        )
        assert pos.unrealized_pnl(1050) == 5000

    def test_unrealized_pnl_loss(self):
        pos = Position(
            symbol="TEST.T",
            side=OrderSide.BUY,
            entry_price=1000,
            quantity=100,
            entry_time=datetime.now(),
            stop_loss=970,
            take_profit=1050,
        )
        assert pos.unrealized_pnl(950) == -5000


class TestRiskManager:
    def test_open_position(self, risk_manager):
        """ポジション開設"""
        pos = risk_manager.open_position("TEST.T", OrderSide.BUY, 1000, 100)

        assert pos is not None
        assert pos.symbol == "TEST.T"
        assert pos.entry_price == 1000
        assert pos.stop_loss == 970  # 3% below
        assert pos.take_profit == 1050  # 5% above

    def test_max_positions_limit(self, risk_manager):
        """最大ポジション数の制限"""
        # Use small position sizes that fit within the 20% position ratio limit
        risk_manager.open_position("A.T", OrderSide.BUY, 500, 100)
        risk_manager.open_position("B.T", OrderSide.BUY, 500, 100)
        risk_manager.open_position("C.T", OrderSide.BUY, 500, 100)

        # 4つ目は拒否される (max_positions=3)
        can_open, reason = risk_manager.can_open_position("D.T", 500, 100)
        assert not can_open
        assert "最大ポジション数" in reason

    def test_duplicate_position_blocked(self, risk_manager):
        """同一銘柄の重複ポジション阻止"""
        risk_manager.open_position("TEST.T", OrderSide.BUY, 1000, 100)

        can_open, reason = risk_manager.can_open_position("TEST.T", 1000, 100)
        assert not can_open
        assert "既にポジション" in reason

    def test_close_position(self, risk_manager):
        """ポジション決済"""
        risk_manager.open_position("TEST.T", OrderSide.BUY, 1000, 100)
        pos = risk_manager.close_position("TEST.T", 1050, "利確")

        assert pos is not None
        assert pos.pnl == 5000
        assert pos.status == PositionStatus.CLOSED
        assert "TEST.T" not in risk_manager.positions

    def test_stop_loss_trigger(self, risk_manager):
        """ストップロス発動"""
        risk_manager.open_position("TEST.T", OrderSide.BUY, 1000, 100)

        alerts = risk_manager.check_position_risks({"TEST.T": 960})

        # ストップロスで自動決済
        assert "TEST.T" not in risk_manager.positions
        assert any("ストップロス" in a.message for a in alerts)

    def test_take_profit_trigger(self, risk_manager):
        """テイクプロフィット発動"""
        risk_manager.open_position("TEST.T", OrderSide.BUY, 1000, 100)

        alerts = risk_manager.check_position_risks({"TEST.T": 1060})

        assert "TEST.T" not in risk_manager.positions
        assert any("利確" in a.message for a in alerts)

    def test_volatility_alert(self, risk_manager):
        """急変動アラート"""
        alert = risk_manager.check_price_volatility("TEST.T", 1020, 1000)

        assert alert is not None
        assert "急変動" in alert.message

    def test_no_volatility_alert_small_change(self, risk_manager):
        """小さな変動ではアラートなし"""
        alert = risk_manager.check_price_volatility("TEST.T", 1005, 1000)
        assert alert is None

    def test_position_sizing(self, risk_manager):
        """ポジションサイジング"""
        quantity = risk_manager.calculate_position_size(1000, 1000000)

        assert quantity > 0
        assert quantity % 100 == 0  # 100株単位
        # 投資額が最大比率を超えないこと
        assert quantity * 1000 <= 1000000 * 0.20

    def test_daily_trade_limit(self, risk_manager):
        """日次取引回数制限"""
        risk_manager.daily_trade_count = 10

        can_open, reason = risk_manager.can_open_position("TEST.T", 1000, 100)
        assert not can_open
        assert "取引回数" in reason

    def test_reset_daily_counters(self, risk_manager):
        """日次カウンターリセット"""
        risk_manager.daily_trade_count = 5
        risk_manager.reset_daily_counters()
        assert risk_manager.daily_trade_count == 0

    def test_portfolio_summary(self, risk_manager):
        """ポートフォリオサマリー生成"""
        risk_manager.open_position("TEST.T", OrderSide.BUY, 1000, 100)
        summary = risk_manager.get_portfolio_summary({"TEST.T": 1050})

        assert "ポートフォリオ" in summary
        assert "TEST.T" in summary
