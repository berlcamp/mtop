-- 2.5 Seed Data
-- Default offices, roles, permissions, and role-permission mappings

-- Offices
INSERT INTO mtop.offices (name, code) VALUES
  ('City Administrator''s Office', 'CADM'),
  ('City Treasurer''s Office', 'CTO');

-- Roles
INSERT INTO mtop.roles (name, code, description) VALUES
  ('CADM Staff', 'cadm_staff', 'City Administrator''s Office staff - handles verification and inspection'),
  ('CADM Head', 'cadm_head', 'City Administrator''s Office head - approves and grants MTOP'),
  ('CTO Staff', 'cto_staff', 'City Treasurer''s Office staff - handles assessment and payment'),
  ('CTO Head', 'cto_head', 'City Treasurer''s Office head - approves assessments'),
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

-- CADM Staff permissions
INSERT INTO mtop.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM mtop.roles r, mtop.permissions p
WHERE r.code = 'cadm_staff'
  AND p.code IN ('application.create', 'application.view', 'application.verify', 'inspection.conduct', 'negative_list.manage');

-- CADM Head permissions (all CADM Staff + approve + grant)
INSERT INTO mtop.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM mtop.roles r, mtop.permissions p
WHERE r.code = 'cadm_head'
  AND p.code IN ('application.create', 'application.view', 'application.verify', 'inspection.conduct', 'negative_list.manage', 'application.approve', 'application.grant');

-- CTO Staff permissions
INSERT INTO mtop.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM mtop.roles r, mtop.permissions p
WHERE r.code = 'cto_staff'
  AND p.code IN ('application.view', 'assessment.create', 'payment.record');

-- CTO Head permissions (all CTO Staff + approve assessment)
INSERT INTO mtop.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM mtop.roles r, mtop.permissions p
WHERE r.code = 'cto_head'
  AND p.code IN ('application.view', 'assessment.create', 'payment.record', 'assessment.approve');

-- Admin permissions (all)
INSERT INTO mtop.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM mtop.roles r, mtop.permissions p
WHERE r.code = 'admin';
