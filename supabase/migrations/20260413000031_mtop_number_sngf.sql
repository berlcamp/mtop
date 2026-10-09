-- MTOP numbers now print as AO-SNGF-2026-0001: the AO prefix, an SNGF office
-- code, the grant year and a 4-digit counter.
--
-- Only the printed form changes. The per-year counter in
-- mtop.mtop_number_counters carries on from where it is, so the first number
-- issued under this format continues the year's sequence rather than starting
-- a second 0001 beside one already on paper. Numbers already issued under the
-- AO-2026-00001 and 2026-0001 formats are left alone.
--
-- lpad() truncates a longer string, so a year past 9999 grants would silently
-- reuse numbers; the counter is padded only when it is shorter than 4 digits.

CREATE OR REPLACE FUNCTION mtop.format_mtop_number(p_year INTEGER, p_n BIGINT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'AO-SNGF-' || p_year::text || '-'
    || CASE WHEN length(p_n::text) < 4 THEN lpad(p_n::text, 4, '0') ELSE p_n::text END
$$;

COMMENT ON FUNCTION mtop.format_mtop_number(INTEGER, BIGINT) IS
  'An MTOP number as it is printed: AO-SNGF-2026-0001.';
