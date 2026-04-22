from sqlalchemy import Column, Integer, String, Float, Date
from database import Base

class Stock(Base):
    __tablename__ = "stocks"
    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, unique=True, index=True)
    name = Column(String)
    sector = Column(String)
    security_name = Column(String)
    website = Column(String)
    email = Column(String)
    instrument_type = Column(String)
    nepse_id = Column(Integer)

class DailyCandle(Base):
    __tablename__ = "daily_candles"
    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, index=True)
    date = Column(Date, index=True)
    open = Column(Float)
    high = Column(Float)
    low = Column(Float)
    close = Column(Float)
    volume = Column(Integer)
    # We will use this table to calculate MACD, RSI, etc.

class DailyFloorsheet(Base):
    __tablename__ = "daily_floorsheets"
    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, index=True)
    date = Column(Date, index=True)
    broker_id = Column(Integer)
    net_units = Column(Integer)
    # If net_units > 0, broker bought more than sold
    # If net_units < 0, broker sold more than bought

class SignalCache(Base):
    __tablename__ = "signal_cache"
    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, unique=True, index=True)
    score = Column(Integer)
    signal = Column(String)
    reason = Column(String)
    rsi = Column(Float)
    macd = Column(Float)
    ema_20 = Column(Float)
    ema_50 = Column(Float)
    accumulation_score = Column(Integer)
    last_updated = Column(Date, index=True)
