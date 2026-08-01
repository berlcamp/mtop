-- CTMS contact number — configurable office contact shown to staff and
-- printed on issued documents. Stored as a JSONB string (the other settings
-- are JSONB numbers), empty until an admin fills it in.

INSERT INTO mtop.system_settings (key, value) VALUES
  ('ctms_contact_number', '""')
ON CONFLICT (key) DO NOTHING;
