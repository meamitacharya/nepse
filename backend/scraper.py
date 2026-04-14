import os
import requests
from datetime import date
from sqlalchemy.orm import Session
from database import SessionLocal, engine
import models

# Ensure tables are created
models.Base.metadata.create_all(bind=engine)

API_BASE_URL = "https://meamitacharya-nepse-api-amit.hf.space"

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
                if not symbol:
                    continue
                # Update Stock Info
                stock = db.query(models.Stock).filter(models.Stock.symbol == symbol).first()
                if not stock:
                    stock = models.Stock(
                        symbol=symbol,
                        name=details.get("name", symbol),
                        sector=details.get("sector", "Others")
                    )
                    db.add(stock)
                
                # We do a fast commit so the stock exists if we need it
                db.commit()

                # Add Daily Candle
                ltp = float(details.get("ltp", 0))
                prev = float(details.get("previousClose", 0))
                # Fallback approximations for OHLC since the endpoint might lack strict high/low
                open_val = prev
                high_val = ltp
                low_val = ltp
                
                # Check if candle already exists for today
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
            
            db.commit()
            print("Successfully saved Daily Candles.")
        else:
            print(f"Failed to fetch OHLCV: {resp.status_code}")

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

if __name__ == "__main__":
    fetch_and_save_data()
