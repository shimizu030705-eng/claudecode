"""トレーディングエンジン

テクニカル・ファンダメンタルズ分析の結果を統合し、
売買判断・注文管理を行うコアエンジン。
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

import pandas as pd

from src.analysis.fundamental import FundamentalAnalyzer, FundamentalScore
from src.analysis.technical import Signal, TechnicalAnalyzer, TechnicalSignal
from src.data.fetcher import StockDataFetcher
from src.notification.notifier import NotificationManager
from src.risk.manager import OrderSide, RiskManager

logger = logging.getLogger(__name__)


@dataclass
class TradeDecision:
    """取引判断の結果"""
    symbol: str
    action: str  # "buy", "sell", "hold"
    confidence: float  # 0.0 - 1.0
    quantity: int
    price: float
    technical_signals: list[TechnicalSignal]
    fundamental_score: Optional[FundamentalScore]
    reasons: list[str]
    timestamp: datetime


class TradingEngine:
    """トレーディングエンジン"""

    def __init__(self, config: dict):
        self.config = config
        self.strategy_config = config.get("trading_strategy", {})
        self.active_strategies = self.strategy_config.get("active_strategies", [])
        self.consensus_threshold = self.strategy_config.get("signal_consensus_threshold", 2)
        self.min_signal_strength = self.strategy_config.get("min_signal_strength", 0.6)

        self.fetcher = StockDataFetcher(config)
        self.technical = TechnicalAnalyzer(config)
        self.fundamental = FundamentalAnalyzer(config)
        self.risk_manager = RiskManager(config)
        self.notifier = NotificationManager(config)

        self.trade_history: list[TradeDecision] = []
        self._fundamental_cache: dict[str, FundamentalScore] = {}

    def evaluate_symbol(self, symbol: str) -> Optional[TradeDecision]:
        """1銘柄を総合評価して取引判断を出す"""
        logger.info(f"銘柄評価開始: {symbol}")

        # テクニカルデータ取得・分析
        df = self.fetcher.fetch_historical(symbol, period="3mo", interval="1d")
        if df is None:
            return None

        tech_signals = self.technical.analyze(df)
        composite_signal, tech_confidence = self.technical.get_composite_signal(tech_signals)

        # ファンダメンタルズ分析 (キャッシュ利用)
        fund_score = self._get_fundamental_score(symbol)

        # 戦略判断
        reasons = []
        action = "hold"
        confidence = 0.0

        # テクニカルシグナル評価
        if composite_signal in (Signal.STRONG_BUY, Signal.BUY):
            buy_signals = sum(
                1 for s in tech_signals
                if s.signal in (Signal.STRONG_BUY, Signal.BUY) and s.strength >= self.min_signal_strength
            )
            if buy_signals >= self.consensus_threshold:
                action = "buy"
                confidence = tech_confidence
                reasons.append(f"テクニカル買いシグナル x{buy_signals} (信頼度: {tech_confidence:.2f})")

        elif composite_signal in (Signal.STRONG_SELL, Signal.SELL):
            sell_signals = sum(
                1 for s in tech_signals
                if s.signal in (Signal.STRONG_SELL, Signal.SELL) and s.strength >= self.min_signal_strength
            )
            if sell_signals >= self.consensus_threshold:
                action = "sell"
                confidence = tech_confidence
                reasons.append(f"テクニカル売りシグナル x{sell_signals} (信頼度: {tech_confidence:.2f})")

        # ファンダメンタルズフィルター
        if fund_score:
            if action == "buy" and not self.fundamental.is_investable(fund_score):
                confidence *= 0.5
                reasons.append(f"ファンダメンタルズ懸念 (グレード: {fund_score.grade})")
            elif action == "buy" and fund_score.grade == "A":
                confidence = min(confidence * 1.2, 1.0)
                reasons.append(f"ファンダメンタルズ優良 (グレード: A)")

        # 信頼度が閾値未満ならhold
        if confidence < self.min_signal_strength:
            action = "hold"
            reasons.append(f"信頼度不足 ({confidence:.2f} < {self.min_signal_strength})")

        # ポジションサイジング
        current_data = self.fetcher.fetch_realtime(symbol)
        price = current_data["price"] if current_data else df["Close"].iloc[-1]
        quantity = self.risk_manager.calculate_position_size(price) if action == "buy" else 0

        # 既存ポジションの売り判断
        if action == "sell" and symbol in self.risk_manager.positions:
            position = self.risk_manager.positions[symbol]
            quantity = position.quantity

        decision = TradeDecision(
            symbol=symbol,
            action=action,
            confidence=confidence,
            quantity=quantity,
            price=price,
            technical_signals=tech_signals,
            fundamental_score=fund_score,
            reasons=reasons,
            timestamp=datetime.now(),
        )

        self.trade_history.append(decision)
        return decision

    def execute_decision(self, decision: TradeDecision) -> bool:
        """取引判断を実行"""
        if decision.action == "hold":
            logger.info(f"[{decision.symbol}] ホールド判断: {', '.join(decision.reasons)}")
            return False

        if decision.action == "buy":
            return self._execute_buy(decision)
        elif decision.action == "sell":
            return self._execute_sell(decision)

        return False

    def _execute_buy(self, decision: TradeDecision) -> bool:
        """買い注文実行"""
        position = self.risk_manager.open_position(
            symbol=decision.symbol,
            side=OrderSide.BUY,
            price=decision.price,
            quantity=decision.quantity,
        )

        if position:
            self.notifier.notify_trade(
                symbol=decision.symbol,
                action="buy",
                price=decision.price,
                quantity=decision.quantity,
            )
            logger.info(
                f"買い注文実行 [{decision.symbol}]: "
                f"{decision.quantity}株 @ ¥{decision.price:,.0f} "
                f"(理由: {', '.join(decision.reasons)})"
            )
            return True
        return False

    def _execute_sell(self, decision: TradeDecision) -> bool:
        """売り注文実行"""
        position = self.risk_manager.close_position(
            symbol=decision.symbol,
            price=decision.price,
            reason=", ".join(decision.reasons),
        )

        if position:
            self.notifier.notify_trade(
                symbol=decision.symbol,
                action="sell",
                price=decision.price,
                quantity=decision.quantity,
                pnl=position.pnl,
            )
            return True
        return False

    def run_scan(self) -> list[TradeDecision]:
        """ウォッチリスト全銘柄をスキャン"""
        decisions = []
        for symbol in self.fetcher.watchlist:
            try:
                decision = self.evaluate_symbol(symbol)
                if decision:
                    decisions.append(decision)
            except Exception as e:
                logger.error(f"スキャンエラー [{symbol}]: {e}")
                self.notifier.notify_system_error(f"スキャンエラー [{symbol}]: {e}")

        return decisions

    def run_monitor(self, current_prices: dict[str, float]) -> list:
        """リアルタイム監視実行"""
        # リスクチェック
        alerts = self.risk_manager.check_position_risks(current_prices)
        for alert in alerts:
            self.notifier.notify_risk_alert(alert)

        return alerts

    def get_daily_summary(self) -> str:
        """日次サマリーを生成"""
        lines = [
            f"=== 日次サマリー ({datetime.now().strftime('%Y-%m-%d')}) ===",
            "",
            self.risk_manager.get_portfolio_summary(),
            "",
            f"--- 本日の取引判断 ---",
            f"評価件数: {len(self.trade_history)}",
        ]

        buy_count = sum(1 for d in self.trade_history if d.action == "buy")
        sell_count = sum(1 for d in self.trade_history if d.action == "sell")
        hold_count = sum(1 for d in self.trade_history if d.action == "hold")

        lines.append(f"  買い: {buy_count}, 売り: {sell_count}, ホールド: {hold_count}")

        # 確定損益
        realized_pnl = sum(p.pnl for p in self.risk_manager.closed_positions)
        lines.append(f"確定損益: ¥{realized_pnl:+,.0f}")

        return "\n".join(lines)

    def _get_fundamental_score(self, symbol: str) -> Optional[FundamentalScore]:
        """ファンダメンタルズスコアを取得 (キャッシュ付き)"""
        if symbol in self._fundamental_cache:
            return self._fundamental_cache[symbol]

        fundamentals = self.fetcher.fetch_fundamentals(symbol)
        if fundamentals:
            score = self.fundamental.analyze(fundamentals)
            if score:
                self._fundamental_cache[symbol] = score
                return score
        return None
