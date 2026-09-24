from functools import lru_cache
from supabase import create_client, Client
from app.core.config import get_settings

@lru_cache
def get_supabase_client() -> Client:
    settings = get_settings()
    key = settings.SUPABASE_KEY
    if settings.SUPABASE_SERVICE_KEY and not settings.SUPABASE_SERVICE_KEY.startswith("your-"):
        key = settings.SUPABASE_SERVICE_KEY
    return create_client(settings.SUPABASE_URL, key)

def insert_rows(table: str, data: list[dict] | dict) -> dict:
    client = get_supabase_client()
    return client.table(table).insert(data).execute()

def upsert_rows(table: str, data: list[dict] | dict, on_conflict: str = "id") -> dict:
    client = get_supabase_client()
    return client.table(table).upsert(data, on_conflict=on_conflict).execute()

def select_rows(table: str, filters: dict | None = None) -> dict:
    client = get_supabase_client()
    query = client.table(table).select("*")
    if filters:
        for key, value in filters.items():
            query = query.eq(key, value)
    return query.execute()

def execute_rpc(fn_name: str, params: dict | None = None) -> dict:
    client = get_supabase_client()
    if params is None:
        params = {}
    return client.rpc(fn_name, params).execute()
