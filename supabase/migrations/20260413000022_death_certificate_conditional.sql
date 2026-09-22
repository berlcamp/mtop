-- The death certificate is conditional on a change of ownership, not required.
--
-- A transfer does not always follow a death: the ordinance's change of
-- ownership also covers a sale or an assignment between living operators, and
-- there is no death certificate to produce for those. Leaving the item
-- mandatory meant such a transfer could never clear verification — isBlocking()
-- in src/lib/requirements.ts counts mandatory, non-conditional items, so the
-- forward button stayed disabled with nothing the clerk could do about it.
--
-- Marked the same way as the two items beside it that are already conditional
-- on how the holder left the franchise — the marriage contract and the
-- affidavit of waiver of rights. It now shows as "If applicable" and never
-- blocks, while still being there to tick and attach when a death is what
-- prompted the transfer.
--
-- The flags live in the matrix, not on the application rows: getApplication()
-- merges mtop.transaction_requirements over each application's own rows, so
-- applications already in flight pick this up with no backfill.

UPDATE mtop.transaction_requirements tr
SET is_mandatory   = false,
    is_conditional = true,
    note           = 'When the transfer follows the death of the registered holder.'
FROM mtop.transaction_types t, mtop.requirements r
WHERE tr.transaction_type_id = t.id
  AND tr.requirement_id      = r.id
  AND t.code = 'change_ownership'
  AND r.code = 'death_certificate';

DO $$
DECLARE v_blocking INT;
BEGIN
  SELECT count(*)
  INTO v_blocking
  FROM mtop.transaction_requirements tr
  JOIN mtop.transaction_types t ON t.id = tr.transaction_type_id
  JOIN mtop.requirements r      ON r.id = tr.requirement_id
  WHERE t.code = 'change_ownership'
    AND r.code = 'death_certificate'
    AND tr.is_mandatory
    AND NOT tr.is_conditional;

  IF v_blocking <> 0 THEN
    RAISE EXCEPTION
      'The death certificate is still a blocking requirement on change_ownership';
  END IF;
END
$$;
