-- Requirement checklists as reference data.
--
-- Replaces mtop.mtop_document_type (a 10-value PG enum, mirrored in two
-- TypeScript arrays) with a requirements catalogue and a per-transaction
-- matrix. Adding a checklist item is now an INSERT, not a migration plus a
-- four-file edit.
--
-- The city's checklist mixes four different things into one column, and they
-- are satisfied at different stages of the workflow — hence `kind`:
--
--   document   — an attachable file, ticked at verification (the old behaviour)
--   payment    — a fee line; satisfied by the payment record, not by an upload
--   inspection — output of the inspection stage, not an intake document
--   appearance — the applicant showing up in person
--   photo      — portraits already captured on the franchise record
--   surrender  — a physical item handed back to the city (the franchise plate)

CREATE TYPE mtop.requirement_kind AS ENUM (
  'document', 'payment', 'inspection', 'appearance', 'photo', 'surrender'
);

CREATE TABLE mtop.requirements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  kind        mtop.requirement_kind NOT NULL DEFAULT 'document',
  description TEXT NOT NULL DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE mtop.transaction_requirements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_type_id UUID NOT NULL REFERENCES mtop.transaction_types(id) ON DELETE CASCADE,
  requirement_id      UUID NOT NULL REFERENCES mtop.requirements(id) ON DELETE CASCADE,
  -- A mandatory item blocks forwarding out of verification until ticked.
  is_mandatory        BOOLEAN NOT NULL DEFAULT true,
  -- Conditional items only apply in certain circumstances (e.g. the Affidavit
  -- of No Franchise is required only when the unit came from an abandoned
  -- MTOP). They are shown but never block.
  is_conditional      BOOLEAN NOT NULL DEFAULT false,
  -- Per-transaction wording, so one requirement can read slightly differently
  -- where the city's checklist words it differently.
  note                TEXT,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  UNIQUE (transaction_type_id, requirement_id)
);

ALTER TABLE mtop.requirements              ENABLE ROW LEVEL SECURITY;
ALTER TABLE mtop.transaction_requirements  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read requirements"
  ON mtop.requirements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read transaction_requirements"
  ON mtop.transaction_requirements FOR SELECT TO authenticated USING (true);

GRANT SELECT ON mtop.requirements, mtop.transaction_requirements TO authenticated;
GRANT ALL    ON mtop.requirements, mtop.transaction_requirements TO service_role;

CREATE INDEX idx_transaction_requirements_type
  ON mtop.transaction_requirements(transaction_type_id);

-- ---------------------------------------------------------------------------
-- 1. Requirement catalogue
-- ---------------------------------------------------------------------------

