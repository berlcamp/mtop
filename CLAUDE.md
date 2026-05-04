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

All database mutations are **Server Actions** in `src/lib/actions/`. Each action file (`applications.ts`, `assessments.ts`, `documents.ts`, `inspections.ts`, `payments.ts`, etc.) uses `"use server"` and calls `createClient()` from `server.ts`. Actions return `{ error: string | null, data: ... }` — never throw to the client.

Application status flows through these stages in order:
`for_verification` → `for_inspection` → `for_assessment` → `for_approval` → `granted`

Side exits: `rejected`, `returned` (can re-enter the flow).

Every status change inserts a row into `mtop.approval_logs`.

### Franchise vs Application

The MTOP number is the **stable franchise identifier**, not a per-application number. Two tables back this:

- `mtop.mtop_franchises` — owner + tricycle identity (motor, chassis, plate, body, route, address, contact). Holds `mtop_number` and `granted_until`. Same row across renewals.
- `mtop.mtop_applications` — per-cycle renewal pointing at a franchise via `franchise_id`. One row per fiscal year per franchise (unique constraint).

Renewal flow (`src/lib/actions/applications.ts`):
- `createNewFranchiseApplication` registers a brand-new franchise + first application. Rejected if `(motor_number, chassis_number)` already exists — change to motor or chassis means a new franchise.
- `createRenewalApplication` files a renewal against an existing franchise. Allowed once `today >= granted_until − system_settings.renewal_window_days`. Blocked if another application is in-flight (status not in `granted`/`rejected`).
- `searchFranchises(query)` powers the lookup combobox on the new-application page (matches by `mtop_number` or `applicant_name`).

`mtop.grant_franchise(franchise_id, granted_at, validity_years)` is a `SECURITY DEFINER` Postgres function that runs when an application transitions to `granted`. It atomically (a) assigns the next MTOP number from `mtop.mtop_number_seq` if the franchise doesn't have one yet, and (b) advances `granted_until` to `granted_at + validity_years` (anniversary).

System settings drive both the validity period (`permit_validity_years`, default 3) and renewal window (`renewal_window_days`, default 90); managed in `src/lib/actions/settings.ts`.

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
- `src/components/mtop/` — domain-specific forms (`DocumentChecklist`, `InspectionChecklist`, `FeeAssessmentForm`, `PaymentForm`)

### Route Structure

All authenticated routes live under `/dashboard`. The dashboard layout (`src/app/dashboard/layout.tsx`) is a **Client Component** that wraps children in `ProfileProvider` + `SidebarProvider`.

Page files (`page.tsx`) are Server Components; heavy client logic is split into `*-content.tsx` Client Components alongside them.

### Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # service_role JWT — used only in admin.ts
```
