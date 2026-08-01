-- System Settings table for configurable values (e.g. permit validity)
-- Written to be re-runnable: this file shares the 20260413000006 prefix with
-- create_documents_bucket.sql and can be missed when applying migrations by hand.
CREATE TABLE IF NOT EXISTS mtop.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES mtop.user_profiles(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE mtop.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read system_settings" ON mtop.system_settings;
DROP POLICY IF EXISTS "Authenticated users can insert system_settings" ON mtop.system_settings;
DROP POLICY IF EXISTS "Authenticated users can update system_settings" ON mtop.system_settings;

CREATE POLICY "Authenticated users can read system_settings"
  ON mtop.system_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert system_settings"
  ON mtop.system_settings FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update system_settings"
  ON mtop.system_settings FOR UPDATE
  TO authenticated
  USING (true);

-- Seed default values
INSERT INTO mtop.system_settings (key, value) VALUES
  ('permit_validity_years', '3'),
  ('renewal_window_days', '90')
ON CONFLICT (key) DO NOTHING;

-- Index for efficient expiration queries on granted applications
CREATE INDEX IF NOT EXISTS idx_applications_granted_at
  ON mtop.mtop_applications(granted_at);

-- The schema-wide grants in 20260413000005 only cover tables that existed when
-- they ran, so grant explicitly in case this table is created afterwards.
GRANT SELECT, INSERT, UPDATE, DELETE ON mtop.system_settings TO authenticated;
GRANT ALL ON mtop.system_settings TO service_role;
