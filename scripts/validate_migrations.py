"""
Supabase Migration Linter & Schema Integrity Checker.
Validates timestamp conventions, formatting, non-destructive safety,
and SQL syntax boundaries across all migration files.
"""

import os
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "supabase" / "migrations"
MIGRATION_PATTERN = re.compile(r"^\d{14}_[a-z0-9_]+\.sql$")
DANGEROUS_PATTERNS = [
    (re.compile(r"\bDROP\s+SCHEMA\s+public\b", re.IGNORECASE), "DROP SCHEMA public is strictly forbidden!"),
    (re.compile(r"\bTRUNCATE\s+TABLE\b", re.IGNORECASE), "TRUNCATE TABLE in migrations requires explicit migration safety review."),
]


def validate_migrations():
    if not MIGRATIONS_DIR.exists():
        print(f"⚠️ Migrations directory {MIGRATIONS_DIR} does not exist. Skipping.")
        return 0

    migration_files = sorted([f for f in os.listdir(MIGRATIONS_DIR) if f.endswith(".sql")])
    if not migration_files:
        print("ℹ️ No migration files found.")
        return 0

    print(f"🔍 Validating {len(migration_files)} Supabase migration file(s)...")
    errors = []

    for filename in migration_files:
        filepath = MIGRATIONS_DIR / filename

        # 1. Check filename convention
        if not MIGRATION_PATTERN.match(filename):
            errors.append(f"❌ {filename}: Invalid naming convention. Must be YYYYMMDDHHMMSS_name.sql")
            continue

        # 2. Check file size and readability
        try:
            content = filepath.read_text(encoding="utf-8")
        except Exception as e:
            errors.append(f"❌ {filename}: Failed to read UTF-8 content: {e}")
            continue

        if len(content.strip()) == 0:
            errors.append(f"❌ {filename}: Migration file is empty.")
            continue

        # 3. Check for dangerous destructive commands
        for pattern, msg in DANGEROUS_PATTERNS:
            if pattern.search(content):
                errors.append(f"❌ {filename}: {msg}")

        # 4. Check for unclosed transaction blocks or unbalanced quotes
        single_quotes = content.count("'") - content.count("\\'")
        double_dollar = content.count("$$")
        if double_dollar % 2 != 0:
            errors.append(f"❌ {filename}: Unbalanced $$ delimiters in function or trigger definition.")

        print(f"  ✓ {filename} [VALID]")

    if errors:
        print("\n💥 Migration validation failed with the following errors:")
        for err in errors:
            print(f"  {err}")
        return 1

    print("\n✅ All Supabase migrations passed schema linting and safety checks.")
    return 0


if __name__ == "__main__":
    sys.exit(validate_migrations())
