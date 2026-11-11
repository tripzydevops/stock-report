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
    print("Starting continuous catalyst vector embedding ingestion...")

    total_embedded = 0
    batch_size = 50

    while True:
        res = client.table("market_catalysts").select("id, symbol, title, details, ai_takeaway").is_("embedding", "null").limit(batch_size).execute()
        records = res.data or []
        if not records:
            break

        print(f"Processing batch of {len(records)} catalysts...")
        for idx, rec in enumerate(records, 1):
            details_snippet = f" Details: {rec['details'][:300]}" if rec.get('details') else ""
            content = f"{rec.get('symbol', '')}: {rec.get('title', '')}. {rec.get('ai_takeaway', '')}{details_snippet}"
            emb = generate_embedding(content, GEMINI_API_KEY)
            if emb and len(emb) == 384:
                try:
                    client.table("market_catalysts").update({"embedding": emb}).eq("id", rec["id"]).execute()
                    total_embedded += 1
                except Exception as e:
                    print(f"  ! DB update error for {rec['id']}: {e}")
            else:
                print(f"  ! Failed to generate embedding for {rec.get('symbol')}")
            time.sleep(0.12)  # Rate limiting buffer

        print(f"  ✓ Batch complete. Total processed so far: {total_embedded}")

    print(f"\nFinished: Successfully generated and stored {total_embedded} vector embeddings in Supabase!")

if __name__ == "__main__":
    main()
