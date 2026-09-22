-- Lists the body, plate, motor and chassis numbers that more than one ACTIVE
-- franchise is using, so they can be resolved before
-- 20260413000021_unique_unit_identifiers.sql (body, plate) and
-- 20260413000023_unique_motor_chassis.sql (motor, chassis) are applied.
--
-- Read-only. Unlike duplicate operators, a duplicate unit number has
-- no safe automatic fix: one of the two records is simply wrong about which
-- unit it describes, and only someone with the paper file knows which. So this
-- reports and leaves the deciding to a person.
--
--   supabase db query -f supabase/scripts/report-duplicate-unit-identifiers.sql --linked
--
-- (--linked requires `supabase login` + `supabase link` first; without that,
-- paste it into the Supabase Studio SQL editor instead.)
--
-- Migration 21's helper may not exist yet at this point, so the normalisation
-- below is written out inline. It matches mtop.normalize_unit_identifier()
-- exactly: upper-case, then drop everything that is not a letter or digit.
--
-- Resolve each row by either correcting the wrong number, or closing the
-- franchise that should no longer be active (UPDATE mtop.mtop_franchises SET
-- franchise_status = 'closed', closed_at = now() WHERE id = '...'). Both are
-- picked up by the audit trail.

SELECT
  'body number' AS field,
  regexp_replace(upper(tricycle_body_number), '[^[:alnum:]]', '', 'g') AS normalized,
  count(*) AS active_franchises,
  string_agg(
    coalesce(mtop_number, '(ungranted)')
      || ' - ' || applicant_name
      || ' [' || tricycle_body_number || '] ' || id,
    E'\n  ' ORDER BY created_at
  ) AS held_by
FROM mtop.mtop_franchises
WHERE franchise_status = 'active'
  AND regexp_replace(upper(tricycle_body_number), '[^[:alnum:]]', '', 'g') <> ''
GROUP BY 2
HAVING count(*) > 1

UNION ALL

SELECT
  'plate number' AS field,
  regexp_replace(upper(plate_number), '[^[:alnum:]]', '', 'g') AS normalized,
  count(*) AS active_franchises,
  string_agg(
    coalesce(mtop_number, '(ungranted)')
      || ' - ' || applicant_name
      || ' [' || plate_number || '] ' || id,
    E'\n  ' ORDER BY created_at
  ) AS held_by
FROM mtop.mtop_franchises
WHERE franchise_status = 'active'
  AND regexp_replace(upper(plate_number), '[^[:alnum:]]', '', 'g') <> ''
GROUP BY 2
HAVING count(*) > 1

UNION ALL

SELECT
  'motor number' AS field,
  regexp_replace(upper(motor_number), '[^[:alnum:]]', '', 'g') AS normalized,
  count(*) AS active_franchises,
  string_agg(
    coalesce(mtop_number, '(ungranted)')
      || ' - ' || applicant_name
      || ' [' || motor_number || '] ' || id,
    E'\n  ' ORDER BY created_at
  ) AS held_by
FROM mtop.mtop_franchises
WHERE franchise_status = 'active'
  AND regexp_replace(upper(motor_number), '[^[:alnum:]]', '', 'g') <> ''
GROUP BY 2
HAVING count(*) > 1

UNION ALL

SELECT
  'chassis number' AS field,
  regexp_replace(upper(chassis_number), '[^[:alnum:]]', '', 'g') AS normalized,
  count(*) AS active_franchises,
  string_agg(
    coalesce(mtop_number, '(ungranted)')
      || ' - ' || applicant_name
      || ' [' || chassis_number || '] ' || id,
    E'\n  ' ORDER BY created_at
  ) AS held_by
FROM mtop.mtop_franchises
WHERE franchise_status = 'active'
  AND regexp_replace(upper(chassis_number), '[^[:alnum:]]', '', 'g') <> ''
GROUP BY 2
HAVING count(*) > 1

ORDER BY 1, 3 DESC;
