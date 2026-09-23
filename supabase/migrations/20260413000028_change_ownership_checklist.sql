-- A change of ownership asks for papers, not for the unit again.
--
-- Four rows come off the change-of-ownership checklist. Each is evidenced
-- somewhere else in the system already, so ticking it here was a second record
-- of the same fact — and a mandatory one, which meant verification could not be
-- forwarded until a clerk ticked something no document supports:
--
--   payment_change_ownership   Money owed belongs in the fee assessment, where
--                              the amount is stated, approved by the CTO head
--                              and matched to an official receipt. Same reason
--                              the two closure fees came off in migration 24.
--                              Nothing is lost: feeScheduleFor() gives a change
--                              of ownership the full annual schedule, so the
--                              transfer is still priced and still collected.
--
--   inspection_report          The inspection is recorded on mtop_inspections
--                              and shown on its own card. The stage gate is
--                              what actually enforces it.
--
--   personal_appearance        An attestation with no artifact behind it.
--
--   photo_driver_operator_unit The portraits live on the franchise
--                              (owner_photo_url / driver_photo_url, migration
--                              10) and are captured on the photos card.
--
-- The workflow is deliberately untouched. transaction_types.requires_inspection
-- stays true for change_ownership, so the application still routes through the
-- inspection desk and an inspector still records the twelve-point check — the
-- city does look at the unit on a transfer. Only the duplicate checklist tick
-- goes. The photos card and the fee assessment are likewise unaffected; this
-- migration removes checklist rows, not the things they pointed at.
--
-- With these gone the transaction's checklist is documents only, so the
-- Payments, Inspection, In person and Photos groups stop rendering for it —
-- groupByKind() drops a group with no items.

-- ---------------------------------------------------------------------------
-- 1. Off the matrix
-- ---------------------------------------------------------------------------
-- change_ownership only. inspection_report, personal_appearance and
-- photo_driver_operator_unit are still asked for on a new franchise and a
-- renewal, where the unit and the applicant are genuinely being seen for the
-- first time that period.

DELETE FROM mtop.transaction_requirements tr
USING mtop.transaction_types t, mtop.requirements r
WHERE tr.transaction_type_id = t.id
  AND tr.requirement_id      = r.id
  AND t.code = 'change_ownership'
  AND r.code IN (
    'payment_change_ownership',
    'inspection_report',
    'personal_appearance',
    'photo_driver_operator_unit'
  );

-- ---------------------------------------------------------------------------
-- 2. Off the applications already in flight
-- ---------------------------------------------------------------------------
-- Applications carry their own copy of the checklist, and getApplication()
-- treats a row with no matrix rule as mandatory — so without this, a transfer
-- already filed would keep four items nobody can clear. Granted and rejected
-- applications keep theirs: that is what was actually asked of the operator at
-- the time, and an audit of a closed file should show it.

DELETE FROM mtop.mtop_application_requirements ar
USING mtop.mtop_applications a, mtop.transaction_types t, mtop.requirements r
WHERE ar.application_id       = a.id
  AND a.transaction_type_id   = t.id
  AND ar.requirement_id       = r.id
  AND t.code = 'change_ownership'
  AND r.code IN (
    'payment_change_ownership',
    'inspection_report',
    'personal_appearance',
    'photo_driver_operator_unit'
  )
  AND a.status NOT IN ('granted', 'rejected');

-- ---------------------------------------------------------------------------
-- 3. Prove it
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_left     INT;
  v_in_flight INT;
BEGIN
  SELECT count(*)
  INTO v_left
  FROM mtop.transaction_requirements tr
  JOIN mtop.transaction_types t ON t.id = tr.transaction_type_id
  JOIN mtop.requirements r      ON r.id = tr.requirement_id
  WHERE t.code = 'change_ownership'
    AND r.kind IN ('payment', 'inspection', 'appearance', 'photo');

  IF v_left <> 0 THEN
    RAISE EXCEPTION
      'Change of ownership still lists % non-document requirement(s)', v_left;
  END IF;

  SELECT count(*)
  INTO v_in_flight
  FROM mtop.mtop_application_requirements ar
  JOIN mtop.mtop_applications a  ON a.id = ar.application_id
  JOIN mtop.transaction_types t  ON t.id = a.transaction_type_id
  JOIN mtop.requirements r       ON r.id = ar.requirement_id
  WHERE t.code = 'change_ownership'
    AND a.status NOT IN ('granted', 'rejected')
    AND r.kind IN ('payment', 'inspection', 'appearance', 'photo');

  IF v_in_flight <> 0 THEN
    RAISE EXCEPTION
      'Change-of-ownership applications in flight still carry % such row(s)',
      v_in_flight;
  END IF;
END
$$;
