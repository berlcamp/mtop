-- Wipes every franchise/application/transaction record so you can test the
-- flow again from a clean slate.
--
-- This is NOT a migration — it doesn't live in supabase/migrations and the
-- Supabase CLI will never run it automatically. Run it by hand, once, when
-- you actually want to clear test data:
--
--   supabase db query -f supabase/scripts/reset-sample-data.sql --linked
--
-- (--linked requires `supabase login` + `supabase link` first; without that,
-- paste it into the Supabase Studio SQL editor instead.) It is irreversible
-- and only ever meant for a dev/staging project — never run this against
-- production.
--
-- Left untouched (reference/config data, not "sample data"):
--   mtop.transaction_types, mtop.requirements, mtop.transaction_requirements,
--   mtop.roles, mtop.permissions, mtop.role_permissions,
--   mtop.user_profiles, mtop.user_roles, mtop.system_settings

BEGIN;

-- Cascades through mtop_applications, mtop_application_requirements,
-- mtop_inspections, mtop_assessments, mtop_payments, approval_logs,
-- franchise_unit_history and franchise_ownership_history — every one of them
-- has a foreign key back to mtop_franchises or mtop_applications.
TRUNCATE TABLE mtop.mtop_franchises CASCADE;

-- The audit trail is deliberately NOT tied to mtop_franchises by a foreign
-- key — an audit row has to outlive the record it describes — so the CASCADE
-- above leaves it behind. Clear it here instead, or the reset ships you a log
-- full of changes to franchises that no longer exist.
TRUNCATE TABLE mtop.audit_logs;

-- Restarts MTOP numbering from 1 for every year, so the next grant issues
-- AO-<year>-00001 again instead of continuing where the sample data left off.
-- Comment this line out if you'd rather keep counting up.
TRUNCATE TABLE mtop.mtop_number_counters;

-- Uncomment if your test negative-list entries should go too — it's kept by
-- default since it's usually maintained as real config, not sample data.
-- TRUNCATE TABLE mtop.mtop_negative_list;

COMMIT;

-- Files uploaded to the mtop-documents storage bucket (document scans,
-- owner/driver photos) are NOT deleted by this script — Postgres TRUNCATE
-- only touches table rows, not Storage objects. Clear those separately from
-- Supabase Studio → Storage → mtop-documents, or via the Storage API, if you
-- want a fully clean bucket too.
