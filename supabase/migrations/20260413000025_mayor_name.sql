-- The signatory on issued documents.
--
-- The confirmation slip prints the mayor's name under "APPROVED:", so it has
-- to outlive the administration that is in office today: a new mayor is a
-- settings change, not a deployment. Stored as a JSONB string like
-- ctms_contact_number, seeded with the incumbent so existing slips print
-- unchanged.
--
-- The title is deliberately not a setting. "City Mayor" is the office, and it
-- does not change when its holder does.

INSERT INTO mtop.system_settings (key, value) VALUES
  ('mayor_name', '"ATTY. SAM NORMAN G. FUENTES"')
ON CONFLICT (key) DO NOTHING;