INSERT INTO mtop.requirements (code, label, kind, description) VALUES
  -- Documents
  ('application_form', 'Application Form', 'document', ''),
  ('ctms_clearance', 'CTMS Clearance', 'document', ''),
  ('hpg_clearance', 'HPG Clearance', 'document',
   'Highway Patrol Group clearance on the unit.'),
  ('lto_or_cr', 'Certificate of Registration (CR) and Official Receipt', 'document',
   'Must be updated and submitted as the original copy.'),
  ('lto_or_cr_photocopy', 'Photocopy of LTO OR and CR', 'document', ''),
  ('mtop_owner_copy', 'MTOP (Original Owner''s Copy)', 'document', ''),
  ('franchise_owner_copy', 'Franchise Owner''s Copy', 'document', ''),
  ('original_franchise', 'Original Copy of Franchise', 'document',
   'Surrendered to the city on closure.'),
  ('voters_certificate', 'Voter''s Certificate', 'document',
   'Applicant must be a registered voter of Ozamiz City.'),
  ('barangay_certification', 'Barangay Certification', 'document', ''),
  ('barangay_endorsement', 'Barangay Endorsement', 'document', ''),
  ('ctc', 'Community Tax Certificate (Cedula)', 'document', ''),
  ('police_clearance', 'Police Clearance', 'document', ''),
  ('professional_drivers_license', 'Professional Driver''s License', 'document',
   'Photocopy.'),
  ('affidavit_change_unit', 'Affidavit of Change Unit', 'document', ''),
  ('affidavit_no_franchise', 'Affidavit of No Franchise', 'document',
   'States the applicant is not a relative of an operator who abandoned a '
   'franchise covering the same unit.'),
  ('affidavit_of_loss', 'Affidavit of Loss', 'document', ''),
  ('affidavit_self_adjudication', 'Affidavit of Self-Adjudication', 'document', ''),
  ('affidavit_waiver_of_rights', 'Affidavit Waiver of Rights with Birth Certificate', 'document',
   'Executed by the children of the deceased franchise holder.'),
  ('death_certificate', 'Death Certificate', 'document',
   'Death certificate of the registered MTOP holder.'),
  ('marriage_contract', 'Marriage Contract', 'document', ''),
  ('special_power_of_attorney', 'Special Power of Attorney', 'document', ''),
  ('holder_id_three_signatures', 'ID of Franchise Holder with three (3) signatures', 'document', ''),
  ('closure_letter', 'Letter addressed to the City Treasurer', 'document',
   'Written request for closure of the franchise.'),
  ('or_photocopy', 'Photocopy of Official Receipt', 'document',
   'Photocopy of the franchise official receipt on file.'),
  ('franchise_or_previous', 'Franchise OR (previous OR)', 'document',
   'The outgoing owner''s last franchise official receipt, presented as proof '
   'the franchise is paid up.'),

  -- Payments — satisfied by the payment record, not by an upload. Amounts are
  -- never hardcoded here: what is owed comes from the fee assessment
  -- (mtop.mtop_assessments, currently the standard 9-line schedule totaling
  -- P2,410 — see src/lib/fees.ts STANDARD_FEES), not from this checklist.
  ('franchise_or_current', 'Franchise OR (current OR)', 'payment',
   'The franchise fee paid for this cycle, per the fee assessment.'),
  ('franchise_official_receipt', 'Official Receipt', 'payment',
   'Per the fee assessment.'),
  ('payment_change_unit', 'Payment for Change of Unit', 'payment',
   'Per the fee assessment.'),
  ('payment_change_ownership', 'Payment for Change of Ownership', 'payment',
   'Per the fee assessment.'),
  ('payment_closure', 'Payment for Closure', 'payment',
   'Per the fee assessment.'),
  ('certification_fee', 'Certification Fee', 'payment',
   'Per the fee assessment.'),
  ('lto_or_payment_if_expired', 'Payment of LTO OR if expired', 'payment',
   'Only when the LTO official receipt has lapsed. Amount per the fee assessment.'),

  -- Inspection — produced by the inspection stage
  ('inspection_report', 'Inspection Report', 'inspection',
   'Signed by the Inspection Committee. Ticked automatically when the unit passes.'),

  -- Appearance
  ('personal_appearance', 'Personal Appearance of the Applicant', 'appearance', ''),

  -- Photos — captured on the franchise record
  ('photo_driver_operator_unit', 'Picture of Driver, Operator and Unit', 'photo', ''),

  -- Surrender
  ('surrender_plate', 'Surrender of Franchise Plate', 'surrender',
   'The motorcab plate handed back to the City Treasurer.');

-- ---------------------------------------------------------------------------
-- 2. The matrix — which requirements each transaction asks for
-- ---------------------------------------------------------------------------

INSERT INTO mtop.transaction_requirements
  (transaction_type_id, requirement_id, sort_order, is_mandatory, is_conditional, note)
