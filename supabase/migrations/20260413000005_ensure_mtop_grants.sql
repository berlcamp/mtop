-- Idempotent: safe to run if 20260413000004 was already applied.
-- Fixes "permission denied for table user_profiles" when the service_role
-- role lacks privileges on mtop tables (e.g. grants migration was skipped).

GRANT USAGE ON SCHEMA mtop TO authenticated, anon, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA mtop TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA mtop TO service_role;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA mtop TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA mtop
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA mtop
  GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA mtop
  GRANT USAGE ON SEQUENCES TO authenticated, service_role;
