-- Clears the way for 20260413000018_one_operator_per_franchise.sql when
-- existing data already breaks the one-franchise-per-operator rule.
--
-- Policy: for each operator holding more than one ACTIVE franchise, keep the
-- most recently created one and close the rest. Closing (rather than deleting)
-- keeps the franchises, their applications and their history intact, and
-- closed franchises stop counting against the operator.
--
-- Run it BEFORE migration 18. The migration's helper functions do not exist
-- yet at that point -- it rolled back when it refused to install -- so the
-- normalisation below is written out inline. It matches
-- mtop.normalize_operator_name() exactly.
--
--   supabase db execute -f supabase/scripts/close-duplicate-operator-franchises.sql
--
-- If the data is purely test data, prefer supabase/scripts/reset-sample-data.sql
-- instead -- it wipes everything and lets you start clean.

BEGIN;

-- What is about to change. Check this output before committing.
SELECT
  btrim(regexp_replace(upper(regexp_replace(applicant_name, '[^[:alnum:][:space:]]', ' ', 'g')), '\s+', ' ', 'g')) AS operator,
  count(*) AS active_franchises,
  string_agg(
    coalesce(mtop_number, '(ungranted)') || ' - ' || applicant_name,
    ', ' ORDER BY created_at DESC
  ) AS franchises_newest_first
FROM mtop.mtop_franchises
WHERE franchise_status = 'active'
GROUP BY 1
HAVING count(*) > 1
ORDER BY 2 DESC;

WITH normalized AS (
  SELECT
    id,
    created_at,
    btrim(regexp_replace(upper(regexp_replace(applicant_name, '[^[:alnum:][:space:]]', ' ', 'g')), '\s+', ' ', 'g')) AS operator
  FROM mtop.mtop_franchises
  WHERE franchise_status = 'active'
),
keepers AS (
  -- One survivor per operator: the newest. An operator with a single
  -- franchise is trivially their own keeper and is left alone.
  SELECT DISTINCT ON (operator) id
  FROM normalized
  ORDER BY operator, created_at DESC
)
UPDATE mtop.mtop_franchises f
SET franchise_status = 'closed',
    closed_at = now(),
    updated_at = now()
WHERE f.franchise_status = 'active'
  AND f.id NOT IN (SELECT id FROM keepers);

COMMIT;

-- Applications still in flight against a franchise this just closed are left
-- as they are -- they will fail the active-franchise check if anyone tries to
-- push them further. List them with:
--
--   SELECT a.id, a.status, f.mtop_number, f.applicant_name
--   FROM mtop.mtop_applications a
--   JOIN mtop.mtop_franchises f ON f.id = a.franchise_id
--   WHERE f.franchise_status = 'closed'
--     AND a.status NOT IN ('granted', 'rejected');
