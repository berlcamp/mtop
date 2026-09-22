-- Body number and plate number identify one tricycle, citywide.
--
-- Two active franchises may not carry the same body number, and may not carry
-- the same plate number. Both are how the city and the public tell one unit
-- from another -- a duplicate body number means two motorcabs answering to the
-- same number on the street, and a duplicate plate means the record is simply
-- wrong about one of them.
--
-- Enforced here rather than in the server action so it holds for every writer:
-- the filing flow, a change of unit applied at grant, a correction typed into
-- Studio, or a script.
--
-- Scoped to ACTIVE franchises, like the one-franchise-per-operator rule. A
-- closed, abandoned, revoked or cancelled franchise releases its body number
-- for reassignment and stops standing in the way of the plate, which by then
-- has usually moved to another owner anyway.

-- ---------------------------------------------------------------------------
-- 1. Shared, IMMUTABLE helper (required for use in an index)
-- ---------------------------------------------------------------------------

-- Upper-cases and drops everything that is not a letter or a digit:
-- " ab-1234 " -> "AB1234", so "AB 1234", "ab-1234" and "AB1234" are one plate.
-- Punctuation and spacing in these fields is clerical, not part of the number.
-- Mirrored in TypeScript by normalizeUnitIdentifier() in
-- src/lib/unit-identifier.ts -- keep the two in step.
CREATE OR REPLACE FUNCTION mtop.normalize_unit_identifier(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT regexp_replace(upper(p_value), '[^[:alnum:]]', '', 'g')
$$;

COMMENT ON FUNCTION mtop.normalize_unit_identifier(TEXT) IS
  'Comparison form of a body or plate number: upper-cased, punctuation and '
  'spacing removed. Not fuzzy -- "AB1234" and "AB12345" stay distinct.';

-- ---------------------------------------------------------------------------
-- 2. Refuse to install the rule over data that already breaks it
-- ---------------------------------------------------------------------------
-- A bare "duplicate key value violates unique constraint" from the CREATE
-- INDEX below would not say which numbers are doubled up, and these have to be
-- resolved by someone who knows which unit is which.

DO $$
DECLARE
  v_bodies TEXT;
  v_plates TEXT;
BEGIN
  SELECT string_agg(format('%s (%s)', v, holders), '; ')
  INTO v_bodies
  FROM (
    SELECT
      mtop.normalize_unit_identifier(tricycle_body_number) AS v,
      string_agg(coalesce(mtop_number, '(ungranted)') || ' ' || applicant_name, ', ') AS holders
    FROM mtop.mtop_franchises
    WHERE franchise_status = 'active'
      AND mtop.normalize_unit_identifier(tricycle_body_number) <> ''
    GROUP BY 1
    HAVING count(*) > 1
  ) d;

  IF v_bodies IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot enforce unique body numbers: these are held by more than one active franchise -> %. Fix or close the duplicates first -- supabase/scripts/report-duplicate-unit-identifiers.sql lists them in full.',
      v_bodies;
  END IF;

  SELECT string_agg(format('%s (%s)', v, holders), '; ')
  INTO v_plates
  FROM (
    SELECT
      mtop.normalize_unit_identifier(plate_number) AS v,
      string_agg(coalesce(mtop_number, '(ungranted)') || ' ' || applicant_name, ', ') AS holders
    FROM mtop.mtop_franchises
    WHERE franchise_status = 'active'
      AND mtop.normalize_unit_identifier(plate_number) <> ''
    GROUP BY 1
    HAVING count(*) > 1
  ) d;

  IF v_plates IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot enforce unique plate numbers: these are held by more than one active franchise -> %. Fix or close the duplicates first -- supabase/scripts/report-duplicate-unit-identifiers.sql lists them in full.',
      v_plates;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. The rules
-- ---------------------------------------------------------------------------
-- Partial, so a blank or missing number never collides with another blank --
-- older franchises were registered without a plate on file -- and so leaving
-- 'active' releases the number. normalize_unit_identifier is STRICT, so NULL
-- normalises to NULL and the predicate drops the row.

CREATE UNIQUE INDEX idx_franchises_unique_body_number
  ON mtop.mtop_franchises (mtop.normalize_unit_identifier(tricycle_body_number))
  WHERE franchise_status = 'active'
    AND mtop.normalize_unit_identifier(tricycle_body_number) <> '';

COMMENT ON INDEX mtop.idx_franchises_unique_body_number IS
  'One body number per active franchise. Matching ignores case and punctuation.';

CREATE UNIQUE INDEX idx_franchises_unique_plate_number
  ON mtop.mtop_franchises (mtop.normalize_unit_identifier(plate_number))
  WHERE franchise_status = 'active'
    AND mtop.normalize_unit_identifier(plate_number) <> '';

COMMENT ON INDEX mtop.idx_franchises_unique_plate_number IS
  'One plate number per active franchise. Matching ignores case and punctuation.';

-- ---------------------------------------------------------------------------
-- 4. Lookup used by the app to name the franchise already holding the number
-- ---------------------------------------------------------------------------
-- Both arguments are optional, so the forms can ask about one field as it is
-- typed and the server action can ask about both in a single round trip.
-- Each probe hits the matching unique index above.

CREATE OR REPLACE FUNCTION mtop.find_unit_identifier_conflict(
  p_body_number TEXT DEFAULT NULL,
  p_plate_number TEXT DEFAULT NULL,
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
  SELECT 'tricycle_body_number'::TEXT, f.id, f.mtop_number, f.applicant_name, f.tricycle_body_number
  FROM mtop.mtop_franchises f
  WHERE f.franchise_status = 'active'
    AND (p_exclude_franchise_id IS NULL OR f.id <> p_exclude_franchise_id)
    AND mtop.normalize_unit_identifier(p_body_number) <> ''
    AND mtop.normalize_unit_identifier(f.tricycle_body_number)
        = mtop.normalize_unit_identifier(p_body_number)
  LIMIT 1

  UNION ALL

  SELECT 'plate_number'::TEXT, f.id, f.mtop_number, f.applicant_name, f.plate_number
  FROM mtop.mtop_franchises f
  WHERE f.franchise_status = 'active'
    AND (p_exclude_franchise_id IS NULL OR f.id <> p_exclude_franchise_id)
    AND mtop.normalize_unit_identifier(p_plate_number) <> ''
    AND mtop.normalize_unit_identifier(f.plate_number)
        = mtop.normalize_unit_identifier(p_plate_number)
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION mtop.find_unit_identifier_conflict(TEXT, TEXT, UUID)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Give the replace_unit grant a readable failure
-- ---------------------------------------------------------------------------
-- A change of unit stages its new plate at filing time and applies it here, so
-- another franchise can take that plate in between. Without this the unique
-- index still blocks the grant, but the approver would see a raw constraint
-- violation instead of being told who holds the plate. Only the replace_unit
-- branch changes; the rest is unchanged from 20260413000020_barangay_purok.sql.

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
