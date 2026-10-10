from typing import Dict, Optional

def calculate_position_size(account_size: float, risk_pct: float, entry_price: float, stop_loss: float) -> Dict:
    """
    Calculates position sizing based on account size and risk.
    """
    risk_amount = account_size * (risk_pct / 100.0)
    risk_per_share = abs(entry_price - stop_loss)
    
    if risk_per_share <= 0 or risk_per_share != risk_per_share:  # NaN check
        return {
            'risk_amount': risk_amount,
            'shares_to_buy': 0,
            'position_value': 0.0,
        }
        
    raw_shares = risk_amount / risk_per_share
    if raw_shares != raw_shares:  # NaN check
        raw_shares = 0
    shares_to_buy = int(raw_shares)  # Floor to whole shares
    position_value = shares_to_buy * entry_price
    
    return {
        'risk_amount': risk_amount,
        'shares_to_buy': shares_to_buy,
        'position_value': position_value,
    }

def calculate_risk_budgeted_size(risk_budget_try: float, entry_price: float, stop_loss: float) -> Dict:
    """
    Institutional Fixed-Risk Budget Allocator:
    Sizes the position such that if the stop loss is executed, the portfolio loses exactly `risk_budget_try`.
    Example: ₺150 risk budget on ₺100 stock with ₺96 stop (₺4 risk/share) -> exactly 37 shares (₺3,700 position).
    """
    risk_per_share = abs(entry_price - stop_loss)
    if risk_per_share <= 0 or entry_price <= 0:
        return {
            'risk_budget': risk_budget_try,
            'shares_to_buy': 0,
            'position_value': 0.0,
            'effective_loss_at_stop': 0.0
        }
    shares = int(risk_budget_try / risk_per_share)
    pos_val = round(shares * entry_price, 2)
    effective_loss = round(shares * risk_per_share, 2)
    return {
        'risk_budget': risk_budget_try,
        'shares_to_buy': shares,
        'position_value': pos_val,
        'effective_loss_at_stop': effective_loss,
        'risk_per_share': round(risk_per_share, 2)
    }

def calculate_volatility_targeted_size(account_size: float, target_vol_pct: float, asset_annual_vol_pct: float, entry_price: float) -> Dict:
    """
    Institutional Volatility Parity Allocator (AQR / Bridgewater Style):
    Sizes the asset position inversely proportional to its annualized volatility (1 / sigma).
    Weight = Target_Portfolio_Vol / Asset_Vol
    """
    if asset_annual_vol_pct <= 0 or entry_price <= 0 or account_size <= 0:
        return {'shares_to_buy': 0, 'position_value': 0.0, 'weight_pct': 0.0}
    weight = min(0.35, target_vol_pct / asset_annual_vol_pct)  # Cap single stock weight at 35%
    pos_val = round(account_size * weight, 2)
    shares = int(pos_val / entry_price)
    return {
        'target_vol_pct': target_vol_pct,
        'asset_vol_pct': asset_annual_vol_pct,
        'weight_pct': round(weight * 100, 2),
        'shares_to_buy': shares,
        'position_value': round(shares * entry_price, 2)
    }

def calculate_risk_reward(entry: float, stop_loss: float, target: float) -> float:
    """Returns R:R ratio."""
    risk = entry - stop_loss
    reward = target - entry
    if risk <= 0:
        return 0.0
    return reward / risk

def calculate_atr_stop(close: float, atr: float, multiplier: float = 2.0) -> float:
    """ATR-based dynamic stop loss."""
    return close - (atr * multiplier)

def format_position_recommendation(account_size: float, risk_pct: float, entry: float, stop_loss: float, target: float, currency: str) -> str:
    """Human-readable position sizing string."""
    size_info = calculate_position_size(account_size, risk_pct, entry, stop_loss)
    if not size_info:
        return "Invalid trade parameters."
        
    shares = size_info['shares_to_buy']
    value = size_info['position_value']
    risk = size_info['risk_amount']
    rr = calculate_risk_reward(entry, stop_loss, target)
    
    return (
        f"Recommendation: Buy {shares:.2f} shares at {entry:.2f} {currency}. "
        f"Total Position: {value:.2f} {currency}. "
        f"Risk: {risk:.2f} {currency} ({risk_pct}% of account). "
        f"R:R Ratio: {rr:.2f}"
    )
