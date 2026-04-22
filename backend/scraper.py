import os
import requests
from datetime import date, datetime
from sqlalchemy.orm import Session
from database import SessionLocal, engine
import models
from analysis import calculate_technical_indicators, analyze_broker_accumulation, generate_buy_sell_signal
import pandas as pd

# Ensure tables are created
models.Base.metadata.create_all(bind=engine)

API_BASE_URL = "https://meamitacharya-nepse-api-amit.hf.space"

def save_stock_and_candle(db, symbol, details, today):
    # Update Stock Info
    stock = db.query(models.Stock).filter(models.Stock.symbol == symbol).first()
    if not stock:
        stock = models.Stock(
            symbol=symbol,
            name=details.get("name", symbol),
            sector=details.get("sector", "Others")
        )
        db.add(stock)
    
    # Fast commit/flush so the record exists
    db.flush()

    # Add Daily Candle
    ltp = float(details.get("ltp", 0))
    prev = float(details.get("previousClose", 0))
    
    # Approx OHLC
    open_val = float(details.get("openPrice", prev))
    high_val = float(details.get("highPrice", ltp))
    low_val = float(details.get("lowPrice", ltp))
    
    existing_candle = db.query(models.DailyCandle).filter(
        models.DailyCandle.symbol == symbol,
        models.DailyCandle.date == today
    ).first()

    if not existing_candle:
        candle = models.DailyCandle(
            symbol=symbol,
            date=today,
            open=open_val,
            high=high_val,
            low=low_val,
            close=ltp,
            volume=int(details.get("volume", 0))
        )
        db.add(candle)

def fetch_and_save_data():
    db = SessionLocal()
    today = date.today()
    print(f"--- Fetching Data for {today} ---")

    try:
        # 1. Fetch Stocks & Daily Candles (OHLCV)
        print("Fetching OHLCV Data...")
        resp = requests.get(f"{API_BASE_URL}/TradeTurnoverTransactionSubindices")
        if resp.status_code == 200:
            data = resp.json()
            scrips = data.get("scripsDetails", {})
            
            for symbol, details in scrips.items():
                save_stock_and_candle(db, symbol, details, today)
            
            db.commit()
            print("Successfully saved Daily Candles from primary API.")
        else:
            print(f"Primary API failed ({resp.status_code}). Trying LiveMarket fallback...")
            lm_resp = requests.get(f"{API_BASE_URL}/LiveMarket")
            if lm_resp.status_code == 200:
                lm_data = lm_resp.json()
                # Handle cases where it might be a list or a dict with details
                arr = lm_data if isinstance(lm_data, list) else lm_data.values()
                for s in arr:
                    symbol = s.get("symbol") or s.get("stockSymbol")
                    if not symbol: continue
                    
                    # Normalize keys to match what save_stock_and_candle expects
                    details = {
                        "name": s.get("securityName") or s.get("name"),
                        "sector": s.get("sectorName") or s.get("sector"),
                        "ltp": s.get("ltp") or s.get("lastTradedPrice"),
                        "previousClose": s.get("previousClose") or s.get("prev"),
                        "volume": s.get("totalTradeQuantity") or s.get("shareTraded")
                    }
                    save_stock_and_candle(db, symbol, details, today)
                db.commit()
                print("Successfully saved Daily Candles from fallback API.")
            else:
                print(f"Fallback API also failed: {lm_resp.status_code}")

        # 2. Fetch Floorsheet Data for Broker Accumulation
        print("Fetching Floorsheet Data...")
        floorsheet_resp = requests.get(f"{API_BASE_URL}/Floorsheet")
        if floorsheet_resp.status_code == 200:
            fs_data = floorsheet_resp.json()
            # Depending on exactly what the HF API returns (array vs dict)
            rows = fs_data if isinstance(fs_data, list) else fs_data.get("floorSheetData", [])
            
            # Dictionary to aggregate net units per broker per stock
            accumulation = {}
            for row in rows:
                sym = row.get("symbol") or row.get("stockSymbol") or row.get("stock")
                qty = int(row.get("contractQuantity", row.get("quantity", 0)))
                buyer = int(row.get("buyerMemberId", row.get("buyBrokerId", 0)))
                seller = int(row.get("sellerMemberId", row.get("sellBrokerId", 0)))

                if not sym: continue
                if sym not in accumulation:
                    accumulation[sym] = {}
                
                if buyer != 0:
                    accumulation[sym][buyer] = accumulation[sym].get(buyer, 0) + qty
                if seller != 0:
                    accumulation[sym][seller] = accumulation[sym].get(seller, 0) - qty

            # Save to Database (OPTIMIZED BULK INSERT)
            print("Saving floorsheet data to database (Bulk Mode)...")
            
            # 1. Fetch all existing entries for today IN A SINGLE QUERY to save network time
            existing_records = db.query(models.DailyFloorsheet.symbol, models.DailyFloorsheet.broker_id).filter(
                models.DailyFloorsheet.date == today
            ).all()
            existing_set = set((r.symbol, r.broker_id) for r in existing_records)
            
            new_entries = []
            for sym, brokers in accumulation.items():
                for broker_id, net_units in brokers.items():
                    # Only save meaningful accumulation to save space
                    if net_units == 0: continue
                    
                    # Instead of hitting the DB iteratively, check our local memory set
                    if (sym, broker_id) not in existing_set:
                        new_entries.append(models.DailyFloorsheet(
                            symbol=sym,
                            date=today,
                            broker_id=broker_id,
                            net_units=net_units
                        ))
            
            if new_entries:
                db.bulk_save_objects(new_entries)
                db.commit()
                
            print(f"Successfully saved {len(new_entries)} new Floorsheet records.")
        else:
            print(f"Failed to fetch Floorsheet: {floorsheet_resp.status_code}")

        # 3. AUTO-UPDATE SIGNALS (PRE-CALCULATION)
        print("Pre-calculating signals for dashboard...")
        update_all_signals(db)

    except Exception as e:
        print(f"Error during scraping: {str(e)}")
    finally:
        db.close()

