-- 2.5 Seed Data
-- Default roles, permissions, and role-permission mappings

-- Roles — task-aligned. A user can hold multiple roles.
INSERT INTO mtop.roles (name, code, description) VALUES
  ('Verification Officer', 'verification_officer', 'Intakes new applications and verifies documents'),
  ('Inspection Officer', 'inspection_officer', 'Conducts physical tricycle inspection'),
  ('Assessment Officer', 'assessment_officer', 'Creates and approves fee assessments'),
  ('Cashier', 'cashier', 'Records payments against approved assessments'),
  ('Approver', 'approver', 'Reviews completed applications and grants the MTOP'),
  ('Admin', 'admin', 'System administrator with full access');

-- Permissions
INSERT INTO mtop.permissions (code, description) VALUES
  ('application.create', 'Create new MTOP applications'),
  ('application.view', 'View MTOP applications'),
  ('application.verify', 'Verify application documents'),
  ('inspection.conduct', 'Conduct tricycle inspection'),
  ('assessment.create', 'Create fee assessment'),
  ('assessment.approve', 'Approve fee assessment'),
  ('payment.record', 'Record payment'),
  ('application.approve', 'Approve applications for granting'),
  ('application.grant', 'Grant MTOP permit'),
  ('negative_list.manage', 'Manage negative list entries'),
  ('reports.view', 'View reports'),
  ('admin.manage', 'Manage system settings and users');

-- Role-Permission Mappings

INSERT INTO mtop.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM mtop.roles r, mtop.permissions p
WHERE r.code = 'verification_officer'
  AND p.code IN ('application.create', 'application.view', 'application.verify', 'negative_list.manage');

INSERT INTO mtop.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM mtop.roles r, mtop.permissions p
WHERE r.code = 'inspection_officer'
  AND p.code IN ('application.view', 'inspection.conduct');

INSERT INTO mtop.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM mtop.roles r, mtop.permissions p
WHERE r.code = 'assessment_officer'
  AND p.code IN ('application.view', 'assessment.create', 'assessment.approve');

INSERT INTO mtop.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM mtop.roles r, mtop.permissions p
WHERE r.code = 'cashier'
  AND p.code IN ('application.view', 'payment.record');

INSERT INTO mtop.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM mtop.roles r, mtop.permissions p
WHERE r.code = 'approver'
  AND p.code IN ('application.view', 'application.approve', 'application.grant', 'reports.view');

-- Admin: all permissions
INSERT INTO mtop.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM mtop.roles r, mtop.permissions p
WHERE r.code = 'admin';
