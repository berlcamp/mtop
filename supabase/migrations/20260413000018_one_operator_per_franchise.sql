-- Franchise ownership: only one operator is allowed per franchise.
--
-- Two rules, enforced in the database so they hold regardless of which code
-- path writes the row:
--
--   1. One franchise per operator. A person may hold at most one ACTIVE
--      franchise. Closed / abandoned / revoked / cancelled franchises do not
--      count against them, so surrendering a franchise frees the operator to
--      apply again.
--   2. One operator per franchise. The operator field names a single person —
--      co-ownership ("JUAN & MARIA", "JUAN / PEDRO") is rejected.
--
-- Matching is on a normalised form of the name, so casing, extra spaces and
-- punctuation don't let the same person through twice. It does NOT resolve
-- middle initials or nicknames — "JUAN DELA CRUZ" and "JUAN P. DELA CRUZ"
-- are still two different operators as far as this rule is concerned.

-- ---------------------------------------------------------------------------
-- 1. Shared, IMMUTABLE helpers (required for use in an index / CHECK)
-- ---------------------------------------------------------------------------

-- Upper-cases, turns punctuation into spaces, then collapses runs of
-- whitespace: "  juan  dela-cruz " -> "JUAN DELA CRUZ".
-- Mirrored in TypeScript by normalizeOperatorName() in src/lib/operator-name.ts
-- — keep the two in step.
CREATE OR REPLACE FUNCTION mtop.normalize_operator_name(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT btrim(
    regexp_replace(
      upper(regexp_replace(p_name, '[^[:alnum:][:space:]]', ' ', 'g')),
      '\s+', ' ', 'g'
    )
  )
$$;

-- True when the name looks like it lists more than one person. Commas are
-- deliberately allowed: "DELA CRUZ, JUAN" is a surname-first single name.
-- Mirrored by findCoOwnerMarker() in src/lib/operator-name.ts.
CREATE OR REPLACE FUNCTION mtop.operator_name_has_co_owner(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT p_name ~* '(&|/|\yAND\y|\yET\s+AL\y)'
$$;

-- ---------------------------------------------------------------------------
-- 2. Refuse to install the rules over data that already breaks them
-- ---------------------------------------------------------------------------
-- Failing here with the offending names is far more useful than a bare
-- "duplicate key" from CREATE UNIQUE INDEX further down.

DO $$
DECLARE
  v_dupes TEXT;
  v_multi TEXT;
BEGIN
  SELECT string_agg(format('%s (%s active franchises)', n, c), '; ')
  INTO v_dupes
  FROM (
    SELECT mtop.normalize_operator_name(applicant_name) AS n, count(*) AS c
    FROM mtop.mtop_franchises
    WHERE franchise_status = 'active'
    GROUP BY 1
    HAVING count(*) > 1
  ) d;

  IF v_dupes IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot enforce one-franchise-per-operator: these operators already hold more than one active franchise -> %. Close or reassign the extras first, or clear test data with supabase/scripts/reset-sample-data.sql.',
      v_dupes;
  END IF;

  SELECT string_agg(applicant_name, '; ')
  INTO v_multi
  FROM mtop.mtop_franchises
  WHERE mtop.operator_name_has_co_owner(applicant_name);

  IF v_multi IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot enforce one-operator-per-franchise: these franchises name more than one operator -> %. Edit them to a single person first.',
      v_multi;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Rule 1 — one active franchise per operator
-- ---------------------------------------------------------------------------
-- A partial unique index, so a closed/abandoned/revoked franchise stops
-- counting against its former operator the moment it leaves 'active'.

CREATE UNIQUE INDEX idx_franchises_one_active_per_operator
  ON mtop.mtop_franchises (mtop.normalize_operator_name(applicant_name))
  WHERE franchise_status = 'active';

COMMENT ON INDEX mtop.idx_franchises_one_active_per_operator IS
  'Enforces one active franchise per operator. Name matching is normalised '
  '(case, spacing, punctuation) but not fuzzy.';

-- ---------------------------------------------------------------------------
-- 4. Rule 2 — one operator per franchise
-- ---------------------------------------------------------------------------

ALTER TABLE mtop.mtop_franchises
  ADD CONSTRAINT mtop_franchises_single_operator
    CHECK (NOT mtop.operator_name_has_co_owner(applicant_name));

-- The successor name staged on a change-of-ownership has to satisfy the same
-- rule, or the transfer would smuggle a co-owner in at grant time.
ALTER TABLE mtop.mtop_applications
  ADD CONSTRAINT mtop_applications_single_new_operator
    CHECK (
      new_applicant_name IS NULL
      OR NOT mtop.operator_name_has_co_owner(new_applicant_name)
    );

-- ---------------------------------------------------------------------------
-- 5. Lookup used by the app to name the blocking franchise
-- ---------------------------------------------------------------------------
-- Hits idx_franchises_one_active_per_operator, so it stays a single index
-- probe rather than scanning every franchise from the application layer.

CREATE OR REPLACE FUNCTION mtop.find_operator_active_franchise(
  p_name TEXT,
  p_exclude_franchise_id UUID DEFAULT NULL
)
RETURNS TABLE (id UUID, mtop_number TEXT, applicant_name TEXT)
LANGUAGE sql
STABLE
AS $$
  SELECT f.id, f.mtop_number, f.applicant_name
  FROM mtop.mtop_franchises f
  WHERE f.franchise_status = 'active'
    AND (p_exclude_franchise_id IS NULL OR f.id <> p_exclude_franchise_id)
    AND mtop.normalize_operator_name(f.applicant_name)
        = mtop.normalize_operator_name(p_name)
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION mtop.find_operator_active_franchise(TEXT, UUID)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Give the transfer_owner grant a readable failure
-- ---------------------------------------------------------------------------
-- Without this the unique index still blocks the transfer, but the approver
-- would see a raw constraint violation instead of being told who already holds
-- a franchise. Only the transfer_owner branch changes; the rest of the
-- function is unchanged from 20260413000015_grant_effects.sql.

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
