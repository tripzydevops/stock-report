"""
MarketPulse Institutional Statistical Arbitrage & Pairs Trading Engine
Scans co-integrated asset pairs across Borsa Istanbul, calculates spread Z-scores,
Bollinger bands on ratio, Ornstein-Uhlenbeck half-life, and generates market-neutral pairs signals.
"""
import numpy as np
import pandas as pd
from typing import Dict, List, Optional
import math

# Canonical liquid BIST co-integrated pairs with sector rationale
BIST_PAIRS = [
    {
        "pair_id": "AVIA_THYAO_PGSUS",
        "leg_a": "THYAO.IS",
        "leg_b": "PGSUS.IS",
        "sector": "Havacılık (Aviation)",
        "description": "Türk Hava Yolları vs Pegasus - Akaryakıt maliyeti ve turizm yolcu talebi ortak çarpanı."
    },
    {
        "pair_id": "BANK_AKBNK_GARAN",
        "leg_a": "AKBNK.IS",
        "leg_b": "GARAN.IS",
        "sector": "Bankacılık (Tier-1 Banking)",
        "description": "Akbank vs Garanti BBVA - TCMB faiz marjı ve net faiz geliri (NIM) eşdeğerliği."
    },
    {
        "pair_id": "BANK_ISCTR_YKBNK",
        "leg_a": "ISCTR.IS",
        "leg_b": "YKBNK.IS",
        "sector": "Bankacılık (Commercial Banks)",
        "description": "İş Bankası vs Yapı Kredi - Benzer kredi büyümesi ve mevduat maliyeti dinamikleri."
    },
    {
        "pair_id": "TELECOM_TCELL_TTKOM",
        "leg_a": "TCELL.IS",
        "leg_b": "TTKOM.IS",
        "sector": "Telekomünikasyon (Telecom Duopoly)",
        "description": "Turkcell vs Türk Telekom - ARPU (abone başı gelir) artışı ve enflasyonist tarife fiyatlaması."
    },
    {
        "pair_id": "STEEL_EREGL_KRDMD",
        "leg_a": "EREGL.IS",
        "leg_b": "KRDMD.IS",
        "sector": "Demir Çelik (Steel Industry)",
        "description": "Erdemir vs Kardemir - Küresel sıcak rulo çelik (HRC) ve cevher girdi fiyatları döngüsü."
    },
    {
        "pair_id": "RETAIL_BIMAS_MGROS",
        "leg_a": "BIMAS.IS",
        "leg_b": "MGROS.IS",
        "sector": "Gıda Perakende (Retail Grocery)",
        "description": "BİM vs Migros - Gıda enflasyonu cirosu ve mağaza sepet hacmi korelasyonu."
    },
    {
        "pair_id": "AUTO_FROTO_TOASO",
        "leg_a": "FROTO.IS",
        "leg_b": "TOASO.IS",
        "sector": "Otomotiv Sanayi (Auto OEMs)",
        "description": "Ford Otosan vs Tofaş - Avrupa ihracat talebi ve yurtiçi araç satış adetleri."
    },
    {
        "pair_id": "HOLDING_SAHOL_KCHOL",
        "leg_a": "SAHOL.IS",
        "leg_b": "KCHOL.IS",
        "sector": "Holdingler (Conglomerates)",
        "description": "Sabancı Holding vs Koç Holding - Net Aktif Değer (NAD / NAV) iskontosu arbitrajı."
    }
]

def calculate_half_life(spread_series: pd.Series) -> float:
    """
    Computes Ornstein-Uhlenbeck mean-reversion half-life:
    dy_t = -lambda * (y_{t-1} - mu) * dt + noise
    half_life = ln(2) / lambda
    """
    try:
        y = spread_series.values
        if len(y) < 15:
            return 10.0
        dy = np.diff(y)
        y_lag = y[:-1]
        
        # Linear regression of dy on y_lag: dy = a * y_lag + b
        # a is -lambda
        poly = np.polyfit(y_lag, dy, 1)
        lam = -poly[0]
        if lam > 0.001:
            half_life = np.log(2) / lam
            return float(np.clip(half_life, 2.0, 45.0))
        return 20.0
    except Exception:
        return 12.0

