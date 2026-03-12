import time
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database.init_db import init_db
from api.users import router as users_router
from api.roles import router as roles_router
from api.workflow import router as workflow_router
from api.provisioning import router as provisioning_router
from api.reports import router as reports_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="ZeroTrust Platform",
    description="Zero Trust Governance Platform",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    # Retry DB connection up to 10 times (handles slow Postgres init)
    for attempt in range(1, 11):
        try:
            logger.info(f"Connecting to database (attempt {attempt}/10)...")
            init_db()
            logger.info("✅ Database connected and tables ready.")
            return
        except Exception as e:
            logger.warning(f"DB not ready yet: {e}")
            if attempt == 10:
                raise
            time.sleep(3)

app.include_router(users_router)
app.include_router(roles_router)
app.include_router(workflow_router)
app.include_router(provisioning_router)
app.include_router(reports_router)

@app.get("/health")
def health():
    return {"status": "ok", "service": "ZeroTrust Platform"}