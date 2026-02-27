"""リスク管理モジュール

ポジション管理、損切り、ポートフォリオリスク監視を行う。
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional

logger = logging.getLogger(__name__)


class OrderSide(Enum):
    BUY = "buy"
    SELL = "sell"


class PositionStatus(Enum):
    OPEN = "open"
    CLOSED = "closed"
    STOPPED_OUT = "stopped_out"


@dataclass
class Position:
    """ポジション情報"""
    symbol: str
    side: OrderSide
    entry_price: float
    quantity: int
    entry_time: datetime
    stop_loss: float
    take_profit: float
    trailing_stop: Optional[float] = None
    highest_price: float = 0.0
    lowest_price: float = float("inf")
    status: PositionStatus = PositionStatus.OPEN
    exit_price: Optional[float] = None
    exit_time: Optional[datetime] = None
    pnl: float = 0.0

    @property
    def market_value(self) -> float:
        return self.entry_price * self.quantity

    def unrealized_pnl(self, current_price: float) -> float:
        if self.side == OrderSide.BUY:
            return (current_price - self.entry_price) * self.quantity
        else:
            return (self.entry_price - current_price) * self.quantity

    def unrealized_pnl_percent(self, current_price: float) -> float:
        return (self.unrealized_pnl(current_price) / self.market_value) * 100


@dataclass
class RiskAlert:
    """リスクアラート"""
    level: str  # "warning", "danger", "critical"
    message: str
    symbol: Optional[str]
    timestamp: datetime = field(default_factory=datetime.now)


class RiskManager:
    """リスク管理エンジン"""

    def __init__(self, config: dict):
        risk_config = config.get("risk_management", {})
        self.max_portfolio_loss = risk_config.get("max_portfolio_loss", 5.0)
        self.max_single_loss = risk_config.get("max_single_loss", 2.0)
        self.max_position_ratio = risk_config.get("max_position_ratio", 20.0)
        self.stop_loss_pct = risk_config.get("stop_loss_percent", 3.0)
        self.trailing_stop_pct = risk_config.get("trailing_stop_percent", 2.0)
        self.take_profit_pct = risk_config.get("take_profit_percent", 5.0)
        self.max_positions = risk_config.get("max_positions", 5)
        self.max_daily_trades = risk_config.get("max_daily_trades", 20)
        self.volatility_threshold = risk_config.get("volatility_alert_threshold", 1.5)
        self.max_drawdown = risk_config.get("max_drawdown", 8.0)
        self.initial_capital = risk_config.get("initial_capital", 1000000)

        self.positions: dict[str, Position] = {}
        self.closed_positions: list[Position] = []
        self.daily_trade_count: int = 0
        self.peak_portfolio_value: float = self.initial_capital
        self.alerts: list[RiskAlert] = []

    # ==================== ポジション管理 ====================

    def can_open_position(self, symbol: str, price: float, quantity: int) -> tuple[bool, str]:
        """新規ポジションを開けるか判定"""
        # 最大ポジション数チェック
        open_count = sum(1 for p in self.positions.values() if p.status == PositionStatus.OPEN)
        if open_count >= self.max_positions:
            return False, f"最大ポジション数({self.max_positions})に到達"

        # 日次取引回数チェック
        if self.daily_trade_count >= self.max_daily_trades:
            return False, f"日次最大取引回数({self.max_daily_trades})に到達"

        # 同一銘柄の重複ポジションチェック
        if symbol in self.positions and self.positions[symbol].status == PositionStatus.OPEN:
            return False, f"{symbol}は既にポジションを保有中"

        # 投資比率チェック
        position_value = price * quantity
        portfolio_value = self._calculate_portfolio_value({})
        ratio = (position_value / portfolio_value) * 100
        if ratio > self.max_position_ratio:
            return False, f"投資比率({ratio:.1f}%)が上限({self.max_position_ratio}%)を超過"

        # ドローダウンチェック
        drawdown = self._calculate_drawdown(portfolio_value)
        if drawdown >= self.max_drawdown:
            return False, f"最大ドローダウン({drawdown:.1f}%)に到達。新規取引停止"

        return True, "OK"

    def open_position(
        self, symbol: str, side: OrderSide, price: float, quantity: int
    ) -> Optional[Position]:
        """ポジションを開く"""
        can_open, reason = self.can_open_position(symbol, price, quantity)
        if not can_open:
            logger.warning(f"ポジション開設不可 [{symbol}]: {reason}")
            return None

        # ストップロス・テイクプロフィットを自動設定
        if side == OrderSide.BUY:
            stop_loss = price * (1 - self.stop_loss_pct / 100)
            take_profit = price * (1 + self.take_profit_pct / 100)
        else:
            stop_loss = price * (1 + self.stop_loss_pct / 100)
            take_profit = price * (1 - self.take_profit_pct / 100)

        position = Position(
            symbol=symbol,
            side=side,
            entry_price=price,
            quantity=quantity,
            entry_time=datetime.now(),
            stop_loss=stop_loss,
            take_profit=take_profit,
            trailing_stop=price * (1 - self.trailing_stop_pct / 100) if side == OrderSide.BUY
                else price * (1 + self.trailing_stop_pct / 100),
            highest_price=price,
            lowest_price=price,
        )

        self.positions[symbol] = position
        self.daily_trade_count += 1

        logger.info(
            f"ポジション開設 [{symbol}]: {side.value} {quantity}株 @ ¥{price:,.0f} "
            f"(SL: ¥{stop_loss:,.0f}, TP: ¥{take_profit:,.0f})"
        )
        return position

    def close_position(self, symbol: str, price: float, reason: str = "") -> Optional[Position]:
        """ポジションを閉じる"""
        if symbol not in self.positions:
            return None

        position = self.positions[symbol]
        if position.status != PositionStatus.OPEN:
            return None

        position.exit_price = price
        position.exit_time = datetime.now()
        position.pnl = position.unrealized_pnl(price)
        position.status = PositionStatus.CLOSED

        self.closed_positions.append(position)
        del self.positions[symbol]
        self.daily_trade_count += 1

        logger.info(
            f"ポジション決済 [{symbol}]: @ ¥{price:,.0f} "
            f"(損益: ¥{position.pnl:+,.0f}, 理由: {reason})"
        )
        return position

    # ==================== リアルタイム監視 ====================

    def check_position_risks(self, current_prices: dict[str, float]) -> list[RiskAlert]:
        """全ポジションのリスクをチェック"""
        alerts = []

        for symbol, position in list(self.positions.items()):
            if position.status != PositionStatus.OPEN:
                continue

            price = current_prices.get(symbol)
            if price is None:
                continue

            # 高値・安値更新
            position.highest_price = max(position.highest_price, price)
            position.lowest_price = min(position.lowest_price, price)

            # トレーリングストップ更新
            if position.side == OrderSide.BUY:
                new_trailing = position.highest_price * (1 - self.trailing_stop_pct / 100)
                if position.trailing_stop is None or new_trailing > position.trailing_stop:
                    position.trailing_stop = new_trailing

            # ストップロスチェック
            stop_alert = self._check_stop_loss(symbol, position, price)
            if stop_alert:
                alerts.append(stop_alert)

            # テイクプロフィットチェック
            tp_alert = self._check_take_profit(symbol, position, price)
            if tp_alert:
                alerts.append(tp_alert)

            # トレーリングストップチェック
            ts_alert = self._check_trailing_stop(symbol, position, price)
            if ts_alert:
                alerts.append(ts_alert)

            # 個別損失チェック
            pnl_pct = position.unrealized_pnl_percent(price)
            if abs(pnl_pct) >= self.max_single_loss * 0.8:
                alerts.append(RiskAlert(
                    level="warning",
                    message=f"[{symbol}] 損益が警告水準: {pnl_pct:+.2f}%",
                    symbol=symbol,
                ))

        # ポートフォリオ全体のチェック
        portfolio_alerts = self._check_portfolio_risk(current_prices)
        alerts.extend(portfolio_alerts)

        self.alerts.extend(alerts)
        return alerts

    def check_price_volatility(
        self, symbol: str, current_price: float, previous_price: float
    ) -> Optional[RiskAlert]:
        """価格の急変動を検知"""
        if previous_price <= 0:
            return None

        change_pct = abs((current_price - previous_price) / previous_price * 100)

        if change_pct >= self.volatility_threshold:
            direction = "上昇" if current_price > previous_price else "下落"
            level = "critical" if change_pct >= self.volatility_threshold * 2 else "danger"

            alert = RiskAlert(
                level=level,
                message=(
                    f"[{symbol}] 急変動検知: {change_pct:.2f}% {direction} "
                    f"(¥{previous_price:,.0f} → ¥{current_price:,.0f})"
                ),
                symbol=symbol,
            )
            self.alerts.append(alert)
            return alert

        return None

    # ==================== 内部チェック ====================

    def _check_stop_loss(
        self, symbol: str, position: Position, price: float
    ) -> Optional[RiskAlert]:
        """ストップロスチェック"""
        triggered = False
        if position.side == OrderSide.BUY and price <= position.stop_loss:
            triggered = True
        elif position.side == OrderSide.SELL and price >= position.stop_loss:
            triggered = True

        if triggered:
            self.close_position(symbol, price, reason="ストップロス")
            return RiskAlert(
                level="critical",
                message=(
                    f"[{symbol}] ストップロス発動 @ ¥{price:,.0f} "
                    f"(設定: ¥{position.stop_loss:,.0f})"
                ),
                symbol=symbol,
            )
        return None

    def _check_take_profit(
        self, symbol: str, position: Position, price: float
    ) -> Optional[RiskAlert]:
        """テイクプロフィットチェック"""
        triggered = False
        if position.side == OrderSide.BUY and price >= position.take_profit:
            triggered = True
        elif position.side == OrderSide.SELL and price <= position.take_profit:
            triggered = True

        if triggered:
            self.close_position(symbol, price, reason="利確")
            return RiskAlert(
                level="warning",
                message=(
                    f"[{symbol}] 利確達成 @ ¥{price:,.0f} "
                    f"(目標: ¥{position.take_profit:,.0f})"
                ),
                symbol=symbol,
            )
        return None

    def _check_trailing_stop(
        self, symbol: str, position: Position, price: float
    ) -> Optional[RiskAlert]:
        """トレーリングストップチェック"""
        if position.trailing_stop is None:
            return None

        triggered = False
        if position.side == OrderSide.BUY and price <= position.trailing_stop:
            triggered = True

        if triggered:
            pnl = position.unrealized_pnl(price)
            self.close_position(symbol, price, reason="トレーリングストップ")
            return RiskAlert(
                level="danger",
                message=(
                    f"[{symbol}] トレーリングストップ発動 @ ¥{price:,.0f} "
                    f"(高値: ¥{position.highest_price:,.0f}, 損益: ¥{pnl:+,.0f})"
                ),
                symbol=symbol,
            )
        return None

    def _check_portfolio_risk(self, current_prices: dict[str, float]) -> list[RiskAlert]:
        """ポートフォリオ全体のリスクチェック"""
        alerts = []
        portfolio_value = self._calculate_portfolio_value(current_prices)

        # ピーク値更新
        self.peak_portfolio_value = max(self.peak_portfolio_value, portfolio_value)

        # ドローダウンチェック
        drawdown = self._calculate_drawdown(portfolio_value)
        if drawdown >= self.max_drawdown:
            alerts.append(RiskAlert(
                level="critical",
                message=(
                    f"最大ドローダウン到達: {drawdown:.2f}% "
                    f"(上限: {self.max_drawdown}%). 全ポジション決済を推奨"
                ),
                symbol=None,
            ))
        elif drawdown >= self.max_drawdown * 0.7:
            alerts.append(RiskAlert(
                level="danger",
                message=f"ドローダウン警告: {drawdown:.2f}% (上限: {self.max_drawdown}%)",
                symbol=None,
            ))

        # 総損失チェック
        total_pnl_pct = ((portfolio_value - self.initial_capital) / self.initial_capital) * 100
        if total_pnl_pct <= -self.max_portfolio_loss:
            alerts.append(RiskAlert(
                level="critical",
                message=(
                    f"ポートフォリオ最大損失到達: {total_pnl_pct:.2f}% "
                    f"(上限: -{self.max_portfolio_loss}%)"
                ),
                symbol=None,
            ))

        return alerts

    def _calculate_portfolio_value(self, current_prices: dict[str, float]) -> float:
        """現在のポートフォリオ価値を計算"""
        cash = self.initial_capital - sum(
            p.market_value for p in self.positions.values()
            if p.status == PositionStatus.OPEN
        )
        positions_value = sum(
            p.quantity * current_prices.get(p.symbol, p.entry_price)
            for p in self.positions.values()
            if p.status == PositionStatus.OPEN
        )
        realized_pnl = sum(p.pnl for p in self.closed_positions)

        return cash + positions_value + realized_pnl

    def _calculate_drawdown(self, current_value: float) -> float:
        """現在のドローダウンを計算 (%)"""
        if self.peak_portfolio_value <= 0:
            return 0.0
        return ((self.peak_portfolio_value - current_value) / self.peak_portfolio_value) * 100

    # ==================== ポジションサイジング ====================

    def calculate_position_size(
        self, price: float, portfolio_value: float = None
    ) -> int:
        """適切なポジションサイズを計算

        ケリー基準をベースにした保守的なサイジング
        """
        if portfolio_value is None:
            portfolio_value = self.initial_capital

        # 最大投資額 = ポートフォリオ × 最大比率
        max_investment = portfolio_value * (self.max_position_ratio / 100)

        # リスクベースのサイジング
        # 1取引のリスク = ポートフォリオの max_single_loss%
        risk_amount = portfolio_value * (self.max_single_loss / 100)
        # ストップロスまでの距離
        stop_distance = price * (self.stop_loss_pct / 100)

        if stop_distance > 0:
            risk_based_quantity = int(risk_amount / stop_distance)
        else:
            risk_based_quantity = 0

        # 投資額ベースのサイジング
        value_based_quantity = int(max_investment / price) if price > 0 else 0

        # より保守的な方を採用
        quantity = min(risk_based_quantity, value_based_quantity)

        # 日本株は100株単位
        quantity = max((quantity // 100) * 100, 100)

        return quantity

    # ==================== レポート ====================

    def get_portfolio_summary(self, current_prices: dict[str, float] = None) -> str:
        """ポートフォリオサマリーを生成"""
        if current_prices is None:
            current_prices = {}

        lines = ["=== ポートフォリオサマリー ==="]
        portfolio_value = self._calculate_portfolio_value(current_prices)
        total_pnl = portfolio_value - self.initial_capital
        total_pnl_pct = (total_pnl / self.initial_capital) * 100

        lines.append(f"初期資金:       ¥{self.initial_capital:,.0f}")
        lines.append(f"ポートフォリオ: ¥{portfolio_value:,.0f}")
        lines.append(f"総損益:         ¥{total_pnl:+,.0f} ({total_pnl_pct:+.2f}%)")
        lines.append(f"ドローダウン:   {self._calculate_drawdown(portfolio_value):.2f}%")
        lines.append(f"本日取引回数:   {self.daily_trade_count}")

        if self.positions:
            lines.append("\n--- 保有ポジション ---")
            for symbol, pos in self.positions.items():
                price = current_prices.get(symbol, pos.entry_price)
                pnl = pos.unrealized_pnl(price)
                pnl_pct = pos.unrealized_pnl_percent(price)
                lines.append(
                    f"  {symbol}: {pos.quantity}株 @ ¥{pos.entry_price:,.0f} "
                    f"→ ¥{price:,.0f} (損益: ¥{pnl:+,.0f} / {pnl_pct:+.2f}%)"
                )

        return "\n".join(lines)

    def reset_daily_counters(self) -> None:
        """日次カウンターをリセット"""
        self.daily_trade_count = 0
        logger.info("日次カウンターをリセット")
