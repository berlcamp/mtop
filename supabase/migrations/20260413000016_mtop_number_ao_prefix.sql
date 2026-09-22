-- MTOP numbers now print as AO-2026-00001 (an "AO" prefix, the grant year,
-- and a 5-digit counter) instead of 2026-0001.
--
-- Only the presentation changes. mtop.mtop_number_counters already stores the
-- per-year counter as a plain integer, so next_mtop_number() needs no change
-- — it just calls this function to render whatever integer it produced.
-- Numbers already issued under the old format are left as they are; they are
-- historical and this migration does not renumber them.

CREATE OR REPLACE FUNCTION mtop.format_mtop_number(p_year INTEGER, p_n BIGINT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'AO-' || p_year::text || '-' || lpad(p_n::text, 5, '0')
$$;
