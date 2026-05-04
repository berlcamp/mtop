-- Remove the office concept. Roles are now task-aligned and don't need
-- office attribution; nothing in the renewal workflow keys off office.

ALTER TABLE mtop.user_profiles
  DROP COLUMN IF EXISTS office_id;

DROP TABLE IF EXISTS mtop.offices CASCADE;
