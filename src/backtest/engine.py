"""バックテストエンジン

過去データを使って戦略の有効性を検証する。
"""

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd

from src.analysis.technical import Signal, TechnicalAnalyzer

logger = logging.getLogger(__name__)


@dataclass
class BacktestTrade:
    """バックテスト中の取引記録"""
    entry_date: datetime
    exit_date: Optional[datetime]
    entry_price: float
    exit_price: float
    quantity: int
    side: str  # "buy" or "sell"
    pnl: float = 0.0
    pnl_percent: float = 0.0
    commission: float = 0.0


@dataclass
class BacktestResult:
    """バックテスト結果"""
    symbol: str
    period: str
    initial_capital: float
    final_capital: float
    total_return: float
    total_return_pct: float
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float
    avg_win: float
    avg_loss: float
    profit_factor: float
    max_drawdown: float
    max_drawdown_pct: float
    sharpe_ratio: float
    trades: list[BacktestTrade] = field(default_factory=list)
    equity_curve: list[float] = field(default_factory=list)


class BacktestEngine:
    """バックテストエンジン"""

    def __init__(self, config: dict):
        self.config = config
        self.bt_config = config.get("backtest", {})
        self.commission_rate = self.bt_config.get("commission_rate", 0.1) / 100
        self.slippage = self.bt_config.get("slippage", 0.05) / 100
        self.initial_capital = config.get("risk_management", {}).get("initial_capital", 1000000)

        self.technical = TechnicalAnalyzer(config)

        risk = config.get("risk_management", {})
        self.stop_loss_pct = risk.get("stop_loss_percent", 3.0)
        self.take_profit_pct = risk.get("take_profit_percent", 5.0)
        self.trailing_stop_pct = risk.get("trailing_stop_percent", 2.0)
        self.max_position_ratio = risk.get("max_position_ratio", 20.0)

    def run(self, symbol: str, df: pd.DataFrame) -> Optional[BacktestResult]:
        """バックテスト実行

        Args:
            symbol: ティッカーシンボル
            df: OHLCVデータ (十分な期間が必要)

        Returns:
            BacktestResult: バックテスト結果
        """
        if df is None or len(df) < 50:
            logger.warning(f"データ不足でバックテスト不可 [{symbol}]")
            return None

        logger.info(f"バックテスト開始 [{symbol}]: {len(df)}日分のデータ")

        capital = self.initial_capital
        position = None
        trades: list[BacktestTrade] = []
        equity_curve = [capital]
        peak_capital = capital

        # テクニカル指標を事前計算
        df = self.technical.calculate_all_indicators(df)

        for i in range(50, len(df)):
            window = df.iloc[:i + 1]
            current = df.iloc[i]
            price = current["Close"]

            # ポジション保有中
            if position is not None:
                # 高値更新でトレーリングストップ引き上げ
                if current["High"] > position["highest"]:
                    position["highest"] = current["High"]
                    position["trailing_stop"] = position["highest"] * (1 - self.trailing_stop_pct / 100)

                # 損切り・利確・トレーリングストップチェック
                exit_price = None
                exit_reason = None

                if current["Low"] <= position["stop_loss"]:
                    exit_price = position["stop_loss"] * (1 - self.slippage)
                    exit_reason = "stop_loss"
                elif current["High"] >= position["take_profit"]:
                    exit_price = position["take_profit"] * (1 - self.slippage)
                    exit_reason = "take_profit"
                elif position["trailing_stop"] and current["Low"] <= position["trailing_stop"]:
                    exit_price = position["trailing_stop"] * (1 - self.slippage)
                    exit_reason = "trailing_stop"
                else:
                    # テクニカル売りシグナルチェック
                    signals = self.technical.analyze(window)
                    composite, confidence = self.technical.get_composite_signal(signals)
                    if composite in (Signal.STRONG_SELL, Signal.SELL) and confidence >= 0.6:
                        exit_price = price * (1 - self.slippage)
                        exit_reason = "signal_sell"

                if exit_price:
                    commission = exit_price * position["quantity"] * self.commission_rate
                    pnl = (exit_price - position["entry_price"]) * position["quantity"] - commission - position["commission"]
                    pnl_pct = (pnl / (position["entry_price"] * position["quantity"])) * 100

                    trade = BacktestTrade(
                        entry_date=position["entry_date"],
                        exit_date=current.name,
                        entry_price=position["entry_price"],
                        exit_price=exit_price,
                        quantity=position["quantity"],
                        side="buy",
                        pnl=pnl,
                        pnl_percent=pnl_pct,
                        commission=commission + position["commission"],
                    )
                    trades.append(trade)
                    capital += pnl + position["entry_price"] * position["quantity"]
                    position = None

            # ポジションなし: 買いシグナル探索
            if position is None:
                signals = self.technical.analyze(window)
                composite, confidence = self.technical.get_composite_signal(signals)

                if composite in (Signal.STRONG_BUY, Signal.BUY) and confidence >= 0.6:
                    entry_price = price * (1 + self.slippage)
                    max_investment = capital * (self.max_position_ratio / 100)
                    quantity = int(max_investment / entry_price)
                    quantity = max((quantity // 100) * 100, 100)

                    if entry_price * quantity <= capital:
                        commission = entry_price * quantity * self.commission_rate
                        capital -= entry_price * quantity

                        position = {
                            "entry_price": entry_price,
                            "quantity": quantity,
                            "entry_date": current.name,
                            "stop_loss": entry_price * (1 - self.stop_loss_pct / 100),
                            "take_profit": entry_price * (1 + self.take_profit_pct / 100),
                            "trailing_stop": entry_price * (1 - self.trailing_stop_pct / 100),
                            "highest": entry_price,
                            "commission": commission,
                        }

            # 資産曲線更新
            if position:
                current_value = capital + price * position["quantity"]
            else:
                current_value = capital
            equity_curve.append(current_value)
            peak_capital = max(peak_capital, current_value)

        # 最終ポジションを強制決済
        if position:
            final_price = df.iloc[-1]["Close"]
            commission = final_price * position["quantity"] * self.commission_rate
            pnl = (final_price - position["entry_price"]) * position["quantity"] - commission - position["commission"]

            trade = BacktestTrade(
                entry_date=position["entry_date"],
                exit_date=df.index[-1],
                entry_price=position["entry_price"],
                exit_price=final_price,
                quantity=position["quantity"],
                side="buy",
                pnl=pnl,
                pnl_percent=(pnl / (position["entry_price"] * position["quantity"])) * 100,
                commission=commission + position["commission"],
            )
            trades.append(trade)
            capital += pnl + position["entry_price"] * position["quantity"]

        # 結果集計
        return self._calculate_results(symbol, df, capital, trades, equity_curve)

    def _calculate_results(
        self,
        symbol: str,
        df: pd.DataFrame,
        final_capital: float,
        trades: list[BacktestTrade],
        equity_curve: list[float],
    ) -> BacktestResult:
        """バックテスト結果を集計"""
        total_return = final_capital - self.initial_capital
        total_return_pct = (total_return / self.initial_capital) * 100

        winning = [t for t in trades if t.pnl > 0]
        losing = [t for t in trades if t.pnl <= 0]

        win_rate = len(winning) / len(trades) * 100 if trades else 0
        avg_win = np.mean([t.pnl for t in winning]) if winning else 0
        avg_loss = np.mean([t.pnl for t in losing]) if losing else 0

        gross_profit = sum(t.pnl for t in winning) if winning else 0
        gross_loss = abs(sum(t.pnl for t in losing)) if losing else 0
        profit_factor = gross_profit / gross_loss if gross_loss > 0 else float("inf")

        # 最大ドローダウン
        max_dd, max_dd_pct = self._calculate_max_drawdown(equity_curve)

        # シャープレシオ
        sharpe = self._calculate_sharpe_ratio(equity_curve)

        period_str = f"{df.index[0].date()} ~ {df.index[-1].date()}"

        result = BacktestResult(
            symbol=symbol,
            period=period_str,
            initial_capital=self.initial_capital,
            final_capital=final_capital,
            total_return=total_return,
            total_return_pct=total_return_pct,
            total_trades=len(trades),
            winning_trades=len(winning),
            losing_trades=len(losing),
            win_rate=win_rate,
            avg_win=avg_win,
            avg_loss=avg_loss,
            profit_factor=profit_factor,
            max_drawdown=max_dd,
            max_drawdown_pct=max_dd_pct,
            sharpe_ratio=sharpe,
            trades=trades,
            equity_curve=equity_curve,
        )

        logger.info(
            f"バックテスト完了 [{symbol}]: "
            f"収益率 {total_return_pct:+.2f}%, "
            f"勝率 {win_rate:.1f}%, "
            f"PF {profit_factor:.2f}, "
            f"最大DD {max_dd_pct:.2f}%"
        )

        return result

    @staticmethod
    def _calculate_max_drawdown(equity_curve: list[float]) -> tuple[float, float]:
        """最大ドローダウンを計算"""
        if not equity_curve:
            return 0.0, 0.0

        peak = equity_curve[0]
        max_dd = 0.0
        max_dd_pct = 0.0

        for value in equity_curve:
            peak = max(peak, value)
            dd = peak - value
            dd_pct = (dd / peak) * 100 if peak > 0 else 0

            if dd > max_dd:
                max_dd = dd
                max_dd_pct = dd_pct

        return max_dd, max_dd_pct

    @staticmethod
    def _calculate_sharpe_ratio(equity_curve: list[float], risk_free_rate: float = 0.001) -> float:
        """年率シャープレシオを計算"""
        if len(equity_curve) < 2:
            return 0.0

        returns = pd.Series(equity_curve).pct_change().dropna()

        if returns.std() == 0:
            return 0.0

        daily_rf = risk_free_rate / 252
        excess_returns = returns - daily_rf
        sharpe = (excess_returns.mean() / excess_returns.std()) * np.sqrt(252)

        return sharpe

    def format_result(self, result: BacktestResult) -> str:
        """結果を見やすくフォーマット"""
        lines = [
            f"{'=' * 60}",
            f"  バックテスト結果: {result.symbol}",
            f"  期間: {result.period}",
            f"{'=' * 60}",
            f"",
            f"  初期資金:     ¥{result.initial_capital:>14,.0f}",
            f"  最終資金:     ¥{result.final_capital:>14,.0f}",
            f"  総損益:       ¥{result.total_return:>+14,.0f} ({result.total_return_pct:+.2f}%)",
            f"",
            f"  --- 取引統計 ---",
            f"  総取引回数:   {result.total_trades:>6}",
            f"  勝ち:         {result.winning_trades:>6}",
            f"  負け:         {result.losing_trades:>6}",
            f"  勝率:         {result.win_rate:>6.1f}%",
            f"  平均勝ち:     ¥{result.avg_win:>+14,.0f}",
            f"  平均負け:     ¥{result.avg_loss:>+14,.0f}",
            f"  プロフィットファクター: {result.profit_factor:>6.2f}",
            f"",
            f"  --- リスク指標 ---",
            f"  最大ドローダウン:   ¥{result.max_drawdown:>12,.0f} ({result.max_drawdown_pct:.2f}%)",
            f"  シャープレシオ:     {result.sharpe_ratio:>8.2f}",
            f"{'=' * 60}",
        ]
        return "\n".join(lines)
