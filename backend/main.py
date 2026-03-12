from fastapi import FastAPI
from database.init_db import init_db

from fastapi import FastAPI
from database.init_db import init_db
from api.users import router as users_router
from api.roles import router as roles_router
from api.workflow import router as workflow_router
from api.provisioning import router as provisioning_router
from api.reports import router as reports_router

app = FastAPI(title="IAM Governance Platform")

@app.on_event("startup")
def startup_event():
    init_db()

app.include_router(users_router)
app.include_router(roles_router)
app.include_router(workflow_router)
app.include_router(provisioning_router)
app.include_router(reports_router)

@app.get("/health")
def health():
    return {"status": "ok"}
