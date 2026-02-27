"""ファンダメンタルズ分析エンジン

企業の財務指標を評価し、投資適格性を判定する。
"""

import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class FundamentalScore:
    """ファンダメンタルズ評価結果"""
    symbol: str
    total_score: float       # 0-100
    valuation_score: float   # バリュエーション評価
    profitability_score: float  # 収益性評価
    growth_score: float      # 成長性評価
    health_score: float      # 財務健全性評価
    grade: str               # A/B/C/D/F
    details: dict
    warnings: list[str]


class FundamentalAnalyzer:
    """ファンダメンタルズ分析エンジン"""

    def __init__(self, config: dict):
        self.criteria = config.get("fundamental_analysis", {}).get("criteria", {})
        self.max_per = self.criteria.get("max_per", 30.0)
        self.min_per = self.criteria.get("min_per", 5.0)
        self.max_pbr = self.criteria.get("max_pbr", 5.0)
        self.min_roe = self.criteria.get("min_roe", 8.0)
        self.min_profit_margin = self.criteria.get("min_profit_margin", 5.0)
        self.max_debt_ratio = self.criteria.get("max_debt_ratio", 60.0)

    def analyze(self, fundamentals: dict) -> Optional[FundamentalScore]:
        """ファンダメンタルズ総合分析"""
        if not fundamentals:
            return None

        symbol = fundamentals.get("symbol", "UNKNOWN")
        warnings = []

        valuation = self._evaluate_valuation(fundamentals, warnings)
        profitability = self._evaluate_profitability(fundamentals, warnings)
        growth = self._evaluate_growth(fundamentals, warnings)
        health = self._evaluate_health(fundamentals, warnings)

        # 加重平均 (バリュエーション30%, 収益性30%, 成長性20%, 健全性20%)
        total = (
            valuation * 0.30
            + profitability * 0.30
            + growth * 0.20
            + health * 0.20
        )

        grade = self._calculate_grade(total)

        return FundamentalScore(
            symbol=symbol,
            total_score=round(total, 1),
            valuation_score=round(valuation, 1),
            profitability_score=round(profitability, 1),
            growth_score=round(growth, 1),
            health_score=round(health, 1),
            grade=grade,
            details={
                "per": fundamentals.get("per"),
                "pbr": fundamentals.get("pbr"),
                "roe": fundamentals.get("roe"),
                "profit_margin": fundamentals.get("profit_margin"),
                "revenue_growth": fundamentals.get("revenue_growth"),
                "debt_to_equity": fundamentals.get("debt_to_equity"),
            },
            warnings=warnings,
        )

    def _evaluate_valuation(self, data: dict, warnings: list) -> float:
        """バリュエーション評価 (0-100)"""
        score = 50.0  # ベーススコア
        factors = 0

        per = data.get("per")
        if per is not None:
            factors += 1
            if per < 0:
                score -= 30
                warnings.append(f"PER が負値 ({per:.1f}): 赤字企業の可能性")
            elif per < self.min_per:
                score += 10
                warnings.append(f"PER が極端に低い ({per:.1f}): バリュートラップの可能性")
            elif per <= 15:
                score += 25  # 割安
            elif per <= self.max_per:
                score += 10  # 適正
            else:
                score -= 20
                warnings.append(f"PER が高い ({per:.1f})")

        pbr = data.get("pbr")
        if pbr is not None:
            factors += 1
            if pbr < 0:
                score -= 20
            elif pbr <= 1.0:
                score += 25  # 割安
            elif pbr <= 2.5:
                score += 10  # 適正
            elif pbr <= self.max_pbr:
                score += 0
            else:
                score -= 15
                warnings.append(f"PBR が高い ({pbr:.1f})")

        psr = data.get("psr")
        if psr is not None:
            factors += 1
            if psr <= 1.0:
                score += 15
            elif psr <= 3.0:
                score += 5
            else:
                score -= 10

        return max(0, min(100, score))

    def _evaluate_profitability(self, data: dict, warnings: list) -> float:
        """収益性評価 (0-100)"""
        score = 50.0
        factors = 0

        roe = data.get("roe")
        if roe is not None:
            factors += 1
            if roe >= 20:
                score += 30
            elif roe >= self.min_roe:
                score += 15
            elif roe >= 0:
                score -= 10
                warnings.append(f"ROE が低い ({roe:.1f}%)")
            else:
                score -= 30
                warnings.append(f"ROE が負値 ({roe:.1f}%)")

        profit_margin = data.get("profit_margin")
        if profit_margin is not None:
            factors += 1
            if profit_margin >= 20:
                score += 25
            elif profit_margin >= self.min_profit_margin:
                score += 10
            elif profit_margin >= 0:
                score -= 10
            else:
                score -= 25
                warnings.append(f"利益率が負 ({profit_margin:.1f}%)")

        operating_margin = data.get("operating_margin")
        if operating_margin is not None:
            factors += 1
            if operating_margin >= 15:
                score += 15
            elif operating_margin >= 5:
                score += 5
            else:
                score -= 10

        return max(0, min(100, score))

    def _evaluate_growth(self, data: dict, warnings: list) -> float:
        """成長性評価 (0-100)"""
        score = 50.0

        revenue_growth = data.get("revenue_growth")
        if revenue_growth is not None:
            if revenue_growth >= 20:
                score += 30
            elif revenue_growth >= 10:
                score += 20
            elif revenue_growth >= 0:
                score += 5
            else:
                score -= 20
                warnings.append(f"売上減収 ({revenue_growth:.1f}%)")

        earnings_growth = data.get("earnings_growth")
        if earnings_growth is not None:
            if earnings_growth >= 20:
                score += 25
            elif earnings_growth >= 10:
                score += 15
            elif earnings_growth >= 0:
                score += 5
            else:
                score -= 20
                warnings.append(f"利益減益 ({earnings_growth:.1f}%)")

        return max(0, min(100, score))

    def _evaluate_health(self, data: dict, warnings: list) -> float:
        """財務健全性評価 (0-100)"""
        score = 50.0

        debt_to_equity = data.get("debt_to_equity")
        if debt_to_equity is not None:
            if debt_to_equity <= 30:
                score += 25
            elif debt_to_equity <= self.max_debt_ratio:
                score += 10
            elif debt_to_equity <= 100:
                score -= 10
            else:
                score -= 25
                warnings.append(f"負債比率が高い ({debt_to_equity:.1f}%)")

        current_ratio = data.get("current_ratio")
        if current_ratio is not None:
            if current_ratio >= 2.0:
                score += 20
            elif current_ratio >= 1.0:
                score += 10
            else:
                score -= 20
                warnings.append(f"流動比率が低い ({current_ratio:.2f})")

        beta = data.get("beta")
        if beta is not None:
            if 0.5 <= beta <= 1.5:
                score += 10
            elif beta > 2.0:
                score -= 15
                warnings.append(f"ベータ値が高い ({beta:.2f}): 高ボラティリティ")

        return max(0, min(100, score))

    @staticmethod
    def _calculate_grade(score: float) -> str:
        """スコアからグレードを算出"""
        if score >= 80:
            return "A"
        elif score >= 65:
            return "B"
        elif score >= 50:
            return "C"
        elif score >= 35:
            return "D"
        else:
            return "F"

    def is_investable(self, score: FundamentalScore) -> bool:
        """投資適格かどうかを判定"""
        return score.grade in ("A", "B") and len(score.warnings) <= 2

    def get_summary(self, score: FundamentalScore) -> str:
        """人間が読みやすいサマリーを生成"""
        lines = [
            f"=== {score.symbol} ファンダメンタルズ分析 ===",
            f"総合スコア: {score.total_score}/100 (グレード: {score.grade})",
            f"  バリュエーション: {score.valuation_score}/100",
            f"  収益性:           {score.profitability_score}/100",
            f"  成長性:           {score.growth_score}/100",
            f"  財務健全性:       {score.health_score}/100",
        ]

        if score.details:
            lines.append("主要指標:")
            for key, value in score.details.items():
                if value is not None:
                    lines.append(f"  {key}: {value}")

        if score.warnings:
            lines.append("警告:")
            for w in score.warnings:
                lines.append(f"  ⚠ {w}")

        investable = self.is_investable(score)
        lines.append(f"投資適格: {'はい' if investable else 'いいえ'}")

        return "\n".join(lines)
