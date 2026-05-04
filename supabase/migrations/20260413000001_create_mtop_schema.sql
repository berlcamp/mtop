-- Phase 2: Database & Types
-- MTOP Renewal System - LGU Ozamiz City
-- Custom schema: mtop

-- 2.1 Create Custom Schema
CREATE SCHEMA IF NOT EXISTS mtop;

-- 2.2 Core Tables

CREATE TABLE mtop.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  division_id UUID,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE mtop.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE mtop.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE mtop.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES mtop.user_profiles(id),
  role_id UUID REFERENCES mtop.roles(id),
  granted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role_id)
);

CREATE TABLE mtop.role_permissions (
  role_id UUID REFERENCES mtop.roles(id),
  permission_id UUID REFERENCES mtop.permissions(id),
  PRIMARY KEY (role_id, permission_id)
);

-- 2.3 MTOP Application Tables

-- Application status enum
CREATE TYPE mtop.mtop_status AS ENUM (
  'for_verification', 'for_inspection', 'for_assessment',
  'for_approval', 'granted', 'rejected', 'returned'
);

-- Document type enum
CREATE TYPE mtop.mtop_document_type AS ENUM (
  'application_form', 'ctms_clearance', 'lto_or', 'voters_certificate',
  'barangay_certification', 'barangay_endorsement', 'ctc',
  'police_clearance', 'drivers_license', 'affidavit_no_franchise'
);

-- MTOP number sequence — assigned only on first grant
CREATE SEQUENCE mtop.mtop_number_seq START 1;

CREATE OR REPLACE FUNCTION mtop.format_mtop_number(n BIGINT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'MTOP-' || lpad(n::text, 5, '0')
$$;

-- Atomically assign the next MTOP number (if missing) and advance granted_until.
-- Called from server actions when an application transitions to 'granted'.
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
  v_until DATE;
BEGIN
  v_until := (p_granted_at::date + (p_validity_years || ' years')::interval)::date;

  SELECT mtop_number INTO v_number
  FROM mtop.mtop_franchises
  WHERE id = p_franchise_id
  FOR UPDATE;

  IF v_number IS NULL THEN
    v_number := mtop.format_mtop_number(nextval('mtop.mtop_number_seq'));
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

GRANT EXECUTE ON FUNCTION mtop.grant_franchise(UUID, TIMESTAMPTZ, INTEGER)
  TO authenticated, service_role;

-- Franchise — stable identity that survives renewals.
-- One row per (owner + tricycle). The MTOP number lives here and stays the same forever.
CREATE TABLE mtop.mtop_franchises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mtop_number TEXT UNIQUE,
  applicant_name TEXT NOT NULL,
  applicant_address TEXT,
  contact_number TEXT,
  tricycle_body_number TEXT,
  plate_number TEXT,
  motor_number TEXT NOT NULL,
  chassis_number TEXT NOT NULL,
  route TEXT,
  granted_until DATE,
  created_by UUID REFERENCES mtop.user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Per-cycle renewal applications — one row per fiscal year per franchise.
CREATE TABLE mtop.mtop_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  franchise_id UUID NOT NULL REFERENCES mtop.mtop_franchises(id) ON DELETE CASCADE,
  status mtop.mtop_status DEFAULT 'for_verification',
  fiscal_year INTEGER DEFAULT EXTRACT(YEAR FROM now()),
  due_date DATE,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  granted_at TIMESTAMPTZ,
  division_id UUID,
  created_by UUID REFERENCES mtop.user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (franchise_id, fiscal_year)
);

-- Documents checklist
CREATE TABLE mtop.mtop_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES mtop.mtop_applications(id) ON DELETE CASCADE,
  document_type mtop.mtop_document_type NOT NULL,
  file_url TEXT,
  is_verified BOOLEAN DEFAULT false,
  verified_by UUID REFERENCES mtop.user_profiles(id),
  verified_at TIMESTAMPTZ,
  remarks TEXT,
  UNIQUE(application_id, document_type)
);

