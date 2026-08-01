-- Fields printed on the Franchise Card that the schema didn't carry yet,
-- plus a switch to year-prefixed MTOP numbers (2026-0001) to match the
-- issued permit design.

-- 1. Vehicle make and rest day — franchise-level, carried across renewals.

ALTER TABLE mtop.mtop_franchises
  ADD COLUMN IF NOT EXISTS make TEXT,
  ADD COLUMN IF NOT EXISTS day_off TEXT;

COMMENT ON COLUMN mtop.mtop_franchises.make IS
  'Motorcycle make printed on the card, e.g. Kawasaki.';
COMMENT ON COLUMN mtop.mtop_franchises.day_off IS
  'Rest day(s) printed on the card, e.g. Every Tuesday and Sunday.';

-- 2. Year-prefixed MTOP numbers.
--
-- The old scheme was a single global sequence rendered as MTOP-00001. The
-- issued permit shows 2026-0001: a four-digit counter that restarts each
-- year. A counter table (rather than a sequence per year) keeps the
-- allocation atomic and lets us add years without DDL.

CREATE TABLE IF NOT EXISTS mtop.mtop_number_counters (
  year        INTEGER PRIMARY KEY,
  last_value  INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE mtop.mtop_number_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read mtop_number_counters" ON mtop.mtop_number_counters;
CREATE POLICY "Authenticated users can read mtop_number_counters"
  ON mtop.mtop_number_counters FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON mtop.mtop_number_counters TO authenticated;
GRANT ALL ON mtop.mtop_number_counters TO service_role;

-- Formats a year + counter as it appears on the permit: 2026-0001.
CREATE OR REPLACE FUNCTION mtop.format_mtop_number(p_year INTEGER, p_n BIGINT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_year::text || '-' || lpad(p_n::text, 4, '0')
$$;

-- Atomically claims the next counter value for a year.
-- UPSERT … RETURNING is a single statement, so concurrent grants serialise
-- on the row lock and can't hand out the same number twice.
CREATE OR REPLACE FUNCTION mtop.next_mtop_number(p_year INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mtop, public
AS $$
DECLARE
  v_n INTEGER;
BEGIN
  INSERT INTO mtop.mtop_number_counters AS c (year, last_value)
  VALUES (p_year, 1)
  ON CONFLICT (year) DO UPDATE SET last_value = c.last_value + 1
  RETURNING last_value INTO v_n;

  RETURN mtop.format_mtop_number(p_year, v_n);
END;
$$;

-- Seed each year's counter from any numbers already issued in that format,
-- so re-running this migration can never reissue an existing number.
INSERT INTO mtop.mtop_number_counters (year, last_value)
SELECT
  split_part(mtop_number, '-', 1)::int AS year,
  max(split_part(mtop_number, '-', 2)::int) AS last_value
FROM mtop.mtop_franchises
WHERE mtop_number ~ '^\d{4}-\d+$'
GROUP BY 1
ON CONFLICT (year) DO UPDATE
  SET last_value = greatest(mtop.mtop_number_counters.last_value, excluded.last_value);

-- 3. Grant function now numbers by the year of the grant.

CREATE OR REPLACE FUNCTION mtop.grant_franchise(
  p_franchise_id UUID,
  p_granted_at TIMESTAMPTZ,
  p_validity_years INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mtop, public
AS $$
DECLARE
  v_number TEXT;
  v_until  DATE;
BEGIN
  v_until := (p_granted_at::date + (p_validity_years || ' years')::interval)::date;

  SELECT mtop_number INTO v_number
  FROM mtop.mtop_franchises
  WHERE id = p_franchise_id
  FOR UPDATE;

  IF v_number IS NULL THEN
    v_number := mtop.next_mtop_number(extract(year FROM p_granted_at)::int);
    UPDATE mtop.mtop_franchises
    SET mtop_number = v_number,
        granted_until = v_until,
        updated_at = now()
    WHERE id = p_franchise_id;
  ELSE
    UPDATE mtop.mtop_franchises
    SET granted_until = v_until,
        updated_at = now()
    WHERE id = p_franchise_id;
  END IF;

  RETURN v_number;
END;
$$;

-- The old single-argument formatter is superseded; drop it so nothing
-- accidentally keeps minting MTOP-00001 style numbers.
DROP FUNCTION IF EXISTS mtop.format_mtop_number(BIGINT);
DROP SEQUENCE IF EXISTS mtop.mtop_number_seq;