def update_all_signals(db: Session = None):
    """
    Analyzes every stock in the DB and caches its BUY/SELL/HOLD signal in signal_cache.
    This makes the frontend signals load instantly.
    """
    own_db = False
    if db is None:
        db = SessionLocal()
        own_db = True
    
    try:
        stocks = db.query(models.Stock).all()
        print(f"Updating signals for {len(stocks)} stocks...")
        
        for stock in stocks:
            symbol = stock.symbol
            # 1. Fetch OHLC history (last 50 days)
            candles = db.query(models.DailyCandle).filter(models.DailyCandle.symbol == symbol).order_by(models.DailyCandle.date).all()
            if len(candles) < 1: continue # Need at least today's data

            # Convert to DataFrame for technical-analysis library
            df = pd.DataFrame([{
                "date": c.date, "open": c.open, "high": c.high, "low": c.low, "close": c.close, "volume": c.volume
            } for c in candles])
            
            # 2. Calculate Indicators
            df_analyzed = calculate_technical_indicators(df)
            latest_indicators = {}
            current_price = df.iloc[-1]["close"]
            
            if len(df_analyzed) >= 14: # Basic RSI needs 14
                latest_row = df_analyzed.iloc[-1]
                latest_indicators = {
                    "rsi": float(latest_row.get("rsi", 0)),
                    "macd_histogram": float(latest_row.get("macd_histogram", 0)),
                    "ema_20": float(latest_row.get("ema_20", 0)),
                    "ema_50": float(latest_row.get("ema_50", 0))
                }

            # 3. Fetch Floorsheet history
            floorsheets = db.query(models.DailyFloorsheet).filter(models.DailyFloorsheet.symbol == symbol).all()
            accumulation_score = 0
            broker_data = {"top_buyers": [], "top_sellers": [], "score": 0}
            
            if floorsheets:
                fs_df = pd.DataFrame([{
                    "date": f.date, "broker_id": f.broker_id, "net_units": f.net_units
                } for f in floorsheets])
                broker_data = analyze_broker_accumulation(fs_df)
                accumulation_score = broker_data.get("score", 0)
            
            # 4. Market/Sector Context
            stock_info = db.query(models.Stock).filter(models.Stock.symbol == symbol).first()
            chg_pct = 0
            if len(df) >= 2:
                prev_close = df.iloc[-2]["close"]
                if prev_close > 0:
                    chg_pct = (current_price - prev_close) / prev_close * 100
            
            stock_data = {
                "symbol": symbol,
                "chgPct": chg_pct,
                "sector": stock_info.sector if stock_info else "Unknown",
                "vol_chg": 0,
                "sector_avg": 0
            }
            
            # Volume change (vs 10 day average)
            if len(df) >= 10:
                avg_vol = df.iloc[-10:-1]["volume"].mean()
                if avg_vol > 0:
                    stock_data["vol_chg"] = (df.iloc[-1]["volume"] - avg_vol) / avg_vol * 100

            # 5. Generate Signal
            if symbol == "NHPC": print("Generating signal for NHPC...")
            signal_res = generate_buy_sell_signal(current_price, latest_indicators, broker_data, stock_data)
            if symbol == "NHPC": print(f"NHPC Signal: {signal_res}")
            
            # 5. Save to Cache
            cache = db.query(models.SignalCache).filter(models.SignalCache.symbol == symbol).first()
            if not cache:
                cache = models.SignalCache(symbol=symbol)
                db.add(cache)
            
            cache.score = signal_res["score"]
            cache.signal = signal_res["signal"]
            # Join the reasons list into a single string for the dashboard
            cache.reason = " | ".join(signal_res.get("reasons", [])) or "Hold position."
            cache.rsi = latest_indicators.get("rsi")
            cache.macd = latest_indicators.get("macd_histogram")
            cache.ema_20 = latest_indicators.get("ema_20")
            cache.ema_50 = latest_indicators.get("ema_50")
            cache.accumulation_score = accumulation_score
            cache.last_updated = datetime.now().date()
            
        db.commit()
        print("Signal cache updated successfully.")
    except Exception as e:
        print(f"Error updating signals: {str(e)}")
    finally:
        if own_db: db.close()

