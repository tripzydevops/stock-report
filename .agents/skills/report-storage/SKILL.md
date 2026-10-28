---
name: report-storage
description: Standard procedure for generating, validating, storing, and indexing immutable report files in Supabase Storage and PostgreSQL. Use whenever exporting reports, creating storage buckets, or working with report_files.
---

# Report Storage & Immutable Registry Standard

## Purpose
Guarantees that every generated report is strictly immutable, validated, checksummed, stored in Supabase Storage, and registered in `report_files` with zero risk of silent overwrites or orphaned files.

---

## 1. Storage Path & Filename Conventions
All report artifacts uploaded to Supabase Storage bucket `marketpulse-reports` must follow deterministic, sub-second paths in UTC:
- **Bucket:** `marketpulse-reports`
- **Path Pattern:** `{year}/{month}/{day}/MarketPulse_{YYYY-MM-DDTHH-mm-ss-fff}.xlsx`
- **Sub-Second Precision:** Always format with `%Y-%m-%dT%H-%M-%S-%f` truncated to 23 chars (milliseconds) to prevent collisions during concurrent runs.

---

## 2. Pre-Upload Data Quality Gates
Before any upload to Supabase Storage, `validate_report_file()` must pass:
1. **File Existence:** File exists and size > 0 bytes.
2. **Workbook Health:** `openpyxl.load_workbook(read_only=True)` opens without zip archive corruption.
3. **Required Sheets:** Contains required tabs (`📊 Dashboard`, `🎯 Trade Signals`, `📅 Price History`).
4. **Row Count Threshold:** Must contain $\ge 5$ total data rows across sheets.
5. **SHA-256 Checksum:** Deterministic hash computed before upload.

---

## 3. Strict Immutability & Safe Flag Transition
1. **Never Overwrite:**
   - Always upload with `file_options={"upsert": "false"}`.
   - If a path collision occurs, the storage engine must reject it rather than silently overwriting historical data.
2. **Insert-First `is_latest` Toggle:**
   - **Step 1:** Insert the new report into `report_files` with `is_latest = True`.
   - **Step 2:** Retrieve the created `new_id`.
   - **Step 3:** Update all older reports of that `report_type` where `id != new_id` to `is_latest = False`.
   - *Rationale:* There is never a zero-latest window even if an exception occurs mid-execution.
3. **Orphan Cleanup:**
   - If the database registration fails after the storage upload succeeds, immediately catch the error and remove the uploaded file from the bucket:
     ```python
     client.storage.from_(BUCKET_NAME).remove([storage_path])
     ```

---

## 4. Presigned Download URLs
- Reports in `marketpulse-reports` are private.
- Never expose direct raw public URLs. Always generate short-lived signed URLs:
  ```python
  client.storage.from_(BUCKET_NAME).create_signed_url(storage_path, expires_in=3600)
  ```
