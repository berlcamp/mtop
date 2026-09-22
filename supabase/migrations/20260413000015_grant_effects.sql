-- Implements the remaining five grant_effect branches. Until now
-- mtop.grant_franchise() only knew how to issue a number (new franchise) or
-- extend validity (renewal) — granting a change-unit, change-of-ownership,
-- annual confirmation, re-issuance or closure transaction silently ran the
-- renewal logic and wrongly advanced granted_until.
--
-- Two things are needed before the function can branch correctly:
--
--   1. A place to stage what a change-unit / change-of-ownership transaction
--      is asking for, captured at filing time and applied only on grant —
--      the whole point of the approval pipeline is that the identity change
--      doesn't take effect until the last stage says yes.
--   2. A franchise_status so closure has something to set and the lookup can
--      refuse to file new work against a closed franchise.

-- ---------------------------------------------------------------------------
-- 1. Franchise status
-- ---------------------------------------------------------------------------

CREATE TYPE mtop.franchise_status AS ENUM (
  'active', 'closed', 'abandoned', 'revoked', 'cancelled'
);

ALTER TABLE mtop.mtop_franchises
  ADD COLUMN IF NOT EXISTS franchise_status mtop.franchise_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  -- Annual Confirmation Slip and Re-Issuance don't touch granted_until or the
  -- MTOP number, so they need their own audit trail to be visible at all.
  ADD COLUMN IF NOT EXISTS last_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_reissued_at TIMESTAMPTZ;

COMMENT ON COLUMN mtop.mtop_franchises.franchise_status IS
  'Lifecycle state. Only mtop.grant_franchise() (close_franchise effect) sets '
  'this to closed today; abandoned/revoked/cancelled are reserved for future '
  'work (120-day abandonment sweep, 3-violation revocation) and are not yet '
  'set anywhere.';

CREATE INDEX IF NOT EXISTS idx_franchises_status ON mtop.mtop_franchises(franchise_status);

-- ---------------------------------------------------------------------------
-- 2. Pending change staged on the application, applied on grant
-- ---------------------------------------------------------------------------

ALTER TABLE mtop.mtop_applications
  ADD COLUMN IF NOT EXISTS new_motor_number TEXT,
  ADD COLUMN IF NOT EXISTS new_chassis_number TEXT,
  ADD COLUMN IF NOT EXISTS new_plate_number TEXT,
  ADD COLUMN IF NOT EXISTS new_applicant_name TEXT,
  ADD COLUMN IF NOT EXISTS new_applicant_address TEXT,
  ADD COLUMN IF NOT EXISTS new_contact_number TEXT;

COMMENT ON COLUMN mtop.mtop_applications.new_motor_number IS
  'Change-of-unit only: the incoming motor number, applied to the franchise '
  'by mtop.grant_franchise() (replace_unit effect) — not before.';
COMMENT ON COLUMN mtop.mtop_applications.new_applicant_name IS
  'Change-of-ownership only: the successor''s name, applied to the franchise '
  'by mtop.grant_franchise() (transfer_owner effect) — not before.';

-- ---------------------------------------------------------------------------
-- 3. History tables — every replace_unit / transfer_owner grant writes one row
-- ---------------------------------------------------------------------------

CREATE TABLE mtop.franchise_unit_history (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  franchise_id            UUID NOT NULL REFERENCES mtop.mtop_franchises(id) ON DELETE CASCADE,
  application_id          UUID REFERENCES mtop.mtop_applications(id),
  changed_by              UUID REFERENCES mtop.user_profiles(id),
  changed_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  previous_motor_number   TEXT,
  previous_chassis_number TEXT,
  previous_plate_number   TEXT,
  new_motor_number        TEXT NOT NULL,
  new_chassis_number      TEXT NOT NULL,
  new_plate_number        TEXT
);

CREATE TABLE mtop.franchise_ownership_history (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  franchise_id                UUID NOT NULL REFERENCES mtop.mtop_franchises(id) ON DELETE CASCADE,
  application_id              UUID REFERENCES mtop.mtop_applications(id),
  changed_by                  UUID REFERENCES mtop.user_profiles(id),
  changed_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  previous_applicant_name     TEXT NOT NULL,
  previous_applicant_address  TEXT,
  previous_contact_number     TEXT,
  new_applicant_name          TEXT NOT NULL,
  new_applicant_address       TEXT,
  new_contact_number          TEXT
);

ALTER TABLE mtop.franchise_unit_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE mtop.franchise_ownership_history ENABLE ROW LEVEL SECURITY;

-- Read-only for authenticated users. Rows are written exclusively by the
-- SECURITY DEFINER grant_franchise() function below, never by direct INSERT,
-- so there is no authenticated insert policy — the same pattern as
-- mtop_number_counters.
CREATE POLICY "Authenticated users can read franchise_unit_history"
  ON mtop.franchise_unit_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read franchise_ownership_history"
  ON mtop.franchise_ownership_history FOR SELECT TO authenticated USING (true);

GRANT SELECT ON mtop.franchise_unit_history, mtop.franchise_ownership_history TO authenticated;
GRANT ALL    ON mtop.franchise_unit_history, mtop.franchise_ownership_history TO service_role;

CREATE INDEX idx_franchise_unit_history_franchise_id      ON mtop.franchise_unit_history(franchise_id);
CREATE INDEX idx_franchise_ownership_history_franchise_id ON mtop.franchise_ownership_history(franchise_id);

