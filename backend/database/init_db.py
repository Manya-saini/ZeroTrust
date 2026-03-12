from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database.models import Base   # ← fixed: was "from models import Base"
import os

DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://iam_admin:iam_password@db:5432/iam_db')

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)