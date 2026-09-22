-- Motor and chassis numbers are unique too.
--
-- 20260413000021 made the body and plate numbers unique across active
-- franchises. The motor and chassis numbers are a stronger claim still: they
-- are stamped on the unit by its manufacturer and never change, so the same
-- pair cannot honestly appear on two franchises at once. Until now the only
-- guard was in createNewFranchiseApplication, which refused a motor+chassis
-- PAIR that already existed and nothing else — a filing that reused one motor
-- number with a different chassis went straight through, as did every other
-- write path: a change of unit applied at grant, an administrator's
-- correction, a script.
--
-- Same shape as migration 21, deliberately: the same normalisation helper,
-- partial indexes over ACTIVE franchises only, and a pre-flight that refuses
-- to install the rule over data that already breaks it.
--
-- Scoped to active franchises for the same reason as the others. A unit
-- legitimately moves to a new franchise when the old one closes — the vehicle
-- is sold with its papers — and the closed record must not stand in the way.

-- ---------------------------------------------------------------------------
-- 1. Refuse to install the rule over data that already breaks it
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_motors  TEXT;
  v_chassis TEXT;
BEGIN
  SELECT string_agg(format('%s (%s)', v, holders), '; ')
  INTO v_motors
  FROM (
    SELECT
      mtop.normalize_unit_identifier(motor_number) AS v,
      string_agg(coalesce(mtop_number, '(ungranted)') || ' ' || applicant_name, ', ') AS holders
    FROM mtop.mtop_franchises
    WHERE franchise_status = 'active'
      AND mtop.normalize_unit_identifier(motor_number) <> ''
    GROUP BY 1
    HAVING count(*) > 1
  ) d;

  IF v_motors IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot enforce unique motor numbers: these are held by more than one active franchise -> %. Fix or close the duplicates first -- supabase/scripts/report-duplicate-unit-identifiers.sql lists them in full.',
      v_motors;
  END IF;

  SELECT string_agg(format('%s (%s)', v, holders), '; ')
  INTO v_chassis
  FROM (
    SELECT
      mtop.normalize_unit_identifier(chassis_number) AS v,
      string_agg(coalesce(mtop_number, '(ungranted)') || ' ' || applicant_name, ', ') AS holders
    FROM mtop.mtop_franchises
    WHERE franchise_status = 'active'
      AND mtop.normalize_unit_identifier(chassis_number) <> ''
    GROUP BY 1
    HAVING count(*) > 1
  ) d;

  IF v_chassis IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot enforce unique chassis numbers: these are held by more than one active franchise -> %. Fix or close the duplicates first -- supabase/scripts/report-duplicate-unit-identifiers.sql lists them in full.',
      v_chassis;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. The rules
-- ---------------------------------------------------------------------------
-- Partial, like the body and plate indexes: motor_number and chassis_number
-- are NOT NULL on the table, but a row carrying an empty string must not
-- collide with every other empty string.

CREATE UNIQUE INDEX IF NOT EXISTS idx_franchises_unique_motor_number
  ON mtop.mtop_franchises (mtop.normalize_unit_identifier(motor_number))
  WHERE franchise_status = 'active'
    AND mtop.normalize_unit_identifier(motor_number) <> '';

COMMENT ON INDEX mtop.idx_franchises_unique_motor_number IS
  'One motor number per active franchise. Matching ignores case and punctuation.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_franchises_unique_chassis_number
  ON mtop.mtop_franchises (mtop.normalize_unit_identifier(chassis_number))
  WHERE franchise_status = 'active'
    AND mtop.normalize_unit_identifier(chassis_number) <> '';

COMMENT ON INDEX mtop.idx_franchises_unique_chassis_number IS
  'One chassis number per active franchise. Matching ignores case and punctuation.';

