-- Grant permissions on the mtop schema to Supabase roles
-- Without these, RLS policies alone won't work — the roles need
-- schema-level and table-level access first.

-- Allow authenticated and anon roles to use the schema
GRANT USAGE ON SCHEMA mtop TO authenticated, anon, service_role;

-- Grant table-level permissions to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA mtop TO authenticated;

-- Grant to service_role (used by admin client)
GRANT ALL ON ALL TABLES IN SCHEMA mtop TO service_role;

-- Ensure future tables in mtop schema also get these grants
ALTER DEFAULT PRIVILEGES IN SCHEMA mtop
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA mtop
  GRANT ALL ON TABLES TO service_role;

-- Grant sequence usage (for any serial/identity columns)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA mtop TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA mtop
  GRANT USAGE ON SEQUENCES TO authenticated, service_role;
