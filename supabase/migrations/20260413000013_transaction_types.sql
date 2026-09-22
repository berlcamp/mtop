-- Transaction types — the missing entity.
--
-- Until now an application's "kind" existed only as which server action
-- created it (createNewFranchiseApplication vs createRenewalApplication).
-- The city actually runs seven distinct transactions over a franchise, each
-- with its own checklist, its own stages, and its own effect on grant.
--
-- `grant_effect` is the important column: it says what granting this
-- application does to the franchise. mtop.grant_franchise() currently only
-- implements issue_number/extend_validity; the rest are wired up in a later
-- migration. Seeding them now lets the checklist matrix reference them.

CREATE TYPE mtop.grant_effect AS ENUM (
  'issue_number',    -- first grant: assign MTOP number + set granted_until
  'extend_validity', -- renewal: advance granted_until, keep the number
  'replace_unit',    -- change unit: swap motor/chassis/plate on the same franchise
  'transfer_owner',  -- change of ownership: reassign the franchise to a successor
  'confirm_year',    -- annual confirmation slip: no change to number or validity
  'reprint_permit',  -- re-issuance: reprint a lost permit, no validity change
  'close_franchise'  -- closure: surrender plate, release the slot
);

CREATE TABLE mtop.transaction_types (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  -- One line under the name in the transaction picker.
  description  TEXT NOT NULL DEFAULT '',
  -- "Use this when …" — the disambiguating line, shown in the picker so staff
  -- pick the right transaction without asking. Kept in data, not in JSX.
  when_to_use  TEXT NOT NULL DEFAULT '',
  grant_effect mtop.grant_effect NOT NULL,
  -- false only for New Franchise; every other transaction acts on a franchise
  -- that already exists, so the UI must make the operator look it up first.
  requires_existing_franchise BOOLEAN NOT NULL DEFAULT true,
  -- Annual Confirmation, Re-Issuance and Closure skip the physical inspection
  -- entirely — they never enter the for_inspection stage.
  requires_inspection BOOLEAN NOT NULL DEFAULT true,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE mtop.transaction_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read transaction_types"
  ON mtop.transaction_types FOR SELECT TO authenticated USING (true);

GRANT SELECT ON mtop.transaction_types TO authenticated;
GRANT ALL    ON mtop.transaction_types TO service_role;

INSERT INTO mtop.transaction_types
  (code, name, description, when_to_use, grant_effect,
   requires_existing_franchise, requires_inspection, sort_order)
VALUES
  ('new_franchise',
   'New Franchise',
   'Register a brand-new franchise and issue its first MTOP number.',
   'Use this when the applicant has no franchise yet and the unit has never been granted an MTOP.',
   'issue_number', false, true, 1),

  ('renewal',
   'Renewal of Franchise',
   'Renew an expiring franchise for another validity period.',
   'Use this when an existing franchise is at or near its expiry date and the same owner keeps the same unit.',
   'extend_validity', true, true, 2),

  ('annual_confirmation',
   'Annual Confirmation Slip',
   'Yearly confirmation of an existing franchise within its validity period.',
   'Use this for the in-between years — the franchise is still valid and is not being renewed yet.',
   'confirm_year', true, false, 3),

  ('change_unit',
   'Motor Verification / Change Unit',
   'Replace the tricycle unit under an existing franchise.',
   'Use this when the owner keeps the franchise but changes the motor, chassis or plate.',
   'replace_unit', true, true, 4),

  ('change_ownership',
   'Change of Ownership',
   'Transfer an existing franchise to a successor or new owner.',
   'Use this when the registered owner has died or the franchise is passing to another person.',
   'transfer_owner', true, true, 5),

  ('reissuance',
   'Re-Issuance of Franchise',
   'Reprint a lost or destroyed franchise permit.',
   'Use this when the owner lost the permit itself — nothing about the franchise changes.',
   'reprint_permit', true, false, 6),

  ('closure',
   'Closure of Franchise',
   'Close a franchise and surrender its plate back to the city.',
   'Use this when the owner is giving up the franchise and the slot returns to the pool.',
   'close_franchise', true, false, 7);

-- Attach the type to applications.

ALTER TABLE mtop.mtop_applications
  ADD COLUMN IF NOT EXISTS transaction_type_id UUID
    REFERENCES mtop.transaction_types(id);

-- Backfill: before this migration the only two flows were new-franchise and
-- renewal, and the only way to tell them apart after the fact is ordering —
-- a franchise's first application created it, later ones renewed it.
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY franchise_id ORDER BY created_at) AS n
  FROM mtop.mtop_applications
)
UPDATE mtop.mtop_applications a
SET transaction_type_id = t.id
FROM ranked r
JOIN mtop.transaction_types t
  ON t.code = CASE WHEN r.n = 1 THEN 'new_franchise' ELSE 'renewal' END
WHERE a.id = r.id
  AND a.transaction_type_id IS NULL;

ALTER TABLE mtop.mtop_applications
  ALTER COLUMN transaction_type_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_applications_transaction_type
  ON mtop.mtop_applications(transaction_type_id);

-- The old UNIQUE (franchise_id, fiscal_year) assumed one application per
-- franchise per year. That is now wrong in two ways: a franchise can legitimately
-- file an Annual Confirmation Slip and a Change Unit in the same year, and a
-- rejected application must not block a fresh filing in that same year.
--
-- The real rule is "at most one application in flight per franchise", which the
-- partial index below enforces at the database level (the server action already
-- checks it, but the check was racy).
ALTER TABLE mtop.mtop_applications
  DROP CONSTRAINT IF EXISTS mtop_applications_franchise_id_fiscal_year_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_one_in_flight_per_franchise
  ON mtop.mtop_applications(franchise_id)
  WHERE status IN ('for_verification', 'for_inspection',
                   'for_assessment', 'for_approval', 'returned');

COMMENT ON COLUMN mtop.mtop_applications.transaction_type_id IS
  'Which of the seven city transactions this application is. Drives the '
  'requirement checklist, the stage pipeline, and what granting it does.';
