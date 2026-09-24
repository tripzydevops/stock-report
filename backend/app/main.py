from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.core.config import get_settings
from app.api.assets import router as assets_router
from app.api.prices import router as prices_router
from app.api.scanner import router as scanner_router
from app.api.portfolio import router as portfolio_router
from app.api.regime import router as regime_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="MarketPulse API",
    description="Backend API for MarketPulse project",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(assets_router, prefix="/api")
app.include_router(prices_router, prefix="/api")
app.include_router(scanner_router, prefix="/api")
app.include_router(portfolio_router, prefix="/api")
app.include_router(regime_router, prefix="/api")

@app.on_event("startup")
async def startup_event():
    settings = get_settings()
    logger.info(f"Starting MarketPulse API. Configured with DB: {settings.SUPABASE_URL}")

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.get("/")
async def root():
    return {"message": "Welcome to MarketPulse API", "version": "1.0.0"}
