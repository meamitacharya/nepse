import os
import requests
from datetime import date
from sqlalchemy.orm import Session
from database import SessionLocal, engine
import models

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

    except Exception as e:
        print(f"Error during scraping: {str(e)}")
    finally:
        db.close()

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
            print(f"Saved {count} historical records for {symbol}.")
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
        db.close()

if __name__ == "__main__":
    fetch_and_save_data()
