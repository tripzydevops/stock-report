#!/usr/bin/env python3
"""
Backfill 384-dimensional Gemini Embeddings for Supabase market_catalysts table.
Enables vector similarity search across KAP company disclosures and macroeconomic catalysts.

Features:
- Failure quarantine with configurable retry cap (prevents infinite loops on corrupt rows).
- Hard max runtime and consecutive empty iteration guards.
- Structured summary report.
"""
import os
import sys
import time
import logging
from collections import defaultdict
from pathlib import Path
from typing import Optional, List, Dict, Set, Any
import httpx

backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

from dotenv import load_dotenv
load_dotenv(backend_dir / ".env")

from app.core.database import get_supabase_client

logger = logging.getLogger(__name__)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")


def generate_embedding(text: str, api_key: str, client: Optional[httpx.Client] = None) -> Optional[List[float]]:
    """Generates a 384-dimensional vector embedding using Google Gemini API."""
    if not api_key or not text or not text.strip():
        return None
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key={api_key}"
    payload = {
        "content": {"parts": [{"text": text[:1000]}]},
        "outputDimensionality": 384
    }
    try:
        if client:
            resp = client.post(url, json=payload, timeout=12.0)
        else:
            with httpx.Client(timeout=12.0) as http_client:
                resp = http_client.post(url, json=payload)

        if resp.status_code == 200:
            values = resp.json().get("embedding", {}).get("values")
            if isinstance(values, list) and len(values) == 384:
                return values
        else:
            logger.warning(f"Embedding API error {resp.status_code}: {resp.text[:100]}")
    except Exception as e:
        logger.warning(f"HTTP exception generating embedding: {e}")
    return None


def run_embedding_backfill(
    client=None,
    api_key: Optional[str] = None,
    batch_size: int = 50,
    max_retries: int = 3,
    max_runtime_seconds: int = 300,
    max_consecutive_empty: int = 3,
    embed_fn=None
) -> Dict[str, Any]:
    """
    Runs the embedding backfill with failure quarantine and deterministic termination guards.
    """
    start_time = time.time()
    if client is None:
        client = get_supabase_client()
    if api_key is None:
        api_key = GEMINI_API_KEY
    if embed_fn is None:
        embed_fn = lambda txt: generate_embedding(txt, api_key)

    if not api_key:
        return {
            "status": "error",
            "message": "GEMINI_API_KEY not found in environment.",
            "total_embedded": 0,
            "quarantined": []
        }

    total_embedded = 0
    quarantined_ids: Set[str] = set()
    quarantine_log: List[Dict[str, Any]] = []
    retry_counts: Dict[str, int] = defaultdict(int)

    consecutive_empty = 0
    offset = 0

    print("Starting continuous catalyst vector embedding ingestion...")

    while True:
        # Check max runtime guard
        elapsed = time.time() - start_time
        if elapsed >= max_runtime_seconds:
            print(f"⏱️ Max runtime guard reached ({elapsed:.1f}s >= {max_runtime_seconds}s). Exiting gracefully.")
            break

        # Query batch of catalysts missing embeddings
        query = client.table("market_catalysts").select("id, symbol, title, details, ai_takeaway").is_("embedding", "null")
        res = query.range(offset, offset + batch_size - 1).execute()
        records = res.data or []

        if not records:
            print("No more pending records without embeddings.")
            break

        # Filter out already quarantined IDs in memory
        usable_records = [r for r in records if r["id"] not in quarantined_ids]

        if not usable_records:
            consecutive_empty += 1
            offset += batch_size
            print(f"All {len(records)} records in current window quarantined. Advancing offset to {offset} (consecutive empty: {consecutive_empty}).")
            if consecutive_empty >= max_consecutive_empty:
                print(f"Reached {max_consecutive_empty} consecutive passes without progress. Halting.")
                break
            continue

        consecutive_empty = 0
        batch_success = 0
        print(f"Processing batch of {len(usable_records)} catalysts (offset={offset})...")

        for rec in usable_records:
            rec_id = str(rec["id"])
            symbol = rec.get("symbol", "")
            title = rec.get("title", "")
            details = rec.get("details", "")
            ai_takeaway = rec.get("ai_takeaway", "")

            details_snippet = f" Details: {details[:300]}" if details else ""
            content = f"{symbol}: {title}. {ai_takeaway}{details_snippet}"

            emb = embed_fn(content)

            if emb and len(emb) == 384:
                try:
                    client.table("market_catalysts").update({"embedding": emb}).eq("id", rec_id).execute()
                    total_embedded += 1
                    batch_success += 1
                except Exception as e:
                    retry_counts[rec_id] += 1
                    print(f"  ! DB update error for {symbol} ({rec_id}): {e}")
                    if retry_counts[rec_id] >= max_retries:
                        quarantined_ids.add(rec_id)
                        quarantine_log.append({"id": rec_id, "symbol": symbol, "reason": f"DB update failed: {e}"})
                        print(f"  🛑 Quarantined {symbol} ({rec_id}) after {max_retries} failed DB updates.")
            else:
                retry_counts[rec_id] += 1
                print(f"  ! Failed to generate embedding for {symbol} ({rec_id}), retry {retry_counts[rec_id]}/{max_retries}")
                if retry_counts[rec_id] >= max_retries:
                    quarantined_ids.add(rec_id)
                    quarantine_log.append({"id": rec_id, "symbol": symbol, "reason": f"Embedding generation failed after {max_retries} attempts"})
                    print(f"  🛑 Quarantined {symbol} ({rec_id}) after {max_retries} failed embedding attempts.")

            time.sleep(0.08)  # Polite API pacing

        print(f"  ✓ Batch complete. Newly embedded: {batch_success}. Total embedded: {total_embedded}. Quarantined: {len(quarantined_ids)}")

        # If zero records succeeded in this batch, advance offset to avoid getting stuck
        if batch_success == 0:
            offset += batch_size

    total_duration = time.time() - start_time
    print(f"\n==========================================")
    print(f"Embedding Backfill Summary:")
    print(f"  Status: SUCCESS")
    print(f"  Duration: {total_duration:.2f}s")
    print(f"  Total Embedded: {total_embedded}")
    print(f"  Quarantined: {len(quarantined_ids)}")
    if quarantine_log:
        for q in quarantine_log:
            print(f"    - {q['symbol']} ({q['id']}): {q['reason']}")
    print(f"==========================================\n")

    return {
        "status": "success",
        "total_embedded": total_embedded,
        "quarantined_count": len(quarantined_ids),
        "quarantined": quarantine_log,
        "duration_seconds": round(total_duration, 2)
    }


def main():
    report = run_embedding_backfill()
    if report.get("status") != "success":
        print(f"Backfill finished with error: {report.get('message')}")
        sys.exit(1)


if __name__ == "__main__":
    main()