SELECT t.id, r.id, m.sort_order, m.is_mandatory, m.is_conditional, m.note
FROM (VALUES
  -- New Franchise
  ('new_franchise', 'application_form',             1,  true,  false, NULL),
  ('new_franchise', 'ctms_clearance',               2,  true,  false, NULL),
  ('new_franchise', 'mtop_owner_copy',              3,  true,  false, NULL),
  ('new_franchise', 'lto_or_cr',                    4,  true,  false, NULL),
  ('new_franchise', 'voters_certificate',           5,  true,  false, NULL),
  ('new_franchise', 'barangay_certification',       6,  true,  false, NULL),
  ('new_franchise', 'barangay_endorsement',         7,  true,  false, NULL),
  ('new_franchise', 'ctc',                          8,  true,  false, NULL),
  ('new_franchise', 'police_clearance',             9,  true,  false, NULL),
  ('new_franchise', 'professional_drivers_license', 10, true,  false, NULL),
  ('new_franchise', 'inspection_report',            11, true,  false, NULL),
  ('new_franchise', 'franchise_or_current',         12, true,  false, NULL),
  ('new_franchise', 'photo_driver_operator_unit',   13, true,  false, NULL),
  ('new_franchise', 'personal_appearance',          14, true,  false, NULL),
  ('new_franchise', 'affidavit_no_franchise',       15, false, true,
   'Required only when the applicant acquired the unit from an operator who abandoned an MTOP.'),

  -- Renewal of Franchise
  ('renewal', 'application_form',             1,  true,  false, NULL),
  ('renewal', 'ctms_clearance',               2,  true,  false, NULL),
  ('renewal', 'mtop_owner_copy',              3,  true,  false, NULL),
  ('renewal', 'lto_or_cr',                    4,  true,  false, NULL),
  ('renewal', 'voters_certificate',           5,  true,  false, NULL),
  ('renewal', 'barangay_certification',       6,  true,  false, NULL),
  ('renewal', 'barangay_endorsement',         7,  true,  false, NULL),
  ('renewal', 'ctc',                          8,  true,  false, NULL),
  ('renewal', 'police_clearance',             9,  true,  false, NULL),
  ('renewal', 'professional_drivers_license', 10, true,  false, NULL),
  ('renewal', 'inspection_report',            11, true,  false, NULL),
  ('renewal', 'franchise_or_current',         12, true,  false, NULL),
  ('renewal', 'photo_driver_operator_unit',   13, true,  false, NULL),
  ('renewal', 'personal_appearance',          14, true,  false, NULL),
  ('renewal', 'special_power_of_attorney',    15, false, true,
   'Only when the applicant is ill during the renewal period and an immediate family member files on their behalf.'),

  -- Annual Confirmation Slip
  ('annual_confirmation', 'application_form',           1, true,  false, NULL),
  ('annual_confirmation', 'ctms_clearance',             2, true,  false, NULL),
  ('annual_confirmation', 'lto_or_cr_photocopy',        3, true,  false, NULL),
  ('annual_confirmation', 'lto_or_payment_if_expired',  4, false, true,
   'Only when the LTO official receipt has expired.'),
  ('annual_confirmation', 'franchise_owner_copy',       5, true,  false, NULL),
  ('annual_confirmation', 'or_photocopy',               6, true,  false, NULL),

  -- Motor Verification / Change Unit
  ('change_unit', 'application_form',             1,  true, false, NULL),
  ('change_unit', 'affidavit_change_unit',        2,  true, false, NULL),
  ('change_unit', 'mtop_owner_copy',              3,  true, false, NULL),
  ('change_unit', 'lto_or_cr',                    4,  true, false,
   'Both the new and the old unit.'),
  ('change_unit', 'voters_certificate',           5,  true, false, NULL),
  ('change_unit', 'barangay_certification',       6,  true, false, NULL),
  ('change_unit', 'certification_fee',            7,  true, false, NULL),
  ('change_unit', 'ctc',                          8,  true, false, NULL),
  ('change_unit', 'payment_change_unit',          9,  true, false, NULL),
  ('change_unit', 'professional_drivers_license', 10, true, false, NULL),
  ('change_unit', 'inspection_report',            11, true, false, NULL),
  ('change_unit', 'franchise_official_receipt',   12, true, false, NULL),
  ('change_unit', 'photo_driver_operator_unit',   13, true, false,
   'Picture of the driver.'),
  ('change_unit', 'ctms_clearance',               14, true, false,
   'CTMS Clearance for Change Unit.'),

  -- Change of Ownership
  ('change_ownership', 'application_form',             1,  true,  false, NULL),
  ('change_ownership', 'hpg_clearance',                2,  true,  false, NULL),
  ('change_ownership', 'mtop_owner_copy',              3,  true,  false, NULL),
  ('change_ownership', 'lto_or_cr',                    4,  true,  false, NULL),
  ('change_ownership', 'affidavit_self_adjudication',  5,  true,  false, NULL),
  ('change_ownership', 'death_certificate',            6,  true,  false, NULL),
  ('change_ownership', 'marriage_contract',            7,  false, true,
   'When the successor is the surviving spouse.'),
  ('change_ownership', 'voters_certificate',           8,  true,  false, NULL),
  ('change_ownership', 'barangay_certification',       9,  true,  false, NULL),
  ('change_ownership', 'barangay_endorsement',         10, true,  false, NULL),
  ('change_ownership', 'ctc',                          11, true,  false, NULL),
  ('change_ownership', 'police_clearance',             12, true,  false, NULL),
  ('change_ownership', 'professional_drivers_license', 13, true,  false, NULL),
  ('change_ownership', 'inspection_report',            14, true,  false, NULL),
  ('change_ownership', 'franchise_or_previous',        15, true,  false, NULL),
  ('change_ownership', 'affidavit_waiver_of_rights',   16, false, true,
   'When the deceased holder left children who are waiving their rights.'),
  ('change_ownership', 'ctms_clearance',               17, true,  false, NULL),
  ('change_ownership', 'payment_change_ownership',     18, true,  false, NULL),
  ('change_ownership', 'personal_appearance',          19, true,  false,
   'Personal appearance of the new applicant.'),
  ('change_ownership', 'photo_driver_operator_unit',   20, true,  false,
   'Picture of the driver, the new owner and the unit.'),

  -- Re-Issuance of Franchise
  ('reissuance', 'application_form',           1, true, false, NULL),
  ('reissuance', 'affidavit_of_loss',          2, true, false, NULL),
  ('reissuance', 'lto_or_cr_photocopy',        3, true, false, NULL),
  ('reissuance', 'special_power_of_attorney',  4, true, false, NULL),
  ('reissuance', 'holder_id_three_signatures', 5, true, false, NULL),
  ('reissuance', 'franchise_owner_copy',       6, true, false, NULL),
  ('reissuance', 'or_photocopy',               7, true, false, NULL),

  -- Closure of Franchise
  ('closure', 'application_form',      1, true, false, NULL),
  ('closure', 'original_franchise',    2, true, false, NULL),
  ('closure', 'lto_or_cr_photocopy',   3, true, false, NULL),
  ('closure', 'surrender_plate',       4, true, false, NULL),
  ('closure', 'closure_letter',        5, true, false, NULL),
  ('closure', 'certification_fee',     6, true, false, NULL),
  ('closure', 'payment_closure',       7, true, false, NULL)
) AS m(transaction_code, requirement_code, sort_order, is_mandatory, is_conditional, note)
JOIN mtop.transaction_types t ON t.code = m.transaction_code
JOIN mtop.requirements     r ON r.code = m.requirement_code;