-- ---------------------------------------------------------------------------
-- 3. Teach the conflict lookup about the two new fields
-- ---------------------------------------------------------------------------
-- Dropped and recreated rather than overloaded: two functions of this name
-- whose named arguments overlap would make every PostgREST call ambiguous.
-- The new parameters are added before p_exclude_franchise_id and all default
-- to NULL, so callers passing only body and plate keep working.

DROP FUNCTION IF EXISTS mtop.find_unit_identifier_conflict(TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION mtop.find_unit_identifier_conflict(
  p_body_number TEXT DEFAULT NULL,
  p_plate_number TEXT DEFAULT NULL,
  p_motor_number TEXT DEFAULT NULL,
  p_chassis_number TEXT DEFAULT NULL,
  p_exclude_franchise_id UUID DEFAULT NULL
)
RETURNS TABLE (
  field TEXT,
  id UUID,
  mtop_number TEXT,
  applicant_name TEXT,
  value TEXT
)
LANGUAGE sql
STABLE
AS $$
  (SELECT 'tricycle_body_number'::TEXT, f.id, f.mtop_number, f.applicant_name, f.tricycle_body_number
  FROM mtop.mtop_franchises f
  WHERE f.franchise_status = 'active'
    AND (p_exclude_franchise_id IS NULL OR f.id <> p_exclude_franchise_id)
    AND mtop.normalize_unit_identifier(p_body_number) <> ''
    AND mtop.normalize_unit_identifier(f.tricycle_body_number)
        = mtop.normalize_unit_identifier(p_body_number)
  LIMIT 1)

  UNION ALL

  (SELECT 'plate_number'::TEXT, f.id, f.mtop_number, f.applicant_name, f.plate_number
  FROM mtop.mtop_franchises f
  WHERE f.franchise_status = 'active'
    AND (p_exclude_franchise_id IS NULL OR f.id <> p_exclude_franchise_id)
    AND mtop.normalize_unit_identifier(p_plate_number) <> ''
    AND mtop.normalize_unit_identifier(f.plate_number)
        = mtop.normalize_unit_identifier(p_plate_number)
  LIMIT 1)

  UNION ALL

  (SELECT 'motor_number'::TEXT, f.id, f.mtop_number, f.applicant_name, f.motor_number
  FROM mtop.mtop_franchises f
  WHERE f.franchise_status = 'active'
    AND (p_exclude_franchise_id IS NULL OR f.id <> p_exclude_franchise_id)
    AND mtop.normalize_unit_identifier(p_motor_number) <> ''
    AND mtop.normalize_unit_identifier(f.motor_number)
        = mtop.normalize_unit_identifier(p_motor_number)
  LIMIT 1)

  UNION ALL

  (SELECT 'chassis_number'::TEXT, f.id, f.mtop_number, f.applicant_name, f.chassis_number
  FROM mtop.mtop_franchises f
  WHERE f.franchise_status = 'active'
    AND (p_exclude_franchise_id IS NULL OR f.id <> p_exclude_franchise_id)
    AND mtop.normalize_unit_identifier(p_chassis_number) <> ''
    AND mtop.normalize_unit_identifier(f.chassis_number)
        = mtop.normalize_unit_identifier(p_chassis_number)
  LIMIT 1)
$$;

GRANT EXECUTE ON FUNCTION mtop.find_unit_identifier_conflict(TEXT, TEXT, TEXT, TEXT, UUID)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Give the replace_unit grant a readable failure for these two as well
-- ---------------------------------------------------------------------------
-- A change of unit stages the new motor and chassis at filing and applies them
-- here, so another franchise can take either in between — exactly the race the
-- plate already had. Only that branch changes; the rest is unchanged from
-- 20260413000021_unique_unit_identifiers.sql.

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
  v_app       RECORD;
  v_franchise RECORD;
  v_number    TEXT;
  v_until     DATE;
  v_holder    TEXT;
BEGIN
  SELECT
    a.id, a.franchise_id, a.created_by,
    a.new_motor_number, a.new_chassis_number, a.new_plate_number,
    a.new_applicant_name, a.new_applicant_address, a.new_contact_number,
    a.new_barangay, a.new_purok,
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

      -- One plate per active franchise: the incoming unit's plate must not
      -- already be on someone else's record.
      IF v_app.new_plate_number IS NOT NULL THEN
        SELECT coalesce(f.mtop_number, '(ungranted)') || ' - ' || f.applicant_name
        INTO v_holder
        FROM mtop.mtop_franchises f
        WHERE f.franchise_status = 'active'
          AND f.id <> v_app.franchise_id
          AND mtop.normalize_unit_identifier(f.plate_number)
              = mtop.normalize_unit_identifier(v_app.new_plate_number)
        LIMIT 1;

        IF v_holder IS NOT NULL THEN
          RAISE EXCEPTION
            'Plate number % is already on another active franchise (%). Correct the plate before granting this change of unit.',
            v_app.new_plate_number, v_holder;
        END IF;
      END IF;

      -- Motor and chassis are the unit's permanent identity, stamped by the
      -- manufacturer, so the incoming unit must not already be on another
      -- active franchise either. Staged at filing and applied here, so the
      -- same race the plate has applies to them.
      SELECT coalesce(f.mtop_number, '(ungranted)') || ' - ' || f.applicant_name
      INTO v_holder
      FROM mtop.mtop_franchises f
      WHERE f.franchise_status = 'active'
        AND f.id <> v_app.franchise_id
        AND mtop.normalize_unit_identifier(f.motor_number)
            = mtop.normalize_unit_identifier(v_app.new_motor_number)
      LIMIT 1;

      IF v_holder IS NOT NULL THEN
        RAISE EXCEPTION
          'Motor number % is already on another active franchise (%). Correct it before granting this change of unit.',
          v_app.new_motor_number, v_holder;
      END IF;

      SELECT coalesce(f.mtop_number, '(ungranted)') || ' - ' || f.applicant_name
      INTO v_holder
      FROM mtop.mtop_franchises f
      WHERE f.franchise_status = 'active'
        AND f.id <> v_app.franchise_id
        AND mtop.normalize_unit_identifier(f.chassis_number)
            = mtop.normalize_unit_identifier(v_app.new_chassis_number)
      LIMIT 1;

      IF v_holder IS NOT NULL THEN
        RAISE EXCEPTION
          'Chassis number % is already on another active franchise (%). Correct it before granting this change of unit.',
          v_app.new_chassis_number, v_holder;
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

      -- One franchise per operator: the successor must not already hold one.
      SELECT coalesce(f.mtop_number, 'an application in progress')
      INTO v_holder
      FROM mtop.mtop_franchises f
      WHERE f.franchise_status = 'active'
        AND f.id <> v_app.franchise_id
        AND mtop.normalize_operator_name(f.applicant_name)
            = mtop.normalize_operator_name(v_app.new_applicant_name)
      LIMIT 1;

      IF v_holder IS NOT NULL THEN
        RAISE EXCEPTION
          '% already holds an active franchise (%). An operator may only hold one franchise, so this transfer cannot be granted.',
          v_app.new_applicant_name, v_holder;
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
          -- Staged barangay/purok move together with the composed line, so the
          -- structured address never describes the previous owner.
          barangay = coalesce(v_app.new_barangay, barangay),
          purok = CASE
                    WHEN v_app.new_barangay IS NOT NULL THEN v_app.new_purok
                    ELSE purok
                  END,
          contact_number = coalesce(v_app.new_contact_number, contact_number),
          updated_at = now()
      WHERE id = v_app.franchise_id;

    WHEN 'confirm_year' THEN
      UPDATE mtop.mtop_franchises
      SET last_confirmed_at = p_granted_at,
          updated_at = now()
      WHERE id = v_app.franchise_id;

    WHEN 'reprint_permit' THEN
      UPDATE mtop.mtop_franchises
      SET last_reissued_at = p_granted_at,
          updated_at = now()
      WHERE id = v_app.franchise_id;

    WHEN 'close_franchise' THEN
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
