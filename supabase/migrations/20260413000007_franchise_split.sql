-- Split franchise identity (stable MTOP number + owner/tricycle) from
-- per-cycle renewal applications. See CLAUDE.md → "Franchise vs Application".
-- Safe to run when mtop_applications has no data (project has no production data yet).

-- 1. Sequence + helper functions

CREATE SEQUENCE IF NOT EXISTS mtop.mtop_number_seq START 1;

CREATE OR REPLACE FUNCTION mtop.format_mtop_number(n BIGINT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'MTOP-' || lpad(n::text, 5, '0')
$$;

-- 2. Franchise table

CREATE TABLE IF NOT EXISTS mtop.mtop_franchises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mtop_number TEXT UNIQUE,
  applicant_name TEXT NOT NULL,
  applicant_address TEXT,
  contact_number TEXT,
  tricycle_body_number TEXT,
  plate_number TEXT,
  motor_number TEXT NOT NULL,
  chassis_number TEXT NOT NULL,
  route TEXT,
  granted_until DATE,
  created_by UUID REFERENCES mtop.user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE mtop.mtop_franchises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read franchises" ON mtop.mtop_franchises;
DROP POLICY IF EXISTS "Authenticated users can insert franchises" ON mtop.mtop_franchises;
DROP POLICY IF EXISTS "Authenticated users can update franchises" ON mtop.mtop_franchises;

CREATE POLICY "Authenticated users can read franchises"
  ON mtop.mtop_franchises FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert franchises"
  ON mtop.mtop_franchises FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update franchises"
  ON mtop.mtop_franchises FOR UPDATE TO authenticated USING (true);

-- 3. Reshape mtop_applications: drop snapshot columns, add franchise_id FK.
-- This deletes any pre-existing applications because we have no way to back-fill
-- a franchise_id without inventing fake franchises. Project has no real data yet.

TRUNCATE TABLE mtop.mtop_applications CASCADE;

DROP INDEX IF EXISTS mtop.idx_applications_applicant_name;
DROP INDEX IF EXISTS mtop.idx_applications_application_number;

ALTER TABLE mtop.mtop_applications
  DROP COLUMN IF EXISTS application_number,
  DROP COLUMN IF EXISTS applicant_name,
  DROP COLUMN IF EXISTS applicant_address,
  DROP COLUMN IF EXISTS contact_number,
  DROP COLUMN IF EXISTS tricycle_body_number,
  DROP COLUMN IF EXISTS plate_number,
  DROP COLUMN IF EXISTS motor_number,
  DROP COLUMN IF EXISTS chassis_number,
  DROP COLUMN IF EXISTS route;

ALTER TABLE mtop.mtop_applications
  ADD COLUMN IF NOT EXISTS franchise_id UUID
    REFERENCES mtop.mtop_franchises(id) ON DELETE CASCADE;

ALTER TABLE mtop.mtop_applications
  ALTER COLUMN franchise_id SET NOT NULL;

ALTER TABLE mtop.mtop_applications
  DROP CONSTRAINT IF EXISTS mtop_applications_franchise_id_fiscal_year_key;
ALTER TABLE mtop.mtop_applications
  ADD CONSTRAINT mtop_applications_franchise_id_fiscal_year_key
    UNIQUE (franchise_id, fiscal_year);

-- 4. Indexes

CREATE INDEX IF NOT EXISTS idx_franchises_mtop_number       ON mtop.mtop_franchises(mtop_number);
CREATE INDEX IF NOT EXISTS idx_franchises_applicant_name    ON mtop.mtop_franchises(applicant_name);
CREATE INDEX IF NOT EXISTS idx_franchises_motor_number      ON mtop.mtop_franchises(motor_number);
CREATE INDEX IF NOT EXISTS idx_franchises_chassis_number    ON mtop.mtop_franchises(chassis_number);
CREATE INDEX IF NOT EXISTS idx_franchises_granted_until     ON mtop.mtop_franchises(granted_until);
CREATE INDEX IF NOT EXISTS idx_applications_franchise_id    ON mtop.mtop_applications(franchise_id);

-- 5. Atomic grant function — assigns next MTOP number on first grant
--    and advances granted_until to grant_date + validity_years (anniversary).

CREATE OR REPLACE FUNCTION mtop.grant_franchise(
  p_franchise_id UUID,
  p_granted_at TIMESTAMPTZ,
  p_validity_years INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mtop, public
AS $$
DECLARE
  v_number TEXT;
  v_until  DATE;
BEGIN
  v_until := (p_granted_at::date + (p_validity_years || ' years')::interval)::date;

  SELECT mtop_number INTO v_number
  FROM mtop.mtop_franchises
  WHERE id = p_franchise_id
  FOR UPDATE;

  IF v_number IS NULL THEN
    v_number := mtop.format_mtop_number(nextval('mtop.mtop_number_seq'));
    UPDATE mtop.mtop_franchises
    SET mtop_number = v_number,
        granted_until = v_until,
        updated_at = now()
    WHERE id = p_franchise_id;
  ELSE
    UPDATE mtop.mtop_franchises
    SET granted_until = v_until,
        updated_at = now()
    WHERE id = p_franchise_id;
  END IF;

  RETURN v_number;
END;
$$;

GRANT EXECUTE ON FUNCTION mtop.grant_franchise(UUID, TIMESTAMPTZ, INTEGER)
  TO authenticated, service_role;
