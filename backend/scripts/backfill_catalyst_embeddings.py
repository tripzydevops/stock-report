#!/usr/bin/env python3
"""
Backfill 384-dimensional Gemini Embeddings for Supabase market_catalysts table.
Enables vector similarity search across KAP company disclosures and macroeconomic catalysts.
"""
import os
import sys
import time
from pathlib import Path
import httpx

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from dotenv import load_dotenv
load_dotenv(backend_dir / ".env")

from app.core.database import get_supabase_client

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

def generate_embedding(text: str, api_key: str) -> list[float] | None:
    if not api_key or not text.strip():
        return None
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key={api_key}"
    try:
        resp = httpx.post(
            url,
            json={
                "content": {"parts": [{"text": text[:1000]}]},
                "outputDimensionality": 384
            },
            timeout=12.0
        )
        if resp.status_code == 200:
            return resp.json().get("embedding", {}).get("values")
        else:
            print(f"Embedding API error {resp.status_code}: {resp.text[:100]}")
    except Exception as e:
        print(f"HTTP exception generating embedding: {e}")
    return None

def main():
    if not GEMINI_API_KEY:
        print("Error: GEMINI_API_KEY not found in environment.")
        return

    client = get_supabase_client()
    print("Fetching market_catalysts records without embeddings...")
    res = client.table("market_catalysts").select("id, symbol, title, details, ai_takeaway").is_("embedding", "null").limit(300).execute()
    records = res.data or []
    print(f"Found {len(records)} catalysts needing vector embeddings.")

    if not records:
        print("All catalysts already have embeddings!")
        return

    success_count = 0
    for idx, rec in enumerate(records, 1):
        content = f"{rec.get('symbol', '')}: {rec.get('title', '')}. {rec.get('ai_takeaway', '')}"
        emb = generate_embedding(content, GEMINI_API_KEY)
        if emb and len(emb) == 384:
            try:
                client.table("market_catalysts").update({"embedding": emb}).eq("id", rec["id"]).execute()
                success_count += 1
                if idx % 10 == 0 or idx == len(records):
                    print(f"  ✓ Processed [{idx}/{len(records)}] catalysts...")
            except Exception as e:
                print(f"  ! DB update error for {rec['id']}: {e}")
        else:
            print(f"  ! Failed to generate embedding for {rec.get('symbol')}")
        time.sleep(0.15)  # Rate limiting buffer

    print(f"\nSuccessfully generated and stored {success_count} vector embeddings in Supabase!")

if __name__ == "__main__":
    main()
