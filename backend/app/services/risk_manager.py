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
