# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev       # start dev server on http://localhost:3000
npm run build     # production build
npm run lint      # ESLint (Next.js config, v9 flat config in eslint.config.mjs)
```

There is no test suite.

## Architecture

**MTOP System** — Motorized Tricycle Operator's Permit renewal workflow for LGU Ozamiz City. Handles document verification, physical inspection, fee assessment, payment recording, and permit issuance.

### Stack

- **Next.js 16.2.3** with App Router and React 19. Read `node_modules/next/dist/docs/` before writing Next.js code — this version has breaking API changes.
- **Supabase** (`@supabase/ssr`) for auth and database. All data lives in a custom `mtop` Postgres schema; every Supabase query must call `.schema("mtop")` before `.from(...)`.
- **Tailwind v4** + **shadcn/ui** (style: `base-nova`, color: `neutral`). Add new components with `npx shadcn add <component>`.
- **Zod v4** + **react-hook-form** for form validation.

### Auth Flow

Authentication is Google OAuth only. There is **no `middleware.ts`** — session refresh runs through `src/proxy.ts` (exported as `proxy`, not `middleware`), which Next.js picks up via the `config.matcher` export in that file.

OAuth callback at `/auth/callback/route.ts`:
1. Exchanges the OAuth code for a session.
2. Checks `mtop.user_profiles` for a matching record (by `id`, then by `email` for pre-registered users).
3. On first login of a pre-registered user, migrates the placeholder profile to the real auth UID using the admin client.
4. Redirects unauthorized users to `/auth?error=unauthorized` and signs them out.

### Supabase Client Files

| File | Usage |
|---|---|
| `src/lib/supabase/server.ts` | Server Components and Route Handlers — reads cookies via `next/headers` |
| `src/lib/supabase/client.ts` | Client Components — singleton browser client |
| `src/lib/supabase/admin.ts` | Server-only — service role key, bypasses RLS; validates JWT role on init |
| `src/lib/supabase/proxy.ts` | Session refresh logic called by `src/proxy.ts` |

### Data Layer

All database mutations are **Server Actions** in `src/lib/actions/`. Each action file (`applications.ts`, `assessments.ts`, `requirements.ts`, `inspections.ts`, `payments.ts`, `transaction-types.ts`, etc.) uses `"use server"` and calls `createClient()` from `server.ts`. Actions return `{ error: string | null, data: ... }` — never throw to the client.

Application status flows through these stages in order:
`for_verification` → `for_inspection` → `for_assessment` → `for_approval` → `granted`

Side exits: `rejected` (terminal) and `returned`.

A return pauses an application without unwinding any of its work — cleared requirements, inspection result, assessment and payments all stay. `reopenApplication()` puts it back at the stage it was returned from, derived server-side by `reopenTargetStage()` (`src/lib/application-flow.ts`) from the newest `approval_logs` row naming a pipeline stage; the client never names the target stage, it only labels the button. Reopening is logged as a `forwarded` entry, since `approval_logs.action` has no `reopened` value. A returned application still counts as the franchise's one in-flight application, so reopening can't collide with `idx_applications_one_in_flight_per_franchise`. The button is gated on the permission for the stage being resumed (`stagePermission()`), which is the same permission that allowed the return in the first place.

Every status change inserts a row into `mtop.approval_logs`.

### Franchise vs Application

The MTOP number is the **stable franchise identifier**, not a per-application number. Two tables back this:

- `mtop.mtop_franchises` — owner + tricycle identity (motor, chassis, plate, body, route, address, contact). Holds `mtop_number` and `granted_until`. Same row across renewals.
- `mtop.mtop_applications` — one transaction filed against a franchise via `franchise_id`, typed by `transaction_type_id`. A partial unique index allows **at most one in-flight application per franchise** (statuses other than `granted`/`rejected`); there is no longer a one-row-per-fiscal-year constraint, because a franchise can legitimately file, say, an annual confirmation and a change of unit in the same year.

Creation flow (`src/lib/actions/applications.ts`):
- `createNewFranchiseApplication` registers a brand-new franchise + first application. Rejected if `(motor_number, chassis_number)` already exists.
- `createFranchiseTransaction` files any of the six transactions against an existing franchise. The franchise must already be granted. The renewal-window rule (`today >= granted_until − system_settings.renewal_window_days`) applies **only** to `renewal`. Blocked if another application is in-flight.
- `searchFranchises(query)` powers the lookup on the new-application page; `searchFranchisesGlobal(query)` in `src/lib/actions/search.ts` powers the topbar search (⌘K), which resolves a hit to its most recent application.

`mtop.grant_franchise(application_id, granted_at, validity_years)` is a `SECURITY DEFINER` Postgres function that runs when an application transitions to `granted`. It looks up the application's `transaction_type.grant_effect` and branches:

| `grant_effect` | Transaction | What it does |
|---|---|---|
| `issue_number` | New Franchise | Assigns the next MTOP number via `mtop.next_mtop_number(year)` (year-prefixed, `2026-0001`) and sets `granted_until` |
| `extend_validity` | Renewal | Advances `granted_until` to `granted_at + validity_years`, keeps the number |
| `replace_unit` | Change of Unit | Copies `new_motor_number`/`new_chassis_number`/`new_plate_number` from the application onto the franchise; logs the old values to `mtop.franchise_unit_history`. `granted_until` is untouched — replacing a unit never extends the renewal due date |
| `transfer_owner` | Change of Ownership | Copies `new_applicant_name`/`new_applicant_address`/`new_contact_number` from the application onto the franchise; logs the old values to `mtop.franchise_ownership_history` |
| `confirm_year` | Annual Confirmation Slip | Sets `last_confirmed_at`; no change to number or validity |
| `reprint_permit` | Re-Issuance | Sets `last_reissued_at`; no change to number or validity |
| `close_franchise` | Closure | Sets `franchise_status = 'closed'` and `closed_at`; `granted_until`/`mtop_number` are left as history |

The `new_*` columns on `mtop_applications` are staged by `createFranchiseTransaction` at filing time and applied only here — the identity change (unit or owner) takes effect on grant, not on filing. `mtop.mtop_franchises.franchise_status` (`active` / `closed` / `abandoned` / `revoked` / `cancelled`) gates new filings — `createFranchiseTransaction` and the franchise lookup both refuse a non-`active` franchise. Only `close_franchise` sets it today; the 120-day abandonment sweep and 3-violation revocation from the ordinance are not implemented.

System settings drive both the validity period (`permit_validity_years`, default 3) and renewal window (`renewal_window_days`, default 90); managed in `src/lib/actions/settings.ts`.

### Transactions and Requirements

The city runs **seven** transactions over a franchise, seeded in `mtop.transaction_types`:
`new_franchise`, `renewal`, `annual_confirmation`, `change_unit`, `change_ownership`, `reissuance`, `closure`.

Each row carries `grant_effect` (what granting it does to the franchise), `requires_existing_franchise` and `requires_inspection`. The UI reads `name`, `description` and `when_to_use` straight from this table, so wording changes need no code change.

Checklists are **reference data, not code**:

- `mtop.requirements` — the catalogue (~37 items), each with a `kind`: `document`, `payment`, `inspection`, `appearance`, `photo` or `surrender`. The kind decides where the item is cleared, because the city's paper checklist mixes all six into one column.
- `mtop.transaction_requirements` — which requirements each transaction asks for, with `is_mandatory`, `is_conditional`, `note` (per-transaction wording) and `sort_order`.
- `mtop.mtop_application_requirements` — the per-application rows, copied from the matrix by `seedApplicationChildren` at creation. (This is the old `mtop_documents` table; the `mtop_document_type` enum is gone.)

Only **mandatory, non-conditional** items block forwarding out of verification — see `isBlocking` in `src/lib/requirements.ts`. Conditional items (e.g. the Affidavit of No Franchise, which the ordinance requires only for units from an abandoned MTOP) show as "If applicable" and never block.

To add or reword a checklist item, `INSERT`/`UPDATE` these tables. Do not add TypeScript arrays of requirement codes.

### Franchise Ownership Rules

Two hard rules, enforced in the database (`20260413000018_one_operator_per_franchise.sql`) so no code path can bypass them:

1. **One franchise per operator** — a partial unique index on `mtop.normalize_operator_name(applicant_name)` `WHERE franchise_status = 'active'`. Closed/abandoned/revoked franchises stop counting, so surrendering one frees the operator to apply again.
2. **One operator per franchise** — `CHECK` constraints on `mtop_franchises.applicant_name` and `mtop_applications.new_applicant_name` reject co-ownership markers (`&`, `/`, standalone `AND`, `ET AL`). Commas are allowed — `DELA CRUZ, JUAN` is one person written surname-first.

Name matching is normalised for case, spacing and punctuation but is **not fuzzy**: `JUAN DELA CRUZ` and `JUAN P. DELA CRUZ` are two different operators.

`src/lib/operator-name.ts` mirrors both SQL helpers so forms can warn early and the actions can return a readable sentence — but all real matching goes through `mtop.find_operator_active_franchise()` (an RPC that hits the unique index), so the TS copy can't drift from the constraint. `grant_franchise()` re-checks on `transfer_owner`, since a successor could acquire their own franchise between filing and grant.

### Audit Trail

Every change to a franchise is logged by a database trigger, not by the server actions — `mtop.log_audit_change()` on `mtop.mtop_franchises` (`20260413000019_audit_trail.sql`). A write path that forgets to log leaves a hole nobody can see from the application side, so the capture point is the table itself: granting a transaction, the photo/driver editor, a fix typed into Studio and a script all land in `mtop.audit_logs` alike.

- `mtop.audit_logs` — `table_name`, `record_id`, `franchise_id`, `action` (`insert`/`update`/`delete`), `actor_id` (`auth.uid()`, null for service-role writes), and `changes` as `{ column: { old, new } }` holding **only** the columns that actually moved. Append-only: RLS grants `SELECT` and nothing else, and the trigger is `SECURITY DEFINER` so it writes past that.
- The trigger takes the franchise-key column and an ignore list as arguments (`'id'`, `'id,created_at,updated_at,created_by'`), so auditing a second table is a `CREATE TRIGGER` and nothing else.
- It does **not** replace `approval_logs`, `franchise_unit_history` or `franchise_ownership_history`. Those tie a change to the application that authorised it, which a trigger can't know; the audit log is the catch-all underneath.

`getFranchiseHistory()` (`src/lib/actions/audit.ts`) merges all five sources into one chronological `FranchiseHistoryEvent[]`. Column names and raw values are turned into readable lines by `src/lib/audit.ts`, which also tags each column as `operator` / `driver` / `unit` / `franchise` — that grouping is what the timeline's filters use, since the ordinance treats the operator and the driver as separate people with separate histories. Franchises created before the trigger existed have no `insert` row, so the registration event is synthesised from `created_at`/`created_by`; there is no backfill, because inventing rows from today's values would put wrong data in an audit table.

It renders via `HistoryTimeline` (`src/components/shared/history-timeline.tsx`) in two places: the full trail under the History tab of `/dashboard/franchises/[id]`, and the last six entries on the application detail page.

### Associations

Most motorcabs belong to an operators' association (MODA); strikers operate without one, so `association_id` is nullable and "No association" is the picker's default first option. `mtop.associations` holds the registry (name, president, contact number, `is_active`), seeded from the AOMODA directory with 70 entries, and `mtop_franchises.association_id` links each franchise to one.

It is reference data, editable at `/dashboard/admin/associations` (gated on `admin.manage`) via `src/lib/actions/associations.ts` — presidents and contact numbers change every election cycle. Deactivating hides an association from new applications but keeps it on the franchises already using it; deleting is refused while any franchise references it.

`AssociationSelect` (`src/components/mtop/association-select.tsx`) is the picker used by both franchise forms. It is a native `<select>` so it registers directly with react-hook-form and gets keyboard type-ahead for the ~70 options; it lists "No association (striker)" first, then only active associations, plus the franchise's own current one if that has since been deactivated.

### Types

`src/types/database.ts` contains hand-maintained TypeScript types for all `mtop` schema tables and enums. Regenerate with:
```bash
npx supabase gen types typescript --project-id <id> > src/types/database.ts
```

### Permissions

`usePermissions()` hook (`src/lib/hooks/use-permissions.ts`) fetches the current user's role codes from `mtop.user_roles → mtop.role_permissions → mtop.permissions` and exposes `can(code)`, `canAny(...codes)`, `canAll(...codes)`.

`useProfile()` is provided by `ProfileProvider` in the dashboard layout — gives access to `full_name`, `email`, and `avatar_url`.

### Component Structure

- `src/components/ui/` — shadcn primitives (do not hand-edit these)
- `src/components/layout/` — `Sidebar`, `Topbar`, `PageHeader`, `NavigationProgress`
- `src/components/shared/` — reusable domain-agnostic components (`StatusBadge`, `ApprovalStepper`, `TimelineLog`, `ExpirationBadge`)
- `src/components/mtop/` — domain-specific forms (`RequirementChecklist`, `InspectionChecklist`, `FeeAssessmentForm`, `PaymentForm`)

### Route Structure

All authenticated routes live under `/dashboard`. The dashboard layout (`src/app/dashboard/layout.tsx`) is a **Client Component** that wraps children in `ProfileProvider` + `SidebarProvider`.

Page files (`page.tsx`) are Server Components; heavy client logic is split into `*-content.tsx` Client Components alongside them.

`/dashboard/franchises/[id]` is the franchise (operator) record — identity, current unit and driver, every transaction filed against it, and the full audit trail. It is reached from the "Franchise record" button on an application, not from the sidebar; there is no franchise list page.

### Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # service_role JWT — used only in admin.ts
```