def backfill_history(symbol, days=50):
    """
    Fetches historical OHLCV data for a specific symbol and saves it to the database.
    """
    db = SessionLocal()
    try:
        print(f"Backfilling History for {symbol}...")
        resp = requests.get(f"{API_BASE_URL}/PriceVolumeHistory", params={"symbol": symbol})
        if resp.status_code == 200:
            data = resp.json()
            # The API usually returns a list of daily data
            history = data if isinstance(data, list) else data.get("priceHistory", [])
            
            count = 0
            for entry in history:
                # Standard NEPSE API fields: date, open, high, low, close, volume, etc.
                dt_str = entry.get("date")
                if not dt_str: continue
                
                # Check if already exists
                existing = db.query(models.DailyCandle).filter(
                    models.DailyCandle.symbol == symbol,
                    models.DailyCandle.date == dt_str
                ).first()
                
                if not existing:
                    candle = models.DailyCandle(
                        symbol=symbol,
                        date=dt_str,
                        open=float(entry.get("open", entry.get("openPrice", 0))),
                        high=float(entry.get("high", entry.get("highPrice", 0))),
                        low=float(entry.get("low", entry.get("lowPrice", 0))),
                        close=float(entry.get("close", entry.get("lastTradedPrice", 0))),
                        volume=int(entry.get("volume", entry.get("totalTradeQuantity", 0)))
                    )
                    db.add(candle)
                    count += 1
            
            db.commit()
            print(f"Saved {count} historical candles for {symbol}.")

            # --- NEW: Also try to backfill Floorsheet History ---
            print(f"Fetching Floorsheet History for {symbol}...")
            fs_resp = requests.get(f"{API_BASE_URL}/FloorsheetOf", params={"symbol": symbol})
            if fs_resp.status_code == 200:
                fs_data = fs_resp.json()
                rows = fs_data if isinstance(fs_data, list) else fs_data.get("floorSheetData", [])
                
                # Dictionary to aggregate net units per broker for THIS stock
                acc = {}
                for row in rows:
                    qty = int(row.get("contractQuantity", row.get("quantity", 0)))
                    buyer = int(row.get("buyerMemberId", row.get("buyBrokerId", 0)))
                    seller = int(row.get("sellerMemberId", row.get("sellBrokerId", 0)))
                    row_date = row.get("date") or str(date.today())
                    
                    if row_date not in acc: acc[row_date] = {}
                    if buyer: acc[row_date][buyer] = acc[row_date].get(buyer, 0) + qty
                    if seller: acc[row_date][seller] = acc[row_date].get(seller, 0) - qty

                # Save historical floorsheets
                fs_count = 0
                for d, brokers in acc.items():
                    for bid, units in brokers.items():
                        existing = db.query(models.DailyFloorsheet).filter(
                            models.DailyFloorsheet.symbol == symbol,
                            models.DailyFloorsheet.date == d,
                            models.DailyFloorsheet.broker_id == bid
                        ).first()
                        if not existing:
                            db.add(models.DailyFloorsheet(symbol=symbol, date=d, broker_id=bid, net_units=units))
                            fs_count += 1
                db.commit()
                print(f"Saved {fs_count} historical floorsheet records for {symbol}.")

        else:
            print(f"History API failed for {symbol}: {resp.status_code}")
    except Exception as e:
        print(f"Error backfilling {symbol}: {str(e)}")
    finally:
        db.close()

def backfill_all_stocks(limit=100):
    """
    Backfills history for the top N stocks to build indicator history.
    """
    db = SessionLocal()
    try:
        stocks = db.query(models.Stock).limit(limit).all()
        print(f"Starting Batch Backfill for {len(stocks)} stocks...")
        for stock in stocks:
            backfill_history(stock.symbol)
    finally:
        print("Batch backfill complete. Updating signal cache...")
        update_all_signals(db)
        db.close()

if __name__ == "__main__":
    fetch_and_save_data()
