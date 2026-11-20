"""
MarketPulse — Hot / Cold Tiering Market Data Archiving Engine
=============================================================
Architectural Pattern:
1. Cold Tier (Long-Term Deep History, 5-10+ Years):
   - Stored as highly-compressed Apache Parquet (ZSTD compression, ~90% space reduction).
   - Uploaded to Supabase Object Storage ('marketpulse-reports/archives/parquet/...').
   - High-throughput analytics, backtesting, and ML training via PyArrow / DuckDB.
   - Zero index bloat, zero performance degradation on PostgreSQL.

2. Hot Tier (Operational Window, 252 Sessions / ~1 Year):
   - Upserted directly to Supabase PostgreSQL ('price_history' and 'daily_indicators').
   - Feeds real-time frontend charts, live screener strategies, and daily monitoring.
"""

import io
import os
import sys
import logging
from pathlib import Path
from datetime import datetime, timezone, date
from typing import Dict, List, Optional, Tuple, Any

import pandas as pd
import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

from app.core.database import get_supabase_client
from app.services.report_storage import BUCKET_NAME
from app.services.indicators import compute_all_indicators

logger = logging.getLogger("market_data_archive")


def export_dataframe_to_parquet(
    df: pd.DataFrame,
    file_path: Optional[Path] = None,
    compression: str = "zstd"
) -> bytes:
    """
    Serializes a normalized OHLCV DataFrame into compressed Apache Parquet format.
    If file_path is provided, writes to disk. Returns the raw bytes.
    """
    if df.empty:
        raise ValueError("Cannot serialize empty DataFrame to Parquet.")

    # Standardize column types for maximum compression and consistency
    clean_df = df.copy()
    if not isinstance(clean_df.index, pd.DatetimeIndex) and 'date' in clean_df.columns:
        clean_df['date'] = pd.to_datetime(clean_df['date'])
        clean_df.set_index('date', inplace=True)

    if 'date' not in clean_df.columns:
        clean_df['date'] = clean_df.index.strftime('%Y-%m-%d')

    # Convert numeric columns safely
    for col in ['open', 'high', 'low', 'close', 'adj_close']:
        if col in clean_df.columns:
            clean_df[col] = pd.to_numeric(clean_df[col], errors='coerce').astype('float32')

    if 'volume' in clean_df.columns:
        clean_df['volume'] = pd.to_numeric(clean_df['volume'], errors='coerce').fillna(0).astype('float64')

    for col in ['symbol', 'market', 'source']:
        if col in clean_df.columns:
            clean_df[col] = clean_df[col].astype('category')

    table = pa.Table.from_pandas(clean_df, preserve_index=False)
    buffer = io.BytesIO()
    pq.write_table(table, buffer, compression=compression, flavor='spark')
    parquet_bytes = buffer.getvalue()

    if file_path:
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(parquet_bytes)
        logger.info(f"Saved Parquet archive ({len(clean_df)} rows, {len(parquet_bytes) / 1024:.1f} KB) to {file_path}")

    return parquet_bytes


def upload_parquet_archive_to_supabase(
    parquet_bytes: bytes,
    storage_path: str,
    bucket_name: str = BUCKET_NAME,
    client: Any = None
) -> str:
    """
    Uploads compressed Parquet bytes to Supabase Storage with idempotency.
    Returns the storage path.
    """
    sb_client = client or get_supabase_client()
    try:
        # Check if already exists; remove first if overwriting
        try:
            sb_client.storage.from_(bucket_name).remove([storage_path])
        except Exception:
            pass

        try:
            sb_client.storage.from_(bucket_name).upload(
                path=storage_path,
                file=parquet_bytes,
                file_options={"content-type": "application/vnd.apache.parquet", "upsert": "true"}
            )
        except Exception:
            sb_client.storage.from_(bucket_name).upload(
                path=storage_path,
                file=parquet_bytes,
                file_options={"content-type": "application/octet-stream", "upsert": "true"}
            )

        logger.info(f"✅ Successfully uploaded {len(parquet_bytes) / 1024:.1f} KB to Supabase Storage: {bucket_name}/{storage_path}")
        return storage_path
    except Exception as e:
        logger.error(f"Failed to upload Parquet archive to Supabase Storage '{storage_path}': {e}")
        raise RuntimeError(f"Storage upload failed: {e}")


def query_parquet_archive(
    source_path_or_bytes: Any,
    symbol: Optional[str] = None,
    start_date: Optional[str] = None
) -> pd.DataFrame:
    """
    Blazing-fast zero-database query against cold Parquet archives using PyArrow predicate pushdown.
    """
    filters = []
    if symbol:
        filters.append(('symbol', '==', symbol.strip().upper()))
    if start_date:
        filters.append(('date', '>=', start_date))

    table = pq.read_table(
        source_path_or_bytes,
        filters=filters if filters else None
    )
    df = table.to_pandas()
    if 'date' in df.columns:
        df['date'] = pd.to_datetime(df['date'])
        df.sort_values('date', inplace=True)
    return df


def upsert_hot_tier_to_database(
    df_all: pd.DataFrame,
    asset_id_map: Dict[str, str],
    max_hot_bars: int = 252,
    chunk_size: int = 500,
    client: Any = None
) -> int:
    """
    Splits multi-year historical data into the hot operational tier (last 252 bars per asset)
    and batch upserts clean price records into Supabase PostgreSQL.
    """
    sb_client = client or get_supabase_client()
    now_utc = datetime.now(timezone.utc).isoformat()
    rows_to_insert = []

    grouped = df_all.groupby('symbol')
    for sym, group in grouped:
        clean_sym = sym.replace('.IS', '').upper()
        asset_id = asset_id_map.get(clean_sym) or asset_id_map.get(f"{clean_sym}.IS") or asset_id_map.get(sym)
        if not asset_id:
            continue

        # Sort chronologically ascending and take up to max_hot_bars
        sorted_group = group.sort_values('date').tail(max_hot_bars)
        is_tefas = sorted_group.get('market', pd.Series()).iloc[0] == 'TEFAS' if len(sorted_group) > 0 else False

        for _, row in sorted_group.iterrows():
            d_val = row['date']
            d_str = d_val.strftime('%Y-%m-%d') if isinstance(d_val, (datetime, pd.Timestamp, date)) else str(d_val)[:10]

            rows_to_insert.append({
                "asset_id": asset_id,
                "date": d_str,
                "open": float(row['open']) if pd.notna(row.get('open')) else None,
                "high": float(row['high']) if pd.notna(row.get('high')) else None,
                "low": float(row['low']) if pd.notna(row.get('low')) else None,
                "close": float(row['close']),
                "adj_close": float(row.get('adj_close', row['close'])) if pd.notna(row.get('adj_close')) else None,
                "volume": int(row['volume']) if pd.notna(row.get('volume')) else None,
                "source": "tefas" if is_tefas else "yahoo",
                "observed_at": now_utc,
            })

    total_upserted = 0
    if rows_to_insert:
        for i in range(0, len(rows_to_insert), chunk_size):
            chunk = rows_to_insert[i:i + chunk_size]
            try:
                sb_client.table("price_history").upsert(
                    chunk,
                    on_conflict="asset_id,date"
                ).execute()
                total_upserted += len(chunk)
            except Exception as e:
                logger.error(f"Error upserting hot tier chunk {i}-{i+len(chunk)}: {e}")

    logger.info(f"✅ Upserted {total_upserted} hot-tier price bars into PostgreSQL price_history.")
    return total_upserted
