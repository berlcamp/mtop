-- New grants use the registered plate and an officer-selected DATE. Existing
-- granted rows and MTOP numbers are untouched. permit_validity_years remains
-- available for legacy card display; it no longer controls grant validity.
ALTER TABLE mtop.mtop_applications ADD COLUMN date_issued DATE;
ALTER TABLE mtop.mtop_applications ADD COLUMN expiration_date DATE;

CREATE OR REPLACE FUNCTION mtop.plate_expiration(p_issued DATE, p_plate TEXT)
RETURNS DATE LANGUAGE plpgsql IMMUTABLE SET search_path = mtop, public AS $$
DECLARE
  v_plate TEXT := mtop.normalize_unit_identifier(p_plate);
  v_digit TEXT;
  v_month INTEGER;
  v_year INTEGER;
  v_candidate DATE;
  v_lower DATE;
  v_upper DATE;
BEGIN
  IF p_issued IS NULL THEN RAISE EXCEPTION 'Date Issued is required'; END IF;
  v_digit := right(v_plate, 1);
  IF v_digit IS NULL OR v_digit !~ '^[0-9]$' THEN
    RAISE EXCEPTION 'Registered plate number is missing or has no final digit';
  END IF;
  v_month := CASE WHEN v_digit IN ('1','2','3') THEN 12
                  WHEN v_digit IN ('4','5','6') THEN 2 ELSE 3 END;
  -- PostgreSQL calendar-year interval arithmetic clamps Feb 29 to Feb 28.
  v_lower := (p_issued + interval '2 years')::date;
  v_upper := (p_issued + interval '3 years')::date;
  FOR v_year IN REVERSE extract(year FROM v_upper)::integer..extract(year FROM v_lower)::integer LOOP
    v_candidate := (make_date(v_year, v_month, 1) + interval '1 month - 1 day')::date;
    IF v_candidate BETWEEN v_lower AND v_upper THEN RETURN v_candidate; END IF;
  END LOOP;
  RAISE EXCEPTION 'No plate month-end falls within the two-to-three-year permit term';
END;
$$;

-- All grant entries, including direct table writes, must meet the same rule.
CREATE OR REPLACE FUNCTION mtop.validate_plate_grant()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = mtop, public AS $$
DECLARE
  v_effect TEXT;
  v_plate TEXT;
  v_existing_expiration DATE;
BEGIN
  IF NEW.status <> 'granted' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Only an application awaiting approval can be granted';
  END IF;
  IF OLD.status = 'granted' THEN RETURN NEW; END IF;
  IF OLD.status <> 'for_approval' THEN
    RAISE EXCEPTION 'Only an application awaiting approval can be granted';
  END IF;
  IF auth.role() = 'authenticated' AND NOT EXISTS (
    SELECT 1 FROM mtop.user_roles ur
    JOIN mtop.role_permissions rp ON rp.role_id = ur.role_id
    JOIN mtop.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = auth.uid() AND p.code = 'application.grant'
  ) THEN
    RAISE EXCEPTION 'You do not have permission to grant applications';
  END IF;
  IF NEW.date_issued IS NULL THEN RAISE EXCEPTION 'Date Issued is required'; END IF;
  SELECT t.grant_effect::text, f.plate_number, f.granted_until
    INTO v_effect, v_plate, v_existing_expiration
  FROM mtop.transaction_types t
  JOIN mtop.mtop_franchises f ON f.id = NEW.franchise_id
  WHERE t.id = NEW.transaction_type_id
  FOR UPDATE OF f;
  IF NOT FOUND THEN RAISE EXCEPTION 'Grant transaction or franchise is missing'; END IF;
  IF v_effect IN ('issue_number', 'extend_validity') THEN
    NEW.expiration_date := mtop.plate_expiration(NEW.date_issued, v_plate);
  ELSE
    NEW.expiration_date := v_existing_expiration;
  END IF;
  NEW.granted_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_plate_grant_before_insert
  BEFORE INSERT ON mtop.mtop_applications FOR EACH ROW
  EXECUTE FUNCTION mtop.validate_plate_grant();
CREATE TRIGGER validate_plate_grant_before_update
  BEFORE UPDATE OF status ON mtop.mtop_applications FOR EACH ROW
  EXECUTE FUNCTION mtop.validate_plate_grant();

CREATE OR REPLACE FUNCTION mtop.protect_issued_dates()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = mtop, public AS $$
BEGIN
  IF OLD.status = 'granted' AND (
    NEW.date_issued IS DISTINCT FROM OLD.date_issued OR
    NEW.expiration_date IS DISTINCT FROM OLD.expiration_date OR
    NEW.granted_at IS DISTINCT FROM OLD.granted_at
  ) THEN
    RAISE EXCEPTION 'Granted issuance, expiration, and audit dates cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_issued_dates_before_update
  BEFORE UPDATE OF date_issued, expiration_date, granted_at
  ON mtop.mtop_applications FOR EACH ROW
  EXECUTE FUNCTION mtop.protect_issued_dates();

-- The grant routine below is copied from the current 20260413000030 version.
-- Only its two validity assignments and selected date_issued field change.

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
    a.id, a.franchise_id, a.created_by, a.date_issued,
    a.new_motor_number, a.new_chassis_number, a.new_plate_number,
    a.new_applicant_name, a.new_applicant_address, a.new_contact_number,
    a.new_barangay, a.new_purok,
    a.new_last_name, a.new_first_name, a.new_middle_name, a.new_suffix,
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
      v_until := mtop.plate_expiration(v_app.date_issued, v_franchise.plate_number);
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
      v_until := mtop.plate_expiration(v_app.date_issued, v_franchise.plate_number);
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
          -- The successor's name parts replace the previous owner's outright,
          -- NULLs included: an application filed before the name was split
          -- has none, and keeping the old owner's would contradict
          -- applicant_name.
          last_name = v_app.new_last_name,
          first_name = v_app.new_first_name,
          middle_name = v_app.new_middle_name,
          suffix = v_app.new_suffix,
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

-- A single database transaction records the decision, its grant effects, and
-- the approval log. An UPDATE predicate serializes duplicate grant attempts.
CREATE OR REPLACE FUNCTION mtop.approve_and_grant(
  p_application_id UUID, p_date_issued DATE, p_remarks TEXT DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = mtop, public AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM mtop.user_roles ur
    JOIN mtop.role_permissions rp ON rp.role_id = ur.role_id
    JOIN mtop.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = v_actor AND p.code = 'application.grant'
  ) THEN
    RAISE EXCEPTION 'You do not have permission to grant applications';
  END IF;
  IF p_date_issued IS NULL THEN RAISE EXCEPTION 'Date Issued is required'; END IF;
  UPDATE mtop.mtop_applications
  SET status = 'granted', date_issued = p_date_issued, granted_at = now()
  WHERE id = p_application_id AND status = 'for_approval';
  IF NOT FOUND THEN RAISE EXCEPTION 'Application is no longer awaiting approval'; END IF;
  INSERT INTO mtop.approval_logs (application_id, stage, action, actor_id, remarks)
  VALUES (p_application_id, 'granted', 'approved', v_actor, nullif(trim(p_remarks), ''));
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION mtop.approve_and_grant(UUID, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mtop.approve_and_grant(UUID, DATE, TEXT) TO authenticated;