-- ---------------------------------------------------------------------------
-- 3. Point the per-application checklist at the catalogue
-- ---------------------------------------------------------------------------

-- The table now holds payment, inspection, appearance and photo rows too, so
-- "documents" is no longer an honest name.
ALTER TABLE mtop.mtop_documents RENAME TO mtop_application_requirements;

ALTER TABLE mtop.mtop_application_requirements
  ADD COLUMN IF NOT EXISTS requirement_id UUID REFERENCES mtop.requirements(id);

-- Backfill: the ten old enum values map one-to-one onto the new catalogue.
UPDATE mtop.mtop_application_requirements d
SET requirement_id = r.id
FROM mtop.requirements r
WHERE r.code = CASE d.document_type::text
                 WHEN 'lto_or'          THEN 'lto_or_cr'
                 WHEN 'drivers_license' THEN 'professional_drivers_license'
                 ELSE d.document_type::text
               END
  AND d.requirement_id IS NULL;

-- Nothing should survive the mapping; fail loudly rather than silently dropping
-- a row's identity if it somehow does.
DO $$
DECLARE
  v_orphans INTEGER;
BEGIN
  SELECT count(*) INTO v_orphans
  FROM mtop.mtop_application_requirements
  WHERE requirement_id IS NULL;

  IF v_orphans > 0 THEN
    RAISE EXCEPTION
      'Cannot migrate: % checklist row(s) have a document_type with no matching requirement code',
      v_orphans;
  END IF;
END
$$;

ALTER TABLE mtop.mtop_application_requirements
  ALTER COLUMN requirement_id SET NOT NULL;

ALTER TABLE mtop.mtop_application_requirements
  DROP CONSTRAINT IF EXISTS mtop_documents_application_id_document_type_key;

ALTER TABLE mtop.mtop_application_requirements
  DROP COLUMN document_type;

DROP TYPE IF EXISTS mtop.mtop_document_type;

ALTER TABLE mtop.mtop_application_requirements
  ADD CONSTRAINT mtop_application_requirements_application_requirement_key
    UNIQUE (application_id, requirement_id);

DROP INDEX IF EXISTS mtop.idx_documents_application_id;
CREATE INDEX IF NOT EXISTS idx_application_requirements_application_id
  ON mtop.mtop_application_requirements(application_id);

-- Policies carried over under their old names; rename them to match the table.
DROP POLICY IF EXISTS "Authenticated users can read documents"   ON mtop.mtop_application_requirements;
DROP POLICY IF EXISTS "Authenticated users can insert documents" ON mtop.mtop_application_requirements;
DROP POLICY IF EXISTS "Authenticated users can update documents" ON mtop.mtop_application_requirements;

CREATE POLICY "Authenticated users can read application_requirements"
  ON mtop.mtop_application_requirements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert application_requirements"
  ON mtop.mtop_application_requirements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update application_requirements"
  ON mtop.mtop_application_requirements FOR UPDATE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE ON mtop.mtop_application_requirements TO authenticated;
GRANT ALL ON mtop.mtop_application_requirements TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Top up applications still sitting at intake
-- ---------------------------------------------------------------------------
-- Existing applications were seeded with the old ten items. Those still at
-- verification (or returned to it) get the rest of their transaction's
-- checklist; anything already past verification is left alone so the new rows
-- cannot retroactively block work that already cleared this stage.

INSERT INTO mtop.mtop_application_requirements (application_id, requirement_id)
SELECT a.id, tr.requirement_id
FROM mtop.mtop_applications a
JOIN mtop.transaction_requirements tr
  ON tr.transaction_type_id = a.transaction_type_id
WHERE a.status IN ('for_verification', 'returned')
ON CONFLICT (application_id, requirement_id) DO NOTHING;

COMMENT ON TABLE mtop.mtop_application_requirements IS
  'One row per checklist item a given application must satisfy, copied from '
  'mtop.transaction_requirements when the application is created.';
