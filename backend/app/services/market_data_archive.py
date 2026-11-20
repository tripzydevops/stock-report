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


def validate_and_sanitize_ohlcv_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Validates and sanitizes OHLCV data according to core market microstructure invariants:
    - close > 0 and is finite
    - If high and low present and non-null: high >= low - 1e-5
    - If high and open present and non-null: high >= open - 1e-5
    - If high present and non-null: high >= close - 1e-5
    - If low and open present and non-null: low <= open + 1e-5
    - If low present and non-null: low <= close + 1e-5
    - If volume present: volume >= 0
    Preserves true null values without fabricating synthetic prices.
    Drops rows violating physical price laws.
    """
    if df is None or df.empty or 'close' not in df.columns:
        return df

    work = df.copy()
    c = pd.to_numeric(work['close'], errors='coerce')
    valid = (c > 0) & np.isfinite(c)

    has_open = 'open' in work.columns
    has_high = 'high' in work.columns
    has_low = 'low' in work.columns
    has_vol = 'volume' in work.columns

    o = pd.to_numeric(work['open'], errors='coerce') if has_open else None
    h = pd.to_numeric(work['high'], errors='coerce') if has_high else None
    l = pd.to_numeric(work['low'], errors='coerce') if has_low else None
    v = pd.to_numeric(work['volume'], errors='coerce') if has_vol else None

    if has_high and has_low:
        valid = valid & (h.isna() | l.isna() | (h >= l - 1e-5))
    if has_high and has_open:
        valid = valid & (h.isna() | o.isna() | (h >= o - 1e-5))
    if has_high:
        valid = valid & (h.isna() | (h >= c - 1e-5))
    if has_low and has_open:
        valid = valid & (l.isna() | o.isna() | (l <= o + 1e-5))
    if has_low:
        valid = valid & (l.isna() | (l <= c + 1e-5))
    if has_vol:
        valid = valid & (v.isna() | (v >= 0))

    dropped = len(work) - int(valid.sum())
    if dropped > 0:
        logger.warning(f"Sanitizer dropped {dropped} invalid OHLCV rows violating price invariants.")

    return work[valid].copy()


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


class HotTierUpsertResult(dict):
    """Result container for hot tier upsert operations with int-coercion backward compatibility."""
    def __init__(self, upserted: int = 0, failed: int = 0, total_attempted: int = 0, errors: Optional[List[str]] = None):
        super().__init__(
            upserted=upserted,
            failed=failed,
            total_attempted=total_attempted,
            errors=errors or []
        )
        self.upserted = upserted
        self.failed = failed
        self.total_attempted = total_attempted
        self.errors = errors or []

    def __int__(self):
        return self.upserted

    def __index__(self):
        return self.upserted

    def __eq__(self, other):
        if isinstance(other, int):
            return self.upserted == other
        return super().__eq__(other)


def upload_parquet_archive_to_supabase(
    parquet_bytes: bytes,
    storage_path: str,
    bucket_name: str = BUCKET_NAME,
    client: Any = None
) -> str:
    """
    Uploads compressed Parquet bytes to Supabase Storage with atomic overwrite (upsert).
    Does NOT remove the file first, preventing data loss on failed uploads.
    Returns the storage path.
    """
    sb_client = client or get_supabase_client()
    try:
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


def export_symbol_archive(
    df: pd.DataFrame,
    market: str,
    symbol: str,
    base_dir: Optional[Path] = None,
    compression: str = "zstd"
) -> Tuple[Path, bytes]:
    """
    Exports a single asset's historical data into a partitioned Parquet archive:
    data/archives/{market}/{symbol}.parquet
    """
    clean_sym = symbol.replace('.IS', '').upper()
    target_dir = (base_dir or (Path(__file__).resolve().parent.parent.parent.parent / "data" / "archives")) / market.lower()
    target_path = target_dir / f"{clean_sym}.parquet"
    raw_bytes = export_dataframe_to_parquet(df, file_path=target_path, compression=compression)
    return target_path, raw_bytes


def upload_symbol_archive_to_supabase(
    parquet_bytes: bytes,
    market: str,
    symbol: str,
    bucket_name: str = BUCKET_NAME,
    client: Any = None
) -> str:
    """
    Uploads a single asset's Parquet archive to partitioned Supabase Storage path:
    archives/parquet/{market}/{symbol}.parquet
    """
    clean_sym = symbol.replace('.IS', '').upper()
    storage_path = f"archives/parquet/{market.lower()}/{clean_sym}.parquet"
    return upload_parquet_archive_to_supabase(
        parquet_bytes=parquet_bytes,
        storage_path=storage_path,
        bucket_name=bucket_name,
        client=client
    )


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
) -> HotTierUpsertResult:
    """
    Splits multi-year historical data into the hot operational tier (last 252 bars per asset)
    and batch upserts clean price records into Supabase PostgreSQL.
    Tracks exact failure counts and error details.
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

            open_val = row.get('open')
            high_val = row.get('high')
            low_val = row.get('low')
            adj_val = row.get('adj_close')
            vol_val = row.get('volume')

            rows_to_insert.append({
                "asset_id": asset_id,
                "date": d_str,
                "open": float(open_val) if pd.notna(open_val) and np.isfinite(open_val) else None,
                "high": float(high_val) if pd.notna(high_val) and np.isfinite(high_val) else None,
                "low": float(low_val) if pd.notna(low_val) and np.isfinite(low_val) else None,
                "close": float(row['close']),
                "adj_close": float(adj_val) if pd.notna(adj_val) and np.isfinite(adj_val) else None,
                "volume": int(float(vol_val)) if pd.notna(vol_val) and np.isfinite(vol_val) else None,
                "source": "tefas" if is_tefas else "yahoo",
                "observed_at": now_utc,
            })

    total_upserted = 0
    total_failed = 0
    errors: List[str] = []

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
                err_msg = f"Error upserting hot tier chunk {i}-{i+len(chunk)}: {e}"
                logger.error(err_msg)
                total_failed += len(chunk)
                errors.append(err_msg)

    logger.info(f"✅ Hot-tier upsert complete: {total_upserted} succeeded, {total_failed} failed.")
    return HotTierUpsertResult(
        upserted=total_upserted,
        failed=total_failed,
        total_attempted=len(rows_to_insert),
        errors=errors
    )
