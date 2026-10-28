---
name: supabase-migration
description: Standard procedure for creating, testing, and managing Supabase PostgreSQL schema migrations. Use whenever adding tables, modifying columns, creating indexes, or configuring Row Level Security (RLS) policies.
---

# Supabase Migration Standard Operating Procedure

## Purpose
Enforces immutable, reproducible, and verifiable database schema evolution in Supabase PostgreSQL without causing production regressions or data loss.

---

## 1. Migration File Conventions
- **Location:** All migrations must reside in `supabase/migrations/`.
- **Naming Pattern:** `YYYYMMDDHHMMSS_<descriptive_name>.sql` using 14-digit UTC timestamp:
  - Example: `20261027000000_report_files_and_movements.sql`
- **Synchronized Schema:** Always mirror table definitions in `database/schema.sql` so the global repository schema stays up to date.

---

## 2. DDL Best Practices (Strict Rules)
1. **Never Mutate Applied Migrations:** Once a migration has been committed to `main` and executed against the remote database, **NEVER** edit that file. Always generate a new forward migration file.
2. **Idempotence by Default:** Use `IF NOT EXISTS` for all `CREATE TABLE`, `CREATE INDEX`, and `ADD COLUMN` statements.
3. **Foreign Keys with Deletion Rules:** Always declare explicit `ON DELETE CASCADE` (for child tables like `price_snapshots`) or `ON DELETE SET NULL` (for optional foreign references).
4. **Appropriate Precision:**
   - Financial prices & amounts: `NUMERIC(18,6)` (never float).
   - Percentages & R:R ratios: `NUMERIC(8,4)` or `NUMERIC(10,4)`.
   - Timestamps: `TIMESTAMPTZ` with `DEFAULT NOW()`.
   - Primary Keys: `UUID PRIMARY KEY DEFAULT gen_random_uuid()`.

---

## 3. Row Level Security (RLS) Template
Every public table must have RLS explicitly enabled and documented:

```sql
-- 1. Enable RLS
ALTER TABLE public.example_table ENABLE ROW LEVEL SECURITY;

-- 2. Public Shared Market Data (Read-only for all users)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read example_table' AND tablename = 'example_table') THEN
        CREATE POLICY "Public read example_table" ON public.example_table FOR SELECT USING (true);
    END IF;
END $$;

-- 3. Private User Data (Isolated by user_id)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'User isolation example_table' AND tablename = 'example_table') THEN
        CREATE POLICY "User isolation example_table" ON public.example_table
            FOR ALL USING (auth.uid() = user_id OR user_id IS NULL);
    END IF;
END $$;
```

---

## 4. Verification Checklist
Before committing a migration:
- [ ] Schema tested via Supabase MCP tool (`execute_sql`).
- [ ] No syntax errors on indexes or foreign keys.
- [ ] Rollback steps documented in comment block at the bottom of the SQL file.
- [ ] Verified that `database/schema.sql` is in sync with the migration changes.
