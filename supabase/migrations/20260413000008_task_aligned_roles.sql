-- Replace office-aligned roles (cadm_staff, cadm_head, cto_staff, cto_head)
-- with task-aligned roles. Admin role is preserved.
-- A user can hold multiple roles.

-- 1. Wipe existing role assignments and old roles. Project has no production
--    user-role data yet; admin profiles get re-attached to the new admin role.

DELETE FROM mtop.role_permissions
WHERE role_id IN (
  SELECT id FROM mtop.roles
  WHERE code IN ('cadm_staff', 'cadm_head', 'cto_staff', 'cto_head')
);

DELETE FROM mtop.user_roles
WHERE role_id IN (
  SELECT id FROM mtop.roles
  WHERE code IN ('cadm_staff', 'cadm_head', 'cto_staff', 'cto_head')
);

DELETE FROM mtop.roles
WHERE code IN ('cadm_staff', 'cadm_head', 'cto_staff', 'cto_head');

-- 2. Add new task-aligned roles (idempotent on code).

INSERT INTO mtop.roles (name, code, description) VALUES
  ('Verification Officer', 'verification_officer', 'Intakes new applications and verifies documents'),
  ('Inspection Officer',   'inspection_officer',   'Conducts physical tricycle inspection'),
  ('Assessment Officer',   'assessment_officer',   'Creates and approves fee assessments'),
  ('Cashier',              'cashier',              'Records payments against approved assessments'),
  ('Approver',             'approver',             'Reviews completed applications and grants the MTOP')
ON CONFLICT (code) DO NOTHING;

-- 3. Map permissions. Skip rows that already exist so the migration is replayable.

INSERT INTO mtop.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM mtop.roles r, mtop.permissions p
WHERE r.code = 'verification_officer'
  AND p.code IN ('application.create', 'application.view', 'application.verify', 'negative_list.manage')
ON CONFLICT DO NOTHING;

INSERT INTO mtop.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM mtop.roles r, mtop.permissions p
WHERE r.code = 'inspection_officer'
  AND p.code IN ('application.view', 'inspection.conduct')
ON CONFLICT DO NOTHING;

INSERT INTO mtop.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM mtop.roles r, mtop.permissions p
WHERE r.code = 'assessment_officer'
  AND p.code IN ('application.view', 'assessment.create', 'assessment.approve')
ON CONFLICT DO NOTHING;

INSERT INTO mtop.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM mtop.roles r, mtop.permissions p
WHERE r.code = 'cashier'
  AND p.code IN ('application.view', 'payment.record')
ON CONFLICT DO NOTHING;

INSERT INTO mtop.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM mtop.roles r, mtop.permissions p
WHERE r.code = 'approver'
  AND p.code IN ('application.view', 'application.approve', 'application.grant', 'reports.view')
ON CONFLICT DO NOTHING;
