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
    """
    if floorsheet_df.empty:
        return {}
    
    # Sort by date
    floorsheet_df = floorsheet_df.sort_values(by="date")
    
    # Filter to last 'days'
    recent_df = floorsheet_df.tail(days * len(floorsheet_df.broker_id.unique())) # Approximation for recent activity
    
    # Needs a more robust grouping by date and broker to genuinely find X days of contiguous buying
    
    broker_scores = {}
    
    # Group by broker over the recent period
    grouped = floorsheet_df.groupby('broker_id')['net_units'].agg(['sum', 'count'])
    
    # Simple scoring: total net units in the period
    top_buyers = grouped[grouped['sum'] > 0].sort_values(by='sum', ascending=False).head(5)
    top_sellers = grouped[grouped['sum'] < 0].sort_values(by='sum').head(5)
    
    return {
        "top_buyers": top_buyers.index.tolist(),
        "top_sellers": top_sellers.index.tolist(),
        "total_net_recent": grouped['sum'].sum()
    }
    
def generate_buy_sell_signal(current_price: float, indicators: dict, broker_data: dict):
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
            reasons.append("RSI is oversold (< 30)")
        elif rsi > 70:
            score -= 15
            reasons.append("RSI is overbought (> 70)")
            
    # 2. MACD Logic
    macd_hist = indicators.get("macd_histogram")
    if macd_hist is not None and not np.isnan(macd_hist):
        if macd_hist > 0:
            score += 10
            reasons.append("MACD histogram is positive (Bullish momentum)")
        elif macd_hist < 0:
            score -= 10
            reasons.append("MACD histogram is negative (Bearish momentum)")
            
    # 3. EMA Logic
    ema_20 = indicators.get("ema_20")
    ema_50 = indicators.get("ema_50")
    if ema_20 is not None and ema_50 is not None and not np.isnan(ema_20) and not np.isnan(ema_50):
        if current_price > ema_20 > ema_50:
            score += 15
            reasons.append("Price is in a strong uptrend (Above EMA20 & EMA50)")
        elif current_price < ema_20 < ema_50:
            score -= 15
            reasons.append("Price is in a strong downtrend (Below EMA20 & EMA50)")

    # 4. Broker Accumulation Logic
    net_activity = broker_data.get("total_net_recent", 0)
    # This needs to be normalized against average volume for accurate scoring, sticking to simple logic for now
    if net_activity > 10000: # Arbitrary threshold
        score += 20
        reasons.append("Significant broker accumulation detected recently")
    elif net_activity < -10000:
        score -= 20
        reasons.append("Significant broker distribution detected recently")
        
    score = max(0, min(100, score)) # Clamp between 0 and 100
    
    signal = "HOLD"
    if score >= 70: signal = "STRONG BUY"
    elif score >= 60: signal = "BUY"
    elif score <= 30: signal = "STRONG SELL"
    elif score <= 40: signal = "SELL"
    
    return {
        "score": score,
        "signal": signal,
        "reasons": reasons
    }
