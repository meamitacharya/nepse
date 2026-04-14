import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Load environment variables from .env file (if it exists)
load_dotenv()

# We use SQLite for local development so you can run it right now.
# When we deploy to Hugging Face, we simply replace this URL with the Supabase connection string.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./nepse.db")

engine = create_engine(
    DATABASE_URL, 
    # check_same_thread=False is needed only for SQLite
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
