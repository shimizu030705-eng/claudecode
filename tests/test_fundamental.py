"""ファンダメンタルズ分析のユニットテスト"""

import pytest

from src.analysis.fundamental import FundamentalAnalyzer, FundamentalScore


@pytest.fixture
def config():
    return {
        "fundamental_analysis": {
            "criteria": {
                "max_per": 30.0,
                "min_per": 5.0,
                "max_pbr": 5.0,
                "min_roe": 8.0,
                "min_profit_margin": 5.0,
                "max_debt_ratio": 60.0,
            }
        }
    }


@pytest.fixture
def analyzer(config):
    return FundamentalAnalyzer(config)


@pytest.fixture
def excellent_fundamentals():
    """優良銘柄のファンダメンタルズ"""
    return {
        "symbol": "TEST.T",
        "per": 12.0,
        "pbr": 1.5,
        "psr": 2.0,
        "roe": 25.0,
        "roa": 10.0,
        "profit_margin": 20.0,
        "operating_margin": 18.0,
        "revenue_growth": 15.0,
        "earnings_growth": 20.0,
        "debt_to_equity": 20.0,
        "current_ratio": 2.5,
        "beta": 1.0,
    }


@pytest.fixture
def poor_fundamentals():
    """問題のある銘柄のファンダメンタルズ"""
    return {
        "symbol": "BAD.T",
        "per": -5.0,
        "pbr": 8.0,
        "psr": 10.0,
        "roe": -10.0,
        "roa": -5.0,
        "profit_margin": -15.0,
        "operating_margin": -10.0,
        "revenue_growth": -20.0,
        "earnings_growth": -30.0,
        "debt_to_equity": 150.0,
        "current_ratio": 0.5,
        "beta": 3.0,
    }


class TestFundamentalAnalyzer:
    def test_analyze_excellent(self, analyzer, excellent_fundamentals):
        """優良銘柄の分析結果"""
        score = analyzer.analyze(excellent_fundamentals)

        assert score is not None
        assert score.symbol == "TEST.T"
        assert score.total_score >= 65
        assert score.grade in ("A", "B")

    def test_analyze_poor(self, analyzer, poor_fundamentals):
        """問題銘柄の分析結果"""
        score = analyzer.analyze(poor_fundamentals)

        assert score is not None
        assert score.symbol == "BAD.T"
        assert score.total_score < 50
        assert score.grade in ("D", "F")
        assert len(score.warnings) > 0

    def test_analyze_none(self, analyzer):
        """Noneデータの処理"""
        score = analyzer.analyze(None)
        assert score is None

    def test_analyze_empty(self, analyzer):
        """空データの処理"""
        score = analyzer.analyze({})
        # analyze returns None for empty dict since fundamentals is truthy but empty
        assert score is None or score.symbol == "UNKNOWN"

    def test_is_investable_good(self, analyzer, excellent_fundamentals):
        """優良銘柄は投資適格"""
        score = analyzer.analyze(excellent_fundamentals)
        assert analyzer.is_investable(score)

    def test_is_investable_bad(self, analyzer, poor_fundamentals):
        """問題銘柄は投資不適格"""
        score = analyzer.analyze(poor_fundamentals)
        assert not analyzer.is_investable(score)

    def test_grade_boundaries(self, analyzer):
        """グレードの境界値テスト"""
        assert FundamentalAnalyzer._calculate_grade(80) == "A"
        assert FundamentalAnalyzer._calculate_grade(65) == "B"
        assert FundamentalAnalyzer._calculate_grade(50) == "C"
        assert FundamentalAnalyzer._calculate_grade(35) == "D"
        assert FundamentalAnalyzer._calculate_grade(20) == "F"

    def test_score_range(self, analyzer, excellent_fundamentals):
        """スコアが0-100の範囲に収まるか"""
        score = analyzer.analyze(excellent_fundamentals)

        for s in [
            score.total_score,
            score.valuation_score,
            score.profitability_score,
            score.growth_score,
            score.health_score,
        ]:
            assert 0 <= s <= 100

    def test_get_summary(self, analyzer, excellent_fundamentals):
        """サマリー生成"""
        score = analyzer.analyze(excellent_fundamentals)
        summary = analyzer.get_summary(score)

        assert "TEST.T" in summary
        assert "グレード" in summary
        assert "投資適格" in summary
