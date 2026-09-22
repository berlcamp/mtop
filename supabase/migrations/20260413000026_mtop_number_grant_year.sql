-- MTOP numbers: AO-2026-00001, numbered by the year the permit was approved
-- *in Ozamiz*.
--
-- Two things were wrong, one visible and one that would only have shown up
-- once a year.
--
-- 1. The AO format. 20260413000016 already rewrote format_mtop_number() to
--    'AO-' || year || '-' || a 5-digit counter. It is re-asserted here so a
--    database that skipped that migration ends up in the same place -- the
--    function is replaced outright, so applying this twice is harmless.
--
-- 2. The year. extract(year FROM p_granted_at) reads a timestamptz in the
--    *session's* time zone, and Supabase sessions run in UTC. Ozamiz is
--    UTC+8, so an application approved at the counter between midnight and
--    8am on 1 January was numbered into the year that had just ended:
--    AO-2026-00001 for a permit granted in 2027. The same slip of eight hours
--    put granted_until a year early. Both now convert to Asia/Manila first,
--    which is what "the year of approval" means to the office issuing it.
--
-- Numbers already issued are left alone -- they are printed on paper in
-- someone's hands, and renumbering them would make the paper wrong.

-- ---------------------------------------------------------------------------
-- 1. The printed form of a number
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION mtop.format_mtop_number(p_year INTEGER, p_n BIGINT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'AO-' || p_year::text || '-' || lpad(p_n::text, 5, '0')
$$;

COMMENT ON FUNCTION mtop.format_mtop_number(INTEGER, BIGINT) IS
  'An MTOP number as it is printed: AO-2026-00001.';

-- ---------------------------------------------------------------------------
-- 2. When a grant happened, as the office reckons it
-- ---------------------------------------------------------------------------
-- The city works in Philippine time; the database stores UTC. Every date the
-- permit is reckoned by -- the year in its number, the day its validity runs
-- from -- goes through these, so the answer never depends on which hour of
-- the day the approver pressed the button.

CREATE OR REPLACE FUNCTION mtop.grant_date(p_at TIMESTAMPTZ)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT (p_at AT TIME ZONE 'Asia/Manila')::date
$$;

CREATE OR REPLACE FUNCTION mtop.grant_year(p_at TIMESTAMPTZ)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT extract(year FROM (p_at AT TIME ZONE 'Asia/Manila'))::int
$$;

GRANT EXECUTE ON FUNCTION mtop.grant_date(TIMESTAMPTZ) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION mtop.grant_year(TIMESTAMPTZ) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Never reissue a number that is already out there
-- ---------------------------------------------------------------------------
-- The counters table is the only thing standing between two franchises and
-- the same number. 20260413000012 seeded it from the old 2026-0001 format,
-- which no longer matches anything issued since; this re-seeds from both
-- forms, and only ever raises a counter.

INSERT INTO mtop.mtop_number_counters (year, last_value)
SELECT year, max(n) AS last_value
FROM (
  SELECT
    split_part(mtop_number, '-', 2)::int AS year,
    split_part(mtop_number, '-', 3)::int AS n
  FROM mtop.mtop_franchises
  WHERE mtop_number ~ '^AO-\d{4}-\d+$'

  UNION ALL

  SELECT
    split_part(mtop_number, '-', 1)::int AS year,
    split_part(mtop_number, '-', 2)::int AS n
  FROM mtop.mtop_franchises
  WHERE mtop_number ~ '^\d{4}-\d+$'
) issued
GROUP BY year
ON CONFLICT (year) DO UPDATE
  SET last_value = greatest(mtop.mtop_number_counters.last_value, excluded.last_value);

-- ---------------------------------------------------------------------------
-- 4. Number and date the grant in Philippine time
-- ---------------------------------------------------------------------------
-- Only the issue_number and extend_validity branches change -- they are the
-- two that turn the grant's timestamp into a year or a date. The rest is
-- unchanged from 20260413000023_unique_motor_chassis.sql.

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
      v_until := (mtop.grant_date(p_granted_at) + (p_validity_years || ' years')::interval)::date;
      IF v_number IS NULL THEN
        v_number := mtop.next_mtop_number(mtop.grant_year(p_granted_at));
      END IF;
      UPDATE mtop.mtop_franchises
      SET mtop_number = v_number,
          granted_until = v_until,
          franchise_status = 'active',
          updated_at = now()
      WHERE id = v_app.franchise_id;

    WHEN 'extend_validity' THEN
      v_until := (mtop.grant_date(p_granted_at) + (p_validity_years || ' years')::interval)::date;
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
