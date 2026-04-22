import pandas as pd
from ta.momentum import RSIIndicator
from ta.trend import MACD, EMAIndicator
import numpy as np

def calculate_technical_indicators(df: pd.DataFrame):
    """
    Calculates RSI, MACD, and EMA for a given DataFrame of daily candles.
    Expects DataFrame to have a 'close' column, sorted by date.
    """
    if len(df) < 30:
        # Not enough data for reliable indicators
        return df
    
    # 1. RSI (14-period)
    rsi_indicator = RSIIndicator(close=df["close"], window=14)
    df["rsi"] = rsi_indicator.rsi()
    
    # 2. MACD
    macd = MACD(close=df["close"], window_slow=26, window_fast=12, window_sign=9)
    df["macd_line"] = macd.macd()
    df["macd_signal"] = macd.macd_signal()
    df["macd_histogram"] = macd.macd_diff()
    
    # 3. EMA (Short and Long Term)
    df["ema_20"] = EMAIndicator(close=df["close"], window=20).ema_indicator()
    df["ema_50"] = EMAIndicator(close=df["close"], window=50).ema_indicator()
    df["ema_200"] = EMAIndicator(close=df["close"], window=200).ema_indicator()
    
    return df

def analyze_broker_accumulation(floorsheet_df: pd.DataFrame, days: int = 10):
    """
    Analyzes broker accumulation for a given stock.
    floorsheet_df expected columns: ['date', 'broker_id', 'net_units']
    Returns a dictionary compatible with the frontend's NEPSE.brokerData.
    """
    if floorsheet_df.empty:
        return {
            "score": 50, "trend": "neutral", "signal": "NEUTRAL",
            "top_buyers": [], "top_sellers": [], "net_units": 0, "days": 0
        }
    
    # Group by broker
    grouped = floorsheet_df.groupby('broker_id')['net_units'].sum()
    
    # Identify top players
    top_buyers_series = grouped[grouped > 0].sort_values(ascending=False).head(5)
    net_units = int(top_buyers_series.sum())
    
    top_buyers = top_buyers_series.index.tolist()
    top_sellers = grouped[grouped < 0].sort_values().head(5).index.tolist()
    
    # Calculate simple score 0-100
    # 50 is neutral. >50 is accumulation, <50 is distribution.
    score = 50
    if net_units > 0:
        score = min(100, 50 + int(net_units / 1000)) # Lowered from 5000 for better sensitivity
    else:
        score = max(0, 50 + int(net_units / 1000))
        
    # Determine trend and signal
    trend = "neutral"
    signal = "NEUTRAL"
    
    if score >= 75: # Lowered from 80
        trend = "heavy_accum"
        signal = "BURST_SOON"
    elif score >= 60:
        trend = "accumulating"
        signal = "WATCH"
    elif score <= 20:
        trend = "distribution"
        signal = "EXIT"
    elif score <= 40:
        trend = "distributing"
        signal = "CAUTION"
        
    # Unique days of activity
    active_days = floorsheet_df['date'].nunique()
    
    return {
        "score": score,
        "trend": trend,
        "signal": signal,
        "top_buyers": top_buyers,
        "top_sellers": top_sellers,
        "net_units": net_units,
        "days": active_days,
        "price_target": 0, # Placeholder
        "days_to_break": 0 # Placeholder
    }
    
def generate_buy_sell_signal(current_price: float, indicators: dict, broker_data: dict, stock_data: dict = None):
    if stock_data is None: stock_data = {}
    """
    Generates a combined signal based on technicals and broker activity.
    """
    score = 50
    reasons = []
    
    # 1. RSI Logic
    rsi = indicators.get("rsi")
    if rsi is not None and not np.isnan(rsi):
        if rsi < 30:
            score += 15
            reasons.append(f"RSI is oversold at {rsi:.1f}")
        elif rsi > 70:
            score -= 15
            reasons.append(f"RSI is overbought at {rsi:.1f}")
        else:
            reasons.append(f"RSI is neutral at {rsi:.1f}")
            
    # 2. MACD Logic
    macd_hist = indicators.get("macd_histogram")
    if macd_hist is not None and not np.isnan(macd_hist):
        if macd_hist > 0:
            score += 10
            reasons.append(f"Bullish momentum (MACD Hist: {macd_hist:.2f})")
        elif macd_hist < 0:
            score -= 10
            reasons.append(f"Bearish momentum (MACD Hist: {macd_hist:.2f})")
            
    # 3. EMA Logic
    ema_20 = indicators.get("ema_20")
    ema_50 = indicators.get("ema_50")
    if ema_20 is not None and ema_50 is not None and not np.isnan(ema_20) and not np.isnan(ema_50):
        if current_price > ema_20 > ema_50:
            score += 15
            reasons.append("Strong uptrend (Price > EMA20 > EMA50)")
        elif current_price < ema_20 < ema_50:
            score -= 15
            reasons.append("Strong downtrend (Price < EMA20 < EMA50)")

    # 1. Price Momentum (Today)
    chg_pct = stock_data.get("chgPct", 0)
    if chg_pct > 3:
        score += 15
        reasons.append(f"Strong momentum (+{chg_pct:.1f}%)")
    elif chg_pct > 1.5:
        score += 7
        reasons.append("Positive price action")
    elif chg_pct < -3:
        score -= 15
        reasons.append(f"Sharp decline (-{abs(chg_pct):.1f}%)")

    # 4. Broker Accumulation Logic
    net_units = broker_data.get("net_units", 0)
    top_buyers = broker_data.get("top_buyers", [])
    if net_units > 5000: # Lowered threshold from 10000
        score += 15
        reasons.append(f"Broker accumulation (+{net_units} units)")
        if top_buyers:
            reasons.append(f"Smart money brokers: {', '.join(map(str, top_buyers[:2]))}")
    elif net_units < -5000:
        score -= 15
        reasons.append(f"Institutional selling ({abs(net_units)} units)")

    # 5. Volatility & Volume Check
    vol_chg = stock_data.get("vol_chg", 0)
    if vol_chg > 50:
        score += 10
        reasons.append(f"Volume breakout (+{vol_chg:.0f}% vs avg)")

    # 6. Sector Context
    sector_avg = stock_data.get("sector_avg", 0)
    if stock_data.get("chgPct", 0) > sector_avg + 2:
        reasons.append(f"Outperforming its sector ({stock_data.get('sector')})")

    if not reasons:
        reasons.append("Market trend is currently sideways/neutral")
        
    score = max(0, min(100, score)) # Clamp between 0 and 100
    
    signal = "HOLD"
    if score >= 65: signal = "BUY"
    elif score >= 80: signal = "STRONG BUY"
    elif score <= 35: signal = "SELL"
    elif score <= 20: signal = "STRONG SELL"
    
    return {
        "score": score,
        "signal": signal,
        "reasons": reasons
    }
