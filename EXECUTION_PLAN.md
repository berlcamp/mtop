# MTOP Renewal System — Execution Plan

Workflow + Compliance + Payment System for Motorized Tricycle Operator's Permit (MTOP) Renewal
LGU Ozamiz City

Tech Stack: Next.js 16 (App Router) + React 19 + TypeScript + Supabase + shadcn/ui + Tailwind CSS 4
Supabase Custom Schema: `mtop`
Reference: https://github.com/berlcamp/procurements-assets

---

## Phase 1: Project Setup

### 1.1 Initialize Next.js Project
- `npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir`
- Install dependencies:
  ```bash
  npm install @supabase/supabase-js @supabase/ssr
  npm install react-hook-form @hookform/resolvers zod
  npm install sonner next-themes lucide-react date-fns
  npm install class-variance-authority clsx tailwind-merge
  ```
- Configure path aliases in `tsconfig.json` (`@/components`, `@/lib`, `@/types`)

### 1.2 Supabase Setup
- Create Supabase project for MTOP
- Custom schema name: **`mtop`**
- Add `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Create Supabase clients:
  - `src/lib/supabase/client.ts` — Browser client (RLS enforced)
  - `src/lib/supabase/server.ts` — Server client (RLS enforced)
  - `src/lib/supabase/admin.ts` — Service role (bypasses RLS)
  - `src/lib/supabase/middleware.ts` — Request middleware
- All queries use `.schema("mtop")` — e.g.:
  ```typescript
  const { data } = await supabase
    .schema("mtop")
    .from("mtop_applications")
    .select("*")
  ```

### 1.3 Authentication Flow
- `src/app/auth/page.tsx` — Login page (Google OAuth via Supabase)
- `src/app/auth/callback/route.ts` — Exchange code for session, route based on profile state
- Middleware to protect `/dashboard/*` routes

### 1.4 Dashboard Shell Layout
- `src/app/dashboard/layout.tsx` — Shell with sidebar + topbar
- `src/components/layout/sidebar.tsx` — Role-based navigation with permission checks
- `src/components/layout/topbar.tsx` — User dropdown, breadcrumbs
- `src/components/layout/page-header.tsx` — Title + optional action buttons

#### Sidebar Navigation Structure:
```
MTOP System
├── Dashboard              (all roles)
├── Applications           (all roles, filtered by stage/office)
│   └── New Application    (CADM staff+)
├── Negative List          (CADM staff+)
├── Reports                (heads + admin)
└── Admin
    ├── Users              (admin)
    └── Settings           (admin)
```

#### Shell Layout:
```
┌─────────────────────────────────────┐
│  Sidebar (256px)  │  Topbar (56px)  │
├─────────────────┬───────────────────┤
│                 │                   │
│  Navigation     │   Main Content    │
│  (persistent)   │   (flex-1, p-6)   │
│                 │                   │
└─────────────────┴───────────────────┘
```

### 1.5 Install shadcn/ui Components
```bash
npx shadcn@latest init
npx shadcn@latest add button input select card dialog table badge alert
npx shadcn@latest add form label textarea checkbox separator
npx shadcn@latest add dropdown-menu sheet tooltip tabs
```

### 1.6 Global Styles & Design Tokens
- `src/app/globals.css` — OKLch color system, spacing tokens
- `src/lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)
- Dark mode support via `next-themes`

**Spacing System (4px base):**
```
p-6              — Page/section level
space-y-6        — Major section gaps
space-y-5        — Form field gaps
gap-4            — Card content, grids
gap-2            — Icon-to-text, button groups
```

**Typography:**
```
Page title       → text-2xl font-bold tracking-tight
Section heading  → text-lg font-semibold
Body             → text-sm (inside cards/tables)
IDs/Codes        → font-mono text-sm
```

---

## Phase 2: Database & Types

### 2.1 Create Custom Schema

```sql
CREATE SCHEMA IF NOT EXISTS mtop;
```

All tables live under the `mtop` schema. All Supabase client queries use `.schema("mtop")`.

### 2.2 Core Tables Migration

```sql
-- Organization
CREATE TABLE mtop.offices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE, -- 'CADM', 'CTO'
  division_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE mtop.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  office_id UUID REFERENCES offices(id),
  division_id UUID,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE mtop.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE, -- 'cadm_staff', 'cadm_head', 'cto_staff', 'cto_head', 'admin'
  description TEXT
);

CREATE TABLE mtop.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE mtop.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id),
  role_id UUID REFERENCES roles(id),
  granted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role_id)
);

CREATE TABLE mtop.role_permissions (
  role_id UUID REFERENCES roles(id),
  permission_id UUID REFERENCES permissions(id),
  PRIMARY KEY (role_id, permission_id)
);
```

### 2.3 MTOP Application Tables

```sql
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

-- Main applications table
CREATE TABLE mtop.mtop_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_number TEXT NOT NULL UNIQUE,
  applicant_name TEXT NOT NULL,
  applicant_address TEXT,
  contact_number TEXT,
  tricycle_body_number TEXT,
  plate_number TEXT,
  motor_number TEXT,
  chassis_number TEXT,
  route TEXT,
  status mtop_status DEFAULT 'for_verification',
  fiscal_year INTEGER DEFAULT EXTRACT(YEAR FROM now()),
  due_date DATE, -- for late renewal calculation
  submitted_at TIMESTAMPTZ DEFAULT now(),
  granted_at TIMESTAMPTZ,
  division_id UUID,
  created_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Documents checklist
CREATE TABLE mtop.mtop_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES mtop_applications(id) ON DELETE CASCADE,
  document_type mtop_document_type NOT NULL,
  file_url TEXT,
  is_verified BOOLEAN DEFAULT false,
  verified_by UUID REFERENCES user_profiles(id),
  verified_at TIMESTAMPTZ,
  remarks TEXT,
  UNIQUE(application_id, document_type)
);

-- Physical inspection
CREATE TABLE mtop.mtop_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES mtop_applications(id) ON DELETE CASCADE,
  inspector_id UUID REFERENCES user_profiles(id),
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
  application_id UUID REFERENCES mtop_applications(id) ON DELETE CASCADE,
  assessed_by UUID REFERENCES user_profiles(id),
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
  approved_by UUID REFERENCES user_profiles(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Payments
CREATE TABLE mtop.mtop_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID REFERENCES mtop_assessments(id),
  application_id UUID REFERENCES mtop_applications(id) ON DELETE CASCADE,
  or_number TEXT NOT NULL,
  amount_paid NUMERIC(10,2) NOT NULL,
  payment_date DATE DEFAULT CURRENT_DATE,
  payment_method TEXT DEFAULT 'cash',
  received_by UUID REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Approval / audit log
CREATE TABLE mtop.approval_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID REFERENCES mtop_applications(id) ON DELETE CASCADE,
  stage mtop_status NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('approved', 'rejected', 'returned', 'forwarded')),
  actor_id UUID REFERENCES user_profiles(id),
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Negative list
CREATE TABLE mtop.mtop_negative_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  added_by UUID REFERENCES user_profiles(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 2.4 RLS Policies
- Enable RLS on all tables
- Scope all queries by `division_id` where applicable
- Permission-based access for stage transitions

### 2.5 Seed Data
- Insert default offices: CADM, CTO
- Insert default roles: cadm_staff, cadm_head, cto_staff, cto_head, admin
- Insert default permissions:
  ```
  application.create, application.view, application.verify,
  inspection.conduct, assessment.create, assessment.approve,
  payment.record, application.approve, application.grant,
  negative_list.manage, reports.view, admin.manage
  ```
- Map role → permissions

### 2.6 Generate TypeScript Types
- `npx supabase gen types typescript --project-id <id> > src/types/database.ts`

---

## Phase 3: Application CRUD

### 3.1 Zod Schemas
File: `src/lib/schemas/mtop.ts`

```typescript
// New application schema
const applicationSchema = z.object({
  applicant_name: z.string().min(2),
  applicant_address: z.string().min(5),
  contact_number: z.string().min(7),
  tricycle_body_number: z.string().min(1),
  plate_number: z.string().min(1),
  motor_number: z.string().min(1),
  chassis_number: z.string().min(1),
  route: z.string().min(1),
  due_date: z.date().optional(),
})

// Inspection schema (12 boolean fields + result + remarks)
// Assessment schema (fee fields + total)
// Payment schema (or_number, amount_paid, payment_method)
```

### 3.2 Server Actions
File: `src/lib/actions/applications.ts`

- `createApplication(input)` — Insert + create document records for all 10 types
- `getApplications(filters)` — List with status/search/pagination
- `getApplication(id)` — Detail with documents, inspection, assessment, payments, logs
- `updateApplicationStatus(id, status, remarks)` — Stage transition + approval log

### 3.3 New Application Page
File: `src/app/dashboard/applications/new/page.tsx`

- Form with applicant info fields (react-hook-form + Zod)
- Tricycle details (body number, plate, motor, chassis)
- Route assignment
- On submit: creates application + 10 empty document records
- Redirect to application detail

### 3.4 Application List Page
File: `src/app/dashboard/applications/page.tsx`

- DataTable with columns: Application #, Applicant, Body #, Route, Status, Date, Actions
- Search by applicant name or application number
- Filter by status (tabs or dropdown)
- "New Application" button (permission-gated)
- Click row → navigate to detail

### 3.5 Application Detail Page
File: `src/app/dashboard/applications/[id]/page.tsx`

- **Layout:** 2/3 main content + 1/3 sidebar (responsive)
- **Main content:**
  - Applicant info card
  - Tricycle details card
  - Stage-specific action card (conditional based on status + user role)
- **Sidebar:**
  - ApprovalStepper (5 stages: Verification → Inspection → Assessment → Approval → Granted)
  - Summary card (applicant, dates, fees)
  - Timeline log (audit trail)

---

## Phase 4: Stage 1 — For Verification (CADM)

### 4.1 Document Checklist Component
File: `src/components/mtop/document-checklist.tsx`

- List of 10 required documents with:
  - Document name
  - File upload input (optional, for scanned copies)
  - Checkbox: "Verified" (CADM staff only)
  - Remarks field
- Progress indicator: "7/10 documents verified"

### 4.2 Negative List Check
- Query `mtop_negative_list` by applicant name
- Display warning banner if match found
- Block progression if on negative list

### 4.3 Verification Actions
File: `src/components/mtop/review-actions.tsx`

- **"Forward to Inspection"** button — requires all 10 documents verified + not on negative list
- **"Return"** button — with required remarks field
- Creates approval_log entry on action

### 4.4 Negative List Management Page
File: `src/app/dashboard/negative-list/page.tsx`

- DataTable: Name, Reason, Added By, Date, Status, Actions
- Add/Edit/Deactivate entries
- Search by name

---

## Phase 5: Stage 2 — For Inspection (CADM)

### 5.1 Inspection Checklist Component
File: `src/components/mtop/inspection-checklist.tsx`

12-point physical inspection form:

| # | Item | Pass/Fail |
|---|------|-----------|
| 1 | Clean Windshields | ☐ |
| 2 | Garbage Receptacle | ☐ |
| 3 | Functioning Horn (not excessively loud) | ☐ |
| 4 | Signal Lights (2 front + 2 back) | ☐ |
| 5 | Tail Light + License Plate Light | ☐ |
| 6 | Top Chain (extending to rear wheel) | ☐ |
| 7 | Headlights + Tail Light (white front, red rear, visible 5m, 6PM-6AM) | ☐ |
| 8 | Sidecar Interior Light (lighted while plying) | ☐ |
| 9 | Anti-noise Equipment / Silencer | ☐ |
| 10 | Body Number Sticker (identifiable from distance) | ☐ |
| 11 | Fully Functional Mufflers | ☐ |
| 12 | Road Worthiness | ☐ |

- Inspector name auto-filled from session
- Inspection date (default today)
- Overall result: auto-computed (all pass = "Passed", any fail = "Failed")
- General remarks textarea

### 5.2 Inspection Actions
- **"Forward to Assessment"** — requires result = "Passed"
- **"Fail & Return"** — auto-return with failed items listed in remarks
- Creates approval_log entry

### 5.3 Server Action
File: `src/lib/actions/inspections.ts`

- `createInspection(applicationId, checklist)` — Insert inspection record
- `getInspection(applicationId)` — Get latest inspection for application

---

## Phase 6: Stage 3 — For Assessment (CTO)

### 6.1 Fee Assessment Form
File: `src/components/mtop/fee-assessment-form.tsx`

**Standard Fees (per Ordinance No. 1059-13, Section 4E.02):**

| Fee | Amount |
|-----|--------|
| Filing Fee (annual) | ₱400.00 |
| Supervision Fee (annual) | ₱180.00 |
| Confirmation Fee (annual) | ₱65.00 |
| Mayor's Permit Fee (annual) | ₱300.00 |
| Franchise (annual) | ₱400.00 |
| Police Clearance (annual) | ₱50.00 |
| Health Fee (annual) | ₱50.00 |
| Legal Research Fee (annual) | ₱65.00 |
| Parking Fee (₱75.00/month × 12) | ₱900.00 |
| **Subtotal** | **₱2,410.00** |

**Other Fees (if applicable):**

| Fee | Amount |
|-----|--------|
| Change of Motor (Power Train) | ₱1,000.00 |
| Replacement of Loss Plate | ₱500.00 |

**Late Renewal Penalty:**

| Condition | Penalty |
|-----------|---------|
| First 30 days late | ₱50.00 |
| Each succeeding month | ₱75.00 |

### 6.2 Fee Calculation Logic
File: `src/lib/actions/assessments.ts`

```typescript
const STANDARD_FEES = {
  filing_fee: 400.00,
  supervision_fee: 180.00,
  confirmation_fee: 65.00,
  mayors_permit_fee: 300.00,
  franchise_fee: 400.00,
  police_clearance_fee: 50.00,
  health_fee: 50.00,
  legal_research_fee: 65.00,
  parking_fee: 900.00,
}

function calculateLatePenalty(dueDate: Date, renewalDate: Date): number {
  const daysLate = differenceInDays(renewalDate, dueDate)
  if (daysLate <= 0) return 0
  if (daysLate <= 30) return 50.00
  const additionalMonths = Math.ceil((daysLate - 30) / 30)
  return 50.00 + (additionalMonths * 75.00)
}
```

- Auto-populate standard fees (editable by CTO staff)
- Auto-calculate late penalty based on due_date vs current date
- Toggle optional fees (change of motor, replacement plate)
- Show computed total

### 6.3 CTO Head Approval
- CTO Head reviews and approves the assessment
- Creates approval_log entry

### 6.4 Payment Recording
File: `src/components/mtop/payment-form.tsx`

- OR Number (required)
- Amount Paid (must match assessed total)
- Payment Date (default today)
- Payment Method (cash/check)
- Received By (auto-filled from session)
- On submit: record payment + forward to "For Approval"

### 6.5 Server Actions
File: `src/lib/actions/assessments.ts`
File: `src/lib/actions/payments.ts`

- `createAssessment(applicationId, fees)` — Insert assessment
- `approveAssessment(assessmentId)` — CTO head approval
- `recordPayment(applicationId, paymentData)` — Insert payment + transition status

---

## Phase 7: Stage 4-5 — For Approval & Granted (CADM)

### 7.1 Approval Review
- CADM Head reviews complete application:
  - All documents verified
  - Inspection passed
  - Fees assessed and paid
- **"Approve & Grant MTOP"** button
- **"Reject"** button with required reason
- Creates approval_log entry

### 7.2 Grant MTOP
- Set status to "granted"
- Set `granted_at` timestamp
- Application appears in "Granted" list for claiming

### 7.3 Claim Tracking (optional enhancement)
- Mark as "claimed" when client picks up MTOP
- Record claim date and released_by

---

## Phase 8: Dashboard & Reports

### 8.1 Dashboard Home
File: `src/app/dashboard/page.tsx`

**Stat Cards (4-column grid):**
- Total Applications (current year)
- Pending (in-process across all stages)
- Granted (this year)
- Revenue Collected (total payments)

**Pipeline View:**
```
For Verification (12) → For Inspection (8) → For Assessment (5) → For Approval (3) → Granted (142)
```

**Recent Activity:**
- Latest 10 approval_log entries with timeline component

### 8.2 Reports Page
File: `src/app/dashboard/reports/page.tsx`

- Applications by status (bar chart or table)
- Revenue summary by fee type
- Monthly renewal trends
- Late renewal statistics
- Export to CSV

---

## Reusable Components (from reference project)

### Shared Components to Build:
| Component | File | Purpose |
|-----------|------|---------|
| DataTable | `src/components/shared/data-table.tsx` | Generic table with search, filters, pagination |
| StatusBadge | `src/components/shared/status-badge.tsx` | Color-coded status display |
| ApprovalStepper | `src/components/shared/approval-stepper.tsx` | 5-step workflow visualization |
| TimelineLog | `src/components/shared/timeline-log.tsx` | Audit trail display |
| AmountDisplay | `src/components/shared/amount-display.tsx` | Currency formatting (₱) |
| Forbidden | `src/components/shared/forbidden.tsx` | Access denied UI |

### Status Badge Color Mapping:
| Status | Color |
|--------|-------|
| For Verification | `bg-yellow-100 text-yellow-800` |
| For Inspection | `bg-blue-100 text-blue-800` |
| For Assessment | `bg-orange-100 text-orange-800` |
| For Approval | `bg-violet-100 text-violet-800` |
| Granted | `bg-green-100 text-green-800` |
| Rejected | `bg-red-100 text-red-800` |
| Returned | `bg-red-100 text-red-800` |

---

## Roles & Permissions Matrix

| Role | Office | Permissions |
|------|--------|------------|
| CADM Staff | CADM | `application.create`, `application.view`, `application.verify`, `inspection.conduct`, `negative_list.manage` |
| CADM Head | CADM | All CADM Staff + `application.approve`, `application.grant` |
| CTO Staff | CTO | `application.view`, `assessment.create`, `payment.record` |
| CTO Head | CTO | All CTO Staff + `assessment.approve` |
| Admin | — | All permissions + `admin.manage`, `reports.view` |

---

## Custom Hooks to Build

| Hook | File | Purpose |
|------|------|---------|
| `useAuth` | `src/lib/hooks/use-auth.ts` | Current user + loading state |
| `usePermissions` | `src/lib/hooks/use-permissions.ts` | `can()`, `canAny()`, `canAll()` |
| `useProfile` | `src/lib/hooks/use-profile.ts` | User profile context |

---

## Notes

- **CADM** = City Administrator's Office — handles Verification, Inspection, Approval, and Granting stages
- **CTO** = City Treasurer's Office — handles Assessment and Payment stages
- All database tables live under the `mtop` custom schema — all queries use `.schema("mtop")`
- All server actions return `{ error: string | null, data?: T }` pattern
- All mutations call `revalidatePath()` for cache invalidation
- All stage transitions create an `approval_logs` entry for audit trail
- Fee schedule based on **Ordinance No. 1059-13** (The Revised Omnibus Revenue Code of Ozamiz City), Section 4E.02