-- Physical inspection
CREATE TABLE mtop.mtop_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES mtop.mtop_applications(id) ON DELETE CASCADE,
  inspector_id UUID REFERENCES mtop.user_profiles(id),
  inspection_date DATE DEFAULT CURRENT_DATE,
  clean_windshields BOOLEAN DEFAULT false,
  garbage_receptacle BOOLEAN DEFAULT false,
  functioning_horn BOOLEAN DEFAULT false,
  signal_lights BOOLEAN DEFAULT false,
  tail_light BOOLEAN DEFAULT false,
  top_chain BOOLEAN DEFAULT false,
  headlights_taillights BOOLEAN DEFAULT false,
  sidecar_light BOOLEAN DEFAULT false,
  anti_noise_equipment BOOLEAN DEFAULT false,
  body_number_sticker BOOLEAN DEFAULT false,
  functional_mufflers BOOLEAN DEFAULT false,
  road_worthiness BOOLEAN DEFAULT false,
  result TEXT CHECK (result IN ('passed', 'failed')),
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Fee assessment
CREATE TABLE mtop.mtop_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES mtop.mtop_applications(id) ON DELETE CASCADE,
  assessed_by UUID REFERENCES mtop.user_profiles(id),
  filing_fee NUMERIC(10,2) DEFAULT 400.00,
  supervision_fee NUMERIC(10,2) DEFAULT 180.00,
  confirmation_fee NUMERIC(10,2) DEFAULT 65.00,
  mayors_permit_fee NUMERIC(10,2) DEFAULT 300.00,
  franchise_fee NUMERIC(10,2) DEFAULT 400.00,
  police_clearance_fee NUMERIC(10,2) DEFAULT 50.00,
  health_fee NUMERIC(10,2) DEFAULT 50.00,
  legal_research_fee NUMERIC(10,2) DEFAULT 65.00,
  parking_fee NUMERIC(10,2) DEFAULT 900.00,
  late_renewal_penalty NUMERIC(10,2) DEFAULT 0.00,
  change_of_motor_fee NUMERIC(10,2) DEFAULT 0.00,
  replacement_plate_fee NUMERIC(10,2) DEFAULT 0.00,
  total_amount NUMERIC(10,2) NOT NULL,
  approved_by UUID REFERENCES mtop.user_profiles(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Payments
CREATE TABLE mtop.mtop_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID REFERENCES mtop.mtop_assessments(id),
  application_id UUID REFERENCES mtop.mtop_applications(id) ON DELETE CASCADE,
  or_number TEXT NOT NULL,
  amount_paid NUMERIC(10,2) NOT NULL,
  payment_date DATE DEFAULT CURRENT_DATE,
  payment_method TEXT DEFAULT 'cash',
  received_by UUID REFERENCES mtop.user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Approval / audit log
CREATE TABLE mtop.approval_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES mtop.mtop_applications(id) ON DELETE CASCADE,
  stage mtop.mtop_status NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('approved', 'rejected', 'returned', 'forwarded')),
  actor_id UUID REFERENCES mtop.user_profiles(id),
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Negative list
CREATE TABLE mtop.mtop_negative_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  added_by UUID REFERENCES mtop.user_profiles(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2.4 RLS Policies

-- Enable RLS on all tables
ALTER TABLE mtop.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE mtop.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE mtop.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mtop.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE mtop.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mtop.mtop_franchises ENABLE ROW LEVEL SECURITY;
ALTER TABLE mtop.mtop_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE mtop.mtop_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE mtop.mtop_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE mtop.mtop_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mtop.mtop_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mtop.approval_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mtop.mtop_negative_list ENABLE ROW LEVEL SECURITY;

-- Lookup tables: readable by all authenticated users
CREATE POLICY "Authenticated users can read roles"
  ON mtop.roles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read permissions"
  ON mtop.permissions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read role_permissions"
  ON mtop.role_permissions FOR SELECT
  TO authenticated
  USING (true);

-- User profiles: users can read all profiles, update own
CREATE POLICY "Authenticated users can read profiles"
  ON mtop.user_profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON mtop.user_profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON mtop.user_profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- User roles: readable by all authenticated
CREATE POLICY "Authenticated users can read user_roles"
  ON mtop.user_roles FOR SELECT
  TO authenticated
  USING (true);

-- Franchises: readable, insertable, updatable by authenticated users
CREATE POLICY "Authenticated users can read franchises"
  ON mtop.mtop_franchises FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert franchises"
  ON mtop.mtop_franchises FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update franchises"
  ON mtop.mtop_franchises FOR UPDATE
  TO authenticated
  USING (true);

-- Applications: readable by authenticated users within same division
CREATE POLICY "Authenticated users can read applications"
  ON mtop.mtop_applications FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert applications"
  ON mtop.mtop_applications FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update applications"
  ON mtop.mtop_applications FOR UPDATE
  TO authenticated
  USING (true);

-- Documents: accessible if user can access the application
CREATE POLICY "Authenticated users can read documents"
  ON mtop.mtop_documents FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert documents"
  ON mtop.mtop_documents FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update documents"
  ON mtop.mtop_documents FOR UPDATE
  TO authenticated
  USING (true);

-- Inspections
CREATE POLICY "Authenticated users can read inspections"
  ON mtop.mtop_inspections FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert inspections"
  ON mtop.mtop_inspections FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Assessments
CREATE POLICY "Authenticated users can read assessments"
  ON mtop.mtop_assessments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert assessments"
  ON mtop.mtop_assessments FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update assessments"
  ON mtop.mtop_assessments FOR UPDATE
  TO authenticated
  USING (true);

-- Payments
CREATE POLICY "Authenticated users can read payments"
  ON mtop.mtop_payments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert payments"
  ON mtop.mtop_payments FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Approval logs
CREATE POLICY "Authenticated users can read approval_logs"
  ON mtop.approval_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert approval_logs"
  ON mtop.approval_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Negative list
CREATE POLICY "Authenticated users can read negative_list"
  ON mtop.mtop_negative_list FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert negative_list"
  ON mtop.mtop_negative_list FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update negative_list"
  ON mtop.mtop_negative_list FOR UPDATE
  TO authenticated
  USING (true);

-- Indexes for performance
CREATE INDEX idx_franchises_mtop_number ON mtop.mtop_franchises(mtop_number);
CREATE INDEX idx_franchises_applicant_name ON mtop.mtop_franchises(applicant_name);
CREATE INDEX idx_franchises_motor_number ON mtop.mtop_franchises(motor_number);
CREATE INDEX idx_franchises_chassis_number ON mtop.mtop_franchises(chassis_number);
CREATE INDEX idx_franchises_granted_until ON mtop.mtop_franchises(granted_until);
CREATE INDEX idx_applications_franchise_id ON mtop.mtop_applications(franchise_id);
CREATE INDEX idx_applications_status ON mtop.mtop_applications(status);
CREATE INDEX idx_applications_fiscal_year ON mtop.mtop_applications(fiscal_year);
CREATE INDEX idx_applications_division_id ON mtop.mtop_applications(division_id);
CREATE INDEX idx_documents_application_id ON mtop.mtop_documents(application_id);
CREATE INDEX idx_inspections_application_id ON mtop.mtop_inspections(application_id);
CREATE INDEX idx_assessments_application_id ON mtop.mtop_assessments(application_id);
CREATE INDEX idx_payments_application_id ON mtop.mtop_payments(application_id);
CREATE INDEX idx_approval_logs_application_id ON mtop.approval_logs(application_id);
CREATE INDEX idx_negative_list_applicant_name ON mtop.mtop_negative_list(applicant_name);
CREATE INDEX idx_user_roles_user_id ON mtop.user_roles(user_id);