def scan_pairs_opportunities(asset_data: Dict[str, pd.DataFrame], lookback: int = 60) -> List[Dict]:
    """
    Scans candidate co-integrated pairs, aligns daily closing series,
    computes spread statistics, Z-scores, and generates trade recommendations.
    """
    results = []

    for p in BIST_PAIRS:
        sym_a = p["leg_a"]
        sym_b = p["leg_b"]

        df_a = asset_data.get(sym_a)
        df_b = asset_data.get(sym_b)

        if df_a is None or df_b is None or df_a.empty or df_b.empty:
            continue

        # Align series by matching index dates
        close_a = df_a["close"]
        close_b = df_b["close"]
        combined = pd.DataFrame({"a": close_a, "b": close_b}).dropna()

        if len(combined) < 25:
            continue

        recent = combined.tail(lookback)
        ratio_series = recent["a"] / recent["b"]

        current_ratio = float(ratio_series.iloc[-1])
        mean_ratio = float(ratio_series.mean())
        std_ratio = float(ratio_series.std())

        if std_ratio <= 0:
            continue

        # Spread Z-score: Z = (Ratio - Mean) / Std
        z_score = (current_ratio - mean_ratio) / std_ratio
        half_life_days = calculate_half_life(ratio_series)

        # Correlation between Leg A and Leg B
        correlation = float(recent["a"].corr(recent["b"]))

        # Upper and lower Bollinger Bands (2.0 sigma)
        upper_band_2s = mean_ratio + (2.0 * std_ratio)
        lower_band_2s = mean_ratio - (2.0 * std_ratio)
        upper_stop_3s = mean_ratio + (3.0 * std_ratio)
        lower_stop_3s = mean_ratio - (3.0 * std_ratio)

        # Generate Action & Trade Signal
        action = "NÖTR / EQUILIBRIUM"
        direction = "NEUTRAL"
        status_color = "slate"
        target_ratio = mean_ratio
        expected_spread_move_pct = 0.0
        rationale = ""

        if z_score >= 1.8:
            action = f"AL {sym_b.replace('.IS','')} / SAT {sym_a.replace('.IS','')}"
            direction = "SHORT_SPREAD"  # Short A, Long B
            status_color = "rose"
            expected_spread_move_pct = ((mean_ratio - current_ratio) / current_ratio) * 100.0
            rationale = (
                f"{sym_a.replace('.IS','')} rasyosu tarihsel ortalamasının +{z_score:.2f}σ üzerinde aşırı primlendi. "
                f"Stat-Arb kuralı: {sym_a.replace('.IS','')} Açığa Sat / {sym_b.replace('.IS','')} Uzun Pozisyon Al."
            )
        elif z_score <= -1.8:
            action = f"AL {sym_a.replace('.IS','')} / SAT {sym_b.replace('.IS','')}"
            direction = "LONG_SPREAD"  # Long A, Short B
            status_color = "emerald"
            expected_spread_move_pct = ((mean_ratio - current_ratio) / current_ratio) * 100.0
            rationale = (
                f"{sym_a.replace('.IS','')} rasyosu tarihsel ortalamasının {z_score:.2f}σ altında aşırı iskontolu kaldı. "
                f"Stat-Arb kuralı: {sym_a.replace('.IS','')} Uzun Pozisyon Al / {sym_b.replace('.IS','')} Açığa Sat."
            )
        elif abs(z_score) >= 1.2:
            action = "YAKLAŞIYOR / WATCHLIST"
            direction = "WATCHLIST"
            status_color = "amber"
            rationale = f"Makas açılıyor (Z: {z_score:.2f}σ). ±1.8σ işlem bandına yaklaşıyor."
        else:
            action = "DENGE BÖLGESİNDE"
            direction = "NEUTRAL"
            status_color = "blue"
            rationale = f"Fiyat oranı adil değer bandında (Z: {z_score:.2f}σ). İşlem fırsatı yok."

        results.append({
            "pair_id": p["pair_id"],
            "leg_a": sym_a.replace(".IS", ""),
            "leg_b": sym_b.replace(".IS", ""),
            "sector": p["sector"],
            "description": p["description"],
            "current_price_a": round(float(combined['a'].iloc[-1]), 2),
            "current_price_b": round(float(combined['b'].iloc[-1]), 2),
            "current_ratio": round(current_ratio, 4),
            "mean_ratio": round(mean_ratio, 4),
            "z_score": round(z_score, 2),
            "half_life_days": round(half_life_days, 1),
            "correlation": round(correlation, 2),
            "upper_band_2s": round(upper_band_2s, 4),
            "lower_band_2s": round(lower_band_2s, 4),
            "upper_stop_3s": round(upper_stop_3s, 4),
            "lower_stop_3s": round(lower_stop_3s, 4),
            "action": action,
            "direction": direction,
            "status_color": status_color,
            "target_ratio": round(target_ratio, 4),
            "expected_spread_move_pct": round(abs(expected_spread_move_pct), 2),
            "rationale": rationale,
        })

    # Sort so most extreme Z-scores appear first
    results.sort(key=lambda x: abs(x["z_score"]), reverse=True)
    return results
