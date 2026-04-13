-- System Settings table for configurable values (e.g. permit validity)
CREATE TABLE mtop.system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES mtop.user_profiles(id),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE mtop.system_settings ENABLE ROW LEVEL SECURITY;

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
  ('renewal_window_days', '90');

-- Index for efficient expiration queries on granted applications
CREATE INDEX idx_applications_granted_at ON mtop.mtop_applications(granted_at);
