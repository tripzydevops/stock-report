from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_KEY: str
    SUPABASE_SERVICE_KEY: str
    GEMINI_API_KEY: str
    RISK_PER_TRADE_PCT: float = 1.0
    DEFAULT_ACCOUNT_SIZE_USD: float = 10000.0
    DEFAULT_ACCOUNT_SIZE_TRY: float = 300000.0

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

@lru_cache
def get_settings() -> Settings:
    return Settings()
