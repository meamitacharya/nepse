from sqlalchemy import Column, Integer, String, Float, Date
from database import Base

class Stock(Base):
    __tablename__ = "stocks"
    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, unique=True, index=True)
    name = Column(String)
    sector = Column(String)

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
