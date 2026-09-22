-- Closure is assessed, not evidenced.
--
-- The certification fee and the payment for closure were sitting in the
-- closure checklist as requirements of kind 'payment', which meant the clerk
-- ticked them off like a document. They are money the operator owes, so they
-- belong in the fee assessment where the amount is stated, approved by the
-- CTO head, and matched against an official receipt.
--
-- They are also the ONLY money owed on a closure: none of the annual fees
-- apply, because nothing is being granted for a year.
--
--   Certification Fee     100.00
--   Payment for Closure   500.00

-- ---------------------------------------------------------------------------
-- 1. Two more assessable fees
-- ---------------------------------------------------------------------------
-- Default 0.00, like the other situational fees (change of motor, replacement
-- plate): every assessment carries the columns, and only the transactions that
-- owe them put a figure in.

ALTER TABLE mtop.mtop_assessments
  ADD COLUMN certification_fee NUMERIC(10,2) DEFAULT 0.00,
  ADD COLUMN closure_fee       NUMERIC(10,2) DEFAULT 0.00;

COMMENT ON COLUMN mtop.mtop_assessments.certification_fee IS
  'Certification fee. 100.00 on a closure; also charged on a change of unit, '
  'where it remains a checklist item for now.';
COMMENT ON COLUMN mtop.mtop_assessments.closure_fee IS
  'Payment for closure of franchise. 500.00, closure only.';

-- ---------------------------------------------------------------------------
-- 2. Off the closure checklist
-- ---------------------------------------------------------------------------
-- Only for closure. certification_fee is also on change_unit, and that one
-- stays where it is: this migration is about how a closure is priced, not a
-- rewrite of the fee model.

DELETE FROM mtop.transaction_requirements tr
USING mtop.transaction_types t, mtop.requirements r
WHERE tr.transaction_type_id = t.id
  AND tr.requirement_id      = r.id
  AND t.code = 'closure'
  AND r.code IN ('certification_fee', 'payment_closure');

-- Applications already filed carry their own copy of the checklist, and
-- getApplication() treats a row with no matrix rule as mandatory — so without
-- this, a closure already in flight would keep two items nobody can clear.
-- Granted and rejected applications keep theirs: that is what was actually
-- asked of the operator at the time.
DELETE FROM mtop.mtop_application_requirements ar
USING mtop.mtop_applications a, mtop.transaction_types t, mtop.requirements r
WHERE ar.application_id = a.id
  AND a.transaction_type_id = t.id
  AND ar.requirement_id = r.id
  AND t.code = 'closure'
  AND r.code IN ('certification_fee', 'payment_closure')
  AND a.status NOT IN ('granted', 'rejected');

DO $$
DECLARE v_left INT;
BEGIN
  SELECT count(*)
  INTO v_left
  FROM mtop.transaction_requirements tr
  JOIN mtop.transaction_types t ON t.id = tr.transaction_type_id
  JOIN mtop.requirements r      ON r.id = tr.requirement_id
  WHERE t.code = 'closure'
    AND r.code IN ('certification_fee', 'payment_closure');

  IF v_left <> 0 THEN
    RAISE EXCEPTION 'Closure still lists % payment requirement(s)', v_left;
  END IF;
END
$$;
