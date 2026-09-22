-- Structured operator address: a barangay picked from the city's own list,
-- plus a free-text purok.
--
-- applicant_address was one free-text line, so the same place arrived as
-- "Purok 5 Banadero", "P-5, Bañadero, Ozamiz City" and "banadero" — which
-- makes a per-barangay count impossible and prints unpredictably on the
-- permit. The barangay is now a foreign key into a seeded table and the purok
-- is its own column.
--
-- applicant_address stays, holding the composed, human-readable line. Every
-- reader (the franchise card, search, reports, the audit trail) keeps working
-- unchanged, and rows registered before this migration keep the free-text
-- address they were given with a NULL barangay.

-- ---------------------------------------------------------------------------
-- 1. The city's barangays, as reference data
-- ---------------------------------------------------------------------------
-- A table rather than a TypeScript array, for the same reason the requirement
-- checklist and the association registry are tables: correcting a name is an
-- UPDATE, not a deploy. Keyed by name so a franchise row carries the readable
-- value and no join is needed to compose an address.

CREATE TABLE mtop.barangays (
  name       TEXT PRIMARY KEY,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE mtop.barangays IS
  'The 51 barangays of Ozamiz City, spelled as the PSA''s PSGC lists them '
  '(PSGC 1004210000). Referenced by name from mtop_franchises.barangay.';

ALTER TABLE mtop.barangays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read barangays"
  ON mtop.barangays FOR SELECT TO authenticated USING (true);

GRANT SELECT ON mtop.barangays TO authenticated;
GRANT ALL    ON mtop.barangays TO service_role;

-- PSGC spellings: "Banadero" and "Diguan" carry no tilde or hyphen there,
-- though both are also written Bañadero / Digu-an locally. Aguada, Banadero
-- and 50th District are the three poblacion barangays; the "(Pob.)" suffix
-- PSGC appends is dropped, since nobody writes it on a permit application.
INSERT INTO mtop.barangays (name) VALUES
  ('50th District'), ('Aguada'), ('Bacolod'), ('Bagakay'), ('Balintawak'),
  ('Banadero'), ('Baybay San Roque'), ('Baybay Santa Cruz'),
  ('Baybay Triunfo'), ('Bongbong'), ('Calabayan'), ('Capucao C.'),
  ('Capucao P.'), ('Carangan'), ('Carmen'), ('Catadman-Manabay'),
  ('Cavinte'), ('Cogon'), ('Dalapang'), ('Diguan'), ('Dimaluna'),
  ('Doña Consuelo'), ('Embargo'), ('Gala'), ('Gango'), ('Gotokan Daku'),
  ('Gotokan Diot'), ('Guimad'), ('Guingona'), ('Kinuman Norte'),
  ('Kinuman Sur'), ('Labinay'), ('Labo'), ('Lam-an'), ('Liposong'),
  ('Litapan'), ('Malaubang'), ('Manaka'), ('Maningcol'), ('Mentering'),
  ('Molicay'), ('Pantaon'), ('Pulot'), ('San Antonio'), ('Sangay Daku'),
  ('Sangay Diot'), ('Sinuza'), ('Stimson Abordo'), ('Tabid'), ('Tinago'),
  ('Trigos')
ON CONFLICT (name) DO NOTHING;

DO $$
DECLARE v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM mtop.barangays;
  IF v_count <> 51 THEN
    RAISE EXCEPTION 'Expected 51 barangays for Ozamiz City, seeded %', v_count;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. The franchise's own address
-- ---------------------------------------------------------------------------
-- Nullable: every existing franchise predates this and has only the free-text
-- applicant_address. ON UPDATE CASCADE so correcting a spelling in the table
-- carries through to the franchises using it; RESTRICT on delete so a barangay
-- in use cannot vanish from under them.

ALTER TABLE mtop.mtop_franchises
  ADD COLUMN barangay TEXT REFERENCES mtop.barangays(name)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD COLUMN purok TEXT;

COMMENT ON COLUMN mtop.mtop_franchises.barangay IS
  'Barangay of the operator''s address. NULL on franchises registered before '
  '20260413000020, which carry only the free-text applicant_address.';
COMMENT ON COLUMN mtop.mtop_franchises.applicant_address IS
  'The address as one readable line. Composed from purok + barangay at filing '
  'time for anything registered after 20260413000020; free text before that.';

CREATE INDEX idx_franchises_barangay ON mtop.mtop_franchises(barangay);

-- The successor's address on a change of ownership is staged the same way as
-- their name, and applied only when the transaction is granted.
ALTER TABLE mtop.mtop_applications
  ADD COLUMN new_barangay TEXT REFERENCES mtop.barangays(name)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  ADD COLUMN new_purok TEXT;

-- ---------------------------------------------------------------------------
-- 3. Carry the staged address through the grant
-- ---------------------------------------------------------------------------
-- Only the transfer_owner branch changes: it now moves new_barangay/new_purok
-- onto the franchise alongside the composed new_applicant_address, so a
-- transferred franchise doesn't keep the previous owner's barangay. Everything
-- else is unchanged from 20260413000018_one_operator_per_franchise.sql.

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