-- ---------------------------------------------------------------------------
-- 4. grant_franchise() — now keyed on the application, branching on effect
-- ---------------------------------------------------------------------------
-- Takes the application id (not the franchise id) because it needs to read
-- the transaction's grant_effect and its staged new_* values. Everything it
-- writes is wrapped in the single call the trigger-less caller already makes
-- inside updateApplicationStatus, so one failure rolls back the whole grant.

CREATE OR REPLACE FUNCTION mtop.grant_franchise(
  p_application_id UUID,
  p_granted_at TIMESTAMPTZ,
  p_validity_years INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mtop, public
AS $$
DECLARE
  v_app      RECORD;
  v_franchise RECORD;
  v_number   TEXT;
  v_until    DATE;
BEGIN
  SELECT
    a.id, a.franchise_id, a.created_by,
    a.new_motor_number, a.new_chassis_number, a.new_plate_number,
    a.new_applicant_name, a.new_applicant_address, a.new_contact_number,
    t.grant_effect
  INTO v_app
  FROM mtop.mtop_applications a
  JOIN mtop.transaction_types t ON t.id = a.transaction_type_id
  WHERE a.id = p_application_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application % not found', p_application_id;
  END IF;

  SELECT * INTO v_franchise
  FROM mtop.mtop_franchises
  WHERE id = v_app.franchise_id
  FOR UPDATE;

  v_number := v_franchise.mtop_number;

  CASE v_app.grant_effect
    WHEN 'issue_number' THEN
      v_until := (p_granted_at::date + (p_validity_years || ' years')::interval)::date;
      IF v_number IS NULL THEN
        v_number := mtop.next_mtop_number(extract(year FROM p_granted_at)::int);
      END IF;
      UPDATE mtop.mtop_franchises
      SET mtop_number = v_number,
          granted_until = v_until,
          franchise_status = 'active',
          updated_at = now()
      WHERE id = v_app.franchise_id;

    WHEN 'extend_validity' THEN
      v_until := (p_granted_at::date + (p_validity_years || ' years')::interval)::date;
      UPDATE mtop.mtop_franchises
      SET granted_until = v_until,
          franchise_status = 'active',
          updated_at = now()
      WHERE id = v_app.franchise_id;

    WHEN 'replace_unit' THEN
      IF v_app.new_motor_number IS NULL OR v_app.new_chassis_number IS NULL THEN
        RAISE EXCEPTION
          'Cannot grant a change-of-unit application without a new motor and chassis number (application %)',
          p_application_id;
      END IF;

      INSERT INTO mtop.franchise_unit_history (
        franchise_id, application_id, changed_by,
        previous_motor_number, previous_chassis_number, previous_plate_number,
        new_motor_number, new_chassis_number, new_plate_number
      ) VALUES (
        v_app.franchise_id, p_application_id, v_app.created_by,
        v_franchise.motor_number, v_franchise.chassis_number, v_franchise.plate_number,
        v_app.new_motor_number, v_app.new_chassis_number,
        coalesce(v_app.new_plate_number, v_franchise.plate_number)
      );

      UPDATE mtop.mtop_franchises
      SET motor_number = v_app.new_motor_number,
          chassis_number = v_app.new_chassis_number,
          plate_number = coalesce(v_app.new_plate_number, plate_number),
          updated_at = now()
      WHERE id = v_app.franchise_id;

    WHEN 'transfer_owner' THEN
      IF v_app.new_applicant_name IS NULL THEN
        RAISE EXCEPTION
          'Cannot grant a change-of-ownership application without a new owner name (application %)',
          p_application_id;
      END IF;

      INSERT INTO mtop.franchise_ownership_history (
        franchise_id, application_id, changed_by,
        previous_applicant_name, previous_applicant_address, previous_contact_number,
        new_applicant_name, new_applicant_address, new_contact_number
      ) VALUES (
        v_app.franchise_id, p_application_id, v_app.created_by,
        v_franchise.applicant_name, v_franchise.applicant_address, v_franchise.contact_number,
        v_app.new_applicant_name, v_app.new_applicant_address, v_app.new_contact_number
      );

      UPDATE mtop.mtop_franchises
      SET applicant_name = v_app.new_applicant_name,
          applicant_address = coalesce(v_app.new_applicant_address, applicant_address),
          contact_number = coalesce(v_app.new_contact_number, contact_number),
          updated_at = now()
      WHERE id = v_app.franchise_id;

    WHEN 'confirm_year' THEN
      -- No change to number or validity — just a dated record that this
      -- franchise was confirmed, which feeds the ordinance's annual inventory.
      UPDATE mtop.mtop_franchises
      SET last_confirmed_at = p_granted_at,
          updated_at = now()
      WHERE id = v_app.franchise_id;

    WHEN 'reprint_permit' THEN
      -- Reprinting a lost permit changes nothing about the franchise itself.
      UPDATE mtop.mtop_franchises
      SET last_reissued_at = p_granted_at,
          updated_at = now()
      WHERE id = v_app.franchise_id;

    WHEN 'close_franchise' THEN
      -- granted_until and mtop_number are left untouched — they stay on the
      -- record as history. Nothing elsewhere yet keys off franchise_status
      -- 'closed' except the franchise lookup, which refuses to file new work
      -- against it.
      UPDATE mtop.mtop_franchises
      SET franchise_status = 'closed',
          closed_at = p_granted_at,
          updated_at = now()
      WHERE id = v_app.franchise_id;

    ELSE
      RAISE EXCEPTION 'Unhandled grant effect: %', v_app.grant_effect;
  END CASE;

  RETURN v_number;
END;
$$;

GRANT EXECUTE ON FUNCTION mtop.grant_franchise(UUID, TIMESTAMPTZ, INTEGER)
  TO authenticated, service_role;
