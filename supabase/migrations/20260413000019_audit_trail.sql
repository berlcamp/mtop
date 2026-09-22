-- Audit trail — an append-only record of who changed what on a franchise:
-- the operator's identity and contact details, the unit, the franchise's
-- status and validity, and the driver assigned to it.
--
-- Written by a database trigger, not by the server actions, for the same
-- reason the ownership rules live in the database (see
-- 20260413000018_one_operator_per_franchise.sql): a write path that forgets to
-- log leaves a hole nobody can see from the application side. Every change to
-- mtop.mtop_franchises lands here whether it came from granting a transaction,
-- the photo / driver editor, a support fix typed into Studio, or a script.
--
-- What this does NOT replace:
--   * mtop.approval_logs              — per-application stage transitions
--   * mtop.franchise_unit_history     — unit change, tied to the application
--   * mtop.franchise_ownership_history  that authorised it
-- Those stay. They record the *transaction* that sanctioned a change; this
-- table records the change itself, including the ones no transaction covers.

-- ---------------------------------------------------------------------------
-- 1. The log
-- ---------------------------------------------------------------------------

CREATE TABLE mtop.audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Which row changed. Deliberately NOT a foreign key: an audit row has to
  -- outlive the record it describes, and the DELETE entry below is written
  -- after the row is already gone.
  table_name   TEXT NOT NULL,
  record_id    UUID NOT NULL,
  -- The franchise the change belongs to, so one indexed lookup gathers an
  -- operator's whole history. Same reasoning — no foreign key.
  franchise_id UUID,
  action       TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  -- auth.uid() at the time of the write. NULL for anything done through the
  -- service role (admin client, migrations, scripts), which is itself worth
  -- being able to see in the trail. The foreign key is what lets PostgREST
  -- embed the actor's name (actor:user_profiles!actor_id(full_name)); ON
  -- DELETE SET NULL so removing a user can never delete their history.
  actor_id     UUID REFERENCES mtop.user_profiles(id) ON DELETE SET NULL,
  -- { "driver_name": { "old": "JUAN CRUZ", "new": "PEDRO SANTOS" }, ... }
  -- Only columns that actually changed; JSON null for an absent side.
  changes      JSONB NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE mtop.audit_logs IS
  'Append-only audit trail. Rows are written exclusively by '
  'mtop.log_audit_change() triggers — never INSERT into this table directly.';

CREATE INDEX idx_audit_logs_franchise
  ON mtop.audit_logs (franchise_id, created_at DESC);
CREATE INDEX idx_audit_logs_record
  ON mtop.audit_logs (table_name, record_id, created_at DESC);
CREATE INDEX idx_audit_logs_actor
  ON mtop.audit_logs (actor_id, created_at DESC);

ALTER TABLE mtop.audit_logs ENABLE ROW LEVEL SECURITY;

-- Readable by any authenticated user; there is no INSERT/UPDATE/DELETE policy,
-- so the log is append-only from the application's point of view. The trigger
-- function is SECURITY DEFINER and so writes past RLS — the same pattern as
-- franchise_unit_history in 20260413000015_grant_effects.sql.
CREATE POLICY "Authenticated users can read audit_logs"
  ON mtop.audit_logs FOR SELECT TO authenticated USING (true);

GRANT SELECT ON mtop.audit_logs TO authenticated, service_role;

-- 20260413000004/5 set ALTER DEFAULT PRIVILEGES so every new table in this
-- schema hands authenticated full DML and service_role ALL. An audit table
-- must not inherit that. RLS already refuses writes from authenticated (there
-- is no policy for them), and the service role bypasses RLS entirely — so the
-- grant itself is withdrawn, which is the only thing that constrains the
-- service role. The trigger below is unaffected: SECURITY DEFINER runs it as
-- the table's owner. That owner can still clear the table, which is how
-- supabase/scripts/reset-sample-data.sql wipes it between test runs.
REVOKE INSERT, UPDATE, DELETE ON mtop.audit_logs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON mtop.audit_logs FROM service_role;

-- ---------------------------------------------------------------------------
-- 2. The trigger function
-- ---------------------------------------------------------------------------
-- Generic on purpose, so a second table can be audited later by adding a
-- trigger and nothing else.
--
--   TG_ARGV[0]  column holding the franchise id ('id' on mtop_franchises
--               itself, 'franchise_id' on anything hanging off it)
--   TG_ARGV[1]  comma-separated columns to ignore — housekeeping fields whose
--               churn would bury the changes a clerk actually cares about

CREATE OR REPLACE FUNCTION mtop.log_audit_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = mtop, public
AS $$
DECLARE
  v_old     JSONB;
  v_new     JSONB;
  v_ignored TEXT[] := string_to_array(coalesce(TG_ARGV[1], ''), ',');
  v_changes JSONB;
  v_actor   UUID := auth.uid();
BEGIN
  -- OLD is unassigned on INSERT and NEW on DELETE — reading either one there
  -- raises, so branch rather than leaning on CASE to short-circuit.
  IF TG_OP = 'INSERT' THEN
    v_old := '{}'::jsonb;
    v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := '{}'::jsonb;
  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  END IF;

  -- An operator's row can be touched by a service-role client or by SQL run
  -- in Studio, where there is no JWT and auth.uid() is NULL. Guard the
  -- foreign key too: a JWT for a user with no profile must not turn a
  -- legitimate franchise update into a constraint violation.
  IF v_actor IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM mtop.user_profiles p WHERE p.id = v_actor)
  THEN
    v_actor := NULL;
  END IF;

  SELECT jsonb_object_agg(
           k, jsonb_build_object('old', v_old -> k, 'new', v_new -> k)
         )
  INTO v_changes
  FROM jsonb_object_keys(v_old || v_new) AS t(k)
  WHERE NOT (k = ANY (v_ignored))
    AND (v_old -> k) IS DISTINCT FROM (v_new -> k)
    -- On create/delete, only carry the columns that held a value: the point
    -- of those entries is what was there, not the forty columns that weren't.
    AND NOT (TG_OP = 'INSERT' AND (v_new -> k) = 'null'::jsonb)
    AND NOT (TG_OP = 'DELETE' AND (v_old -> k) = 'null'::jsonb);

  -- An UPDATE that only bumped updated_at is not an event.
  IF v_changes IS NULL OR v_changes = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  INSERT INTO mtop.audit_logs (
    table_name, record_id, franchise_id, action, actor_id, changes
  ) VALUES (
    TG_TABLE_NAME,
    coalesce(v_new ->> 'id', v_old ->> 'id')::uuid,
    coalesce(v_new ->> TG_ARGV[0], v_old ->> TG_ARGV[0])::uuid,
    lower(TG_OP),
    v_actor,
    v_changes
  );

  RETURN NULL;  -- AFTER trigger; the return value is discarded
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Audit the franchise — operator, unit, status and driver all live here
-- ---------------------------------------------------------------------------
-- created_at/updated_at are the row's own bookkeeping and id never changes,
-- so logging them would only add noise. created_by is captured on the insert
-- entry by way of actor_id.

CREATE TRIGGER audit_mtop_franchises
  AFTER INSERT OR UPDATE OR DELETE ON mtop.mtop_franchises
  FOR EACH ROW
  EXECUTE FUNCTION mtop.log_audit_change('id', 'id,created_at,updated_at,created_by');

-- No backfill. Existing franchises have no change history to reconstruct, and
-- inventing "registered" rows from today's column values would put wrong data
-- in an audit table. The franchise's own created_at/created_by already gives
-- the registration event, and getFranchiseHistory() renders it from there.
