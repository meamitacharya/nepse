from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware

import models
from database import engine, get_db
from scraper import fetch_and_save_data, backfill_all_stocks, update_all_signals

# Create the database tables
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="NEPSE Smart Backend Engine")

# Administrative: Manual Scrape Trigger
@app.get("/api/admin/scrape")
def trigger_scrape(db: Session = Depends(get_db)):
    """
    Manually triggers the data scraper to populate the database.
    Required because the scheduled GitHub Action only runs once a day.
    """
    try:
        fetch_and_save_data()
        return {"status": "success", "message": "Scraper completed successfully."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/admin/backfill")
def trigger_backfill(limit: int = 50, db: Session = Depends(get_db)):
    """
    Triggers a historical backfill for the top stocks.
    This enables RSI, EMA and other technical indicators to work.
    """
    try:
        backfill_all_stocks(limit=limit)
        return {"status": "success", "message": f"Backfill for {limit} stocks completed."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/admin/recalculate")
def trigger_recalculate(db: Session = Depends(get_db)):
    """
    Manually triggers the technical analysis engine to recalculate 
    all RSI, MACD, and EMA signals for the dashboard.
    """
    try:
        update_all_signals(db)
        return {"status": "success", "message": "Signal recalculation completed."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# Allow the frontend to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "NEPSE Smart Automation Engine is running!"}

@app.get("/api/test-db")
def test_database(db: Session = Depends(get_db)):
    # Simply test if we can query the database
    stock_count = db.query(models.Stock).count()
    return {"status": "success", "stocks_in_db": stock_count}

import pandas as pd
from analysis import calculate_technical_indicators, analyze_broker_accumulation, generate_buy_sell_signal

@app.get("/api/stock/{symbol}/analysis")
def get_stock_analysis(symbol: str, db: Session = Depends(get_db)):
    # 1. Fetch OHLC history (last 100 days)
    candles = db.query(models.DailyCandle).filter(models.DailyCandle.symbol == symbol).order_by(models.DailyCandle.date).all()
    if not candles:
        raise HTTPException(status_code=404, detail="Stock data not found. Please run backfill.")
        
    df = pd.DataFrame([{
        "date": c.date, "open": c.open, "high": c.high, "low": c.low, "close": c.close, "volume": c.volume
    } for c in candles])
    
    # 2. Calculate Indicators
    df_analyzed = calculate_technical_indicators(df)
    latest_indicators = {}
    current_price = df.iloc[-1]["close"]
    
    if len(df_analyzed) >= 20: # MACD/RSI need ~20-30 days
        latest_row = df_analyzed.iloc[-1]
        latest_indicators = {
            "rsi": float(latest_row.get("rsi", 0)),
            "macd_histogram": float(latest_row.get("macd_histogram", 0)),
            "ema_20": float(latest_row.get("ema_20", 0)),
            "ema_50": float(latest_row.get("ema_50", 0))
        }

    # 3. Fetch Floorsheet history
    floorsheets = db.query(models.DailyFloorsheet).filter(models.DailyFloorsheet.symbol == symbol).all()
    fs_df = pd.DataFrame([{
        "date": f.date, "broker_id": f.broker_id, "net_units": f.net_units
    } for f in floorsheets])
    
    broker_data = analyze_broker_accumulation(fs_df)
    
    # 4. Generate Signal
    signal = generate_buy_sell_signal(current_price, latest_indicators, broker_data)
    
    return {
        "symbol": symbol,
        "current_price": current_price,
        "indicators": latest_indicators,
        "broker_accumulation": broker_data,
        "recommendation": signal
    }

@app.get("/api/signals/latest")
def get_latest_signals(db: Session = Depends(get_db)):
    """
    Returns the pre-calculated signals from SignalCache.
    Extremely fast (milliseconds), prevents server timeouts.
    """
    # 1. Fetch all cached signals
    cached_signals = db.query(models.SignalCache).all()
    
    if not cached_signals:
        # Fallback: If cache is empty, return a very basic list so the UI doesn't crash
        stocks = db.query(models.Stock).limit(50).all()
        results = [{
            "symbol": s.symbol,
            "name": s.name,
            "score": 50,
            "signal": "HOLD",
            "reason": "Engine warming up. Run backfill.",
            "source": "SmartEngine_v3_Init"
        } for s in stocks]
        return {"data": results}

    results = []
    for sig in cached_signals:
        # Get last price for the UI
        candle = db.query(models.DailyCandle).filter(models.DailyCandle.symbol == sig.symbol).order_by(models.DailyCandle.date.desc()).first()
        results.append({
            "symbol": sig.symbol,
            "score": sig.score,
            "signal": sig.signal,
            "reason": sig.reason,
            "ltp": candle.close if candle else 0,
            "rsi": sig.rsi,
            "accumulation_score": sig.accumulation_score,
            "last_updated": str(sig.last_updated),
            "source": "SmartEngine_v3_Rapid"
        })
        
    return {"data": results}
