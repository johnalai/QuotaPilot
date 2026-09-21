# QuotaPilot — Architecture

**Status:** Approved for planning · **Date:** 2026-09-14
**Owners:** Lead architect + engineering · **Companion docs:** [domain-model.md](domain-model.md), [route-map.md](route-map.md), [implementation-plan.md](implementation-plan.md)

---

## 1. Purpose & goals

QuotaPilot is a multi-tenant SaaS that helps **technical sales professionals** operate more effectively by turning their quota, account, and opportunity data into prioritized daily action. It covers seven capabilities:

1. **Ramp** — onboarding a new sales role (guides, structured setup).
2. **Quota understanding** — target breakdown, period progress.
3. **Prioritization** — which accounts/opportunities deserve attention.
4. **Call & demo prep** — discovery questions, demo storylines, buyer context.
5. **Objection handling** — practice and talk tracks.
6. **Risk identification** — opportunity and forecast risk flags.
7. **Daily action plan** — what to do today, in priority order.

The product is **data-driven** (the operating layer) plus **AI-assisted** (the copilot that accelerates prep and practice). Architecture must treat both as first-class.

## 2. Non-functional requirements

| #   | Requirement                       | Rationale                                                                                                         |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| N1  | **Strict tenant isolation**       | Multi-tenant SaaS; data leakage is a critical failure. Defense-in-depth required.                                 |
| N2  | **Security-hardened AI boundary** | Model calls are server-side; API keys never reach the client; prompt injection and usage abuse are risks.         |
| N3  | **Fast, low-friction UX**         | Daily-use tool for busy sellers; primarily desktop, mobile-responsive. Server rendering for perceived speed.      |
| N4  | **Testable by design**            | Business rules (scoring, weighting, risk) are pure and unit-testable; cross-tenant leakage is integration-tested. |
| N5  | **Provider-agnostic AI**          | Model providers and prompts evolve weekly; the app must not couple business code to one provider.                 |
| N6  | **Deployable with low ops**       | Small team; managed services (Vercel-style hosting + Supabase Postgres) preferred over self-managed infra.        |
| N7  | **Extensible domain**             | Accounts, opportunities, mixing buyers, future CRM sync, future billing. Schema designed forward.                 |

## 3. Technology stack (decided)

| Layer             | Choice                                                                                  | Rationale                                                                                                                             | Alternatives considered                                                                   |
| ----------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Language          | **TypeScript (strict)**                                                                 | End-to-end type safety across server/client; largest ecosystem for the chosen stack.                                                  | —                                                                                         |
| Web framework     | **Next.js (App Router, latest stable), React 19**                                       | One deployable; RSC server/client boundary; native streaming for AI; Server Actions for mutation ergonomics.                          | Vite SPA + Express API (rejected: two deployables, invented boundary)                     |
| Styling           | **Tailwind CSS + shadcn/ui**                                                            | Velocity, accessible primitives, themeable, no design-system debt at MVP.                                                             | MUI (rejected: heavy, less composable)                                                    |
| Validation        | **zod**, shared schemas                                                                 | Single source of truth for request shape, domain invariants, form input at both boundaries.                                           | joi/yup                                                                                   |
| ORM / data access | **Prisma** (Postgres)                                                                   | Type-safe typed client, mature migrations. RLS is enforced at the DB via policies + session claim (see §7).                           | Drizzle (lighter, SQL-first — track for later)                                            |
| Database          | **Supabase-hosted PostgreSQL**                                                          | Serverless Postgres, zero ops, RLS native, backups included; we use it as a plain Postgres host (Auth is Auth.js, not Supabase Auth). | Neon (works; Supabase chosen for RLS tooling + pooler)                                    |
| Auth              | **Auth.js v5 (NextAuth)** with Credentials + database sessions                          | Self-hosted, no per-seat cost, standard App Router integration.                                                                       | Clerk (rejected: external dependency/seat cost); custom (rejected: more security surface) |
| AI gateway        | **Vercel AI SDK** over a provider registry (Anthropic primary, OpenAI/Google secondary) | Multi-provider day one, streaming primitives, build-in tool/finish hooks. Direct SDK calls wrapped by our `AiService` (§8).           | Roll-your-own (rejected: reinventing streaming/retries)                                   |
| AI models         | **Claude (Anthropic)** default; registry allows swapping per feature                    | Anthropic environment; strong reasoning for prep/objections.                                                                          | —                                                                                         |
| ID generation     | **cuid2** (strings)                                                                     | Non-enumerable, collision-safe, URL-friendly; avoids leaking cardinality.                                                             | UUIDs (fine; cuid2 preferred)                                                             |
| Testing           | **Vitest** (unit/integration), **Playwright** (e2e), **supertest** (route handlers)     | See [implementation-plan.md](implementation-plan.md) §Testing.                                                                        | Jest (Vitest faster, native ESM/TS)                                                       |
| Lint/format       | **ESLint** (typescript + import order), **Prettier**                                    | Enforces layering + import boundaries.                                                                                                | —                                                                                         |
| Monorepo          | **pnpm workspaces** (single app now; npm packages for shared types)                     | One app plus local packages for prompts/domain types, room to grow.                                                                   | Turborepo (overkill at MVP)                                                               |

### 3.1 Components of the stack NOT yet present (deferred)

CRM connectors, billing/plans, but the architecture reserves slots for each (§13).

## 4. High-level system context

```
                        ┌─────────────────────────────────────────────────────┐
  Browser  ───────────► │  Next.js application (Vercel)                      │
                        │  ┌──────────────────────────────────────────────┐  │
                        │  │ App Router: RSC pages  ◄ server components   │  │
                        │  │   ▼                                          │  │
                        │  │ Client islands ("use client")                │  │
                        │  │   ▼                                          │  │
                        │  │ Server Actions (mutations)  ─┐               │  │
                        │  │ Route Handlers /api (REST)   │               │  │
                        │  └──────────────────────────────┼───────────────┘  │
                        │              service layer       │                 │
                        │        (use cases, rule engine)  │                 │
                        │              repository layer    │                 │
                        └──────────────────────────────────┼─────────────────┘
                                                           │
                                          ┌────────────────▼──────────────┐
                                          │ Supabase PostgreSQL            │
                                          │  • RLS policies (backstop)     │
                                          │  • Conn. pooling (PgBouncer)   │
                                          └────────────────────────────────┘
                                                           ▲
                        ┌──────────────────────────────────┼─────────────────┐
                        │ AI Provider Registry (AiService) │                 │
                        │  Anthropic ◄ primary             │                 │
                        │  OpenAI / Google (secondary)     │                 │
                        └──────────────────────────────────┴─────────────────┘
```

Browser → Next.js only. There is **no direct browser→database** or **browser→provider** path. All AI calls traverse the server, which holds provider keys and enforces usage caps.

## 5. Runtime architecture

### 5.1 App Router model

- **Server components by default.** Every route in `/app` is a server component that loads data through services (never directly in JSX) and renders.
- **Client islands** ("use client") only where interactivity demands: forms, tables with row actions, the objection-practice chat, prep-doc editors, filtering controls.
- **Server Actions** handle mutations that originate in forms/inline actions (create account, mark task done, save prep notes). They run on the server, revalidate the affected path, and are typed against the same zod schemas.
- **Route Handlers (`/api/*`)** expose programmatic/streaming boundaries: AI streams, CSV import, invitation tokens, integrations (phase 2). Rule of thumb: _interactive UI → Server Action; streaming or external client → Route Handler._

### 5.2 Layout & navigation

```
src/app/
  layout.tsx            root layout (fonts, metadata)
  (marketing)/          public: landing, pricing, legal
  (auth)/               login, register, invites, reset
  (app)/                authenticated product shell
    layout.tsx          sidebar shell; resolves session → org → onboarding gate
    dashboard/          today: action plan + forecast snapshot
    onboarding/         ramp wizard
    quota/  accounts/  opportunities/  forecast/
    actions/ prep/  practice/  settings/
```

## 6. Layering & dependency rules

```
ROUTE LAYER        App Router, Server Actions, Route Handlers
        │          - threads session/org context
        ▼          - validates input (zod) and output shape
SERVICE LAYER      use cases: OnboardUser, PrioritizeAccounts, ComputeForecast,
                   GeneratePrep, RefreshActionPlan, DetectRisk
        │          - owns business rules & invariants  - never imports DB or UI
        ▼
RULE MODULES       pure functions: priorityScore(), weightedForecast(),
                   riskSignals(), planScheduler()   [unit-testable, no I/O]
        │
        ▼
REPOSITORY LAYER   Prisma-backed data access; every tenant query carries orgId;
                   wraps RLS session claim setup
        │
        ▼
POSTGRES           RLS policies = hard isolation backstop
```

**Enforcement (CI + editor):**

- `/server-only` imports for anything touching Prisma or provider keys, so client bundles can't reference them.
- ESLint rule (import/no-restricted-paths) blocks `service → ui` and `repository → route` edges.
- A `TenantContext` object is threaded from the route layer into repositories; it does not exist on the client.

### 6.1 Server/client data boundary

| Concern                              | Owner                                                               |
| ------------------------------------ | ------------------------------------------------------------------- |
| Data fetching, caching, revalidation | Server components (RSC `fetch`, `revalidateTag`), services          |
| Mutations & validation of mutations  | Server Actions / Route Handlers (server)                            |
| Form field validation (live)         | Client zod schemas (mirror, shared package)                         |
| AI streams & prompts                 | Server only; client receives/streams display pieces                 |
| Env vars / secrets                   | Server only (`NEXT_PUBLIC_*` reserved for non-secret public config) |

## 7. Multi-tenancy (N1)

Defense-in-depth with two independent layers. Each layer alone must be enough to prevent leakage.

### 7.1 Layer 1 — Repository/app-level scoping (primary seam)

- Every tenant-scoped table carries `organization_id`.
- The repository layer receives a `TenantContext { organizationId, role }` and injects `organization_id = <ctx.organizationId>` into **every** query. There is no repository method that takes a tenant-scoped id _without_ an org context.
- Raw SQL outside the repository is prohibited except in documented, reviewed migrations.

### 7.2 Layer 2 — Postgres RLS (backstop)

**Mechanism (decided in Phase 1 from spike evidence in
[docs/phase-1-slice-1.md](docs/phase-1-slice-1.md)):** transaction-scoped
`set_config('request.jwt.claims', …, true)` inside a Prisma interactive
transaction. Session-scoped claims are **rejected** (§7.2 evidence below).

- **Policy (null-safe).** RLS is **on for all tenant tables**; the predicate is
  the null-safe form, not a naive `::jsonb` cast:
  ```sql
  USING     (organization_id = NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')
  WITH CHECK (organization_id = NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')
  ```
  The `NULLIF(..., '')` guard is **mandatory**: once the placeholder GUC has
  been `SET` anywhere on the server, a reused pooled connection can read `''`
  (placeholder default), and the naive form then throws `22P02 invalid input
  syntax for type json` — a loud crash mid-request — instead of failing closed.
  Both NULL (fresh connection) and `''` must mean "no claim". Observed during
  the Phase 1 spike.
- **Fail closed.** When the claim is missing, empty, malformed, or its `org_id`
  does not match the row, the predicate is NULL/false → reads return 0 rows,
  writes are blocked. RLS therefore catches any repository bug that forgets to
  filter. **Defense-in-depth must fail quiet, not fail loud.**
- **Claim setting (per HTTP request).** The service layer opens a **Prisma
  interactive transaction** and executes `select set_config('request.jwt.claims',
  '<json claim>', true)` — the third argument `true` is **transaction-local**,
  equivalent to `SET LOCAL` — *before* any tenant-scoped repository query.
- **Transaction-bound client.** Every tenant-scoped repository operation in that
  request must use the **transaction-bound Prisma client** (`tx`), **never the
  root/global Prisma client**, so the claim is always present on the exact
  connection that runs the query. Reading through the root client bypasses the
  claim boundary.
- **Never session-scoped.** `set_config(..., false)` / `SET` (session-scoped)
  must **never** be used for organization context: under any connection pool the
  session state survives and leaks into later requests on a reused connection.
  Evidence (spike, documented in `docs/phase-1-slice-1.md` §6): (1) the
  reconnect probe — a session claim SET on one connection is invisible on a
  freshly-opened one (NULL or `''`; reads blocked, 0 rows), so session claims
  are non-deterministic per request; (2) the `?connection_limit=1` Prisma demo —
  a session-scoped claim persists on the same connection and the **next
  statement sees the previous org's rows**, a leak under real pooling.
- **Roles.** The app runtime connects as a dedicated **non-superuser application
  role that is subject to RLS and has `NOVBYPASSRLS`** (`rolbypassrls = f`; no
  isolation claim may rest on a `BYPASSRLS` role). A separate **owner/migration
  role** (Supabase `postgres`/`service_role`) performs schema setup and
  migrations only — never app runtime queries.
- **Pooling.** Transaction-local state is compatible with PgBouncer
  **transaction** pooling (discarded per transaction, so the claim never leaks);
  statement-only pooling would break Prisma interactive transactions. Supabase's
  transaction pooler is the production target.

### 7.3 Cross-tenant guarantees baked into tests (N1/N4)

- Integration test suite explicitly proves: **with RLS enabled and the app role, org A cannot read or write org B rows even if the repository layer is bypassed with a direct client query.**
- Any future schema change affecting a tenant table must ship with an RLS policy + an isolation test in the same PR.

## 8. AI integration (N2, N5)

### 8.1 Architecture

```
Route Handler (e.g. /api/ai/prep, /api/ai/practice)   ── streaming
        ▼
AiService (domain application service)
   - feature → { promptTemplate, modelRoute, caps, schema }
        ▼
Provider registry  (multi-provider day one)
   - anthropic  (default)
   - openai / google  (registered fallbacks)
        ▼
Vercel AI SDK streaming primitives → SSE to client
        ▼
Usage recording: AiUsage rows (tokens in/out, duration, feature)
```

- **Provider registry** is config-driven (`ai/providers.ts`): a `ModelRoute` maps each feature to a provider+model with a fallback. Feature code expresses _intent_ (e.g. `prepareDiscoveryCall`), not a provider.
- **Prompt templates are versioned, typed data**, not string-literal soup in components. Each template ships with an input schema (zod), an output schema, and a golden test (see [implementation-plan.md](implementation-plan.md) §Testing).
- **Streaming**: client receives typed display events (tool-name, chunk, done, usage-snapshot). Server holds keys and caps.

### 8.2 Guardrails

| Risk                                   | Control                                                                                                                                                                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt injection via CRM/notes content | Treat all user/CRM content as **data**; system prompt is static+governed; instruct the model to ignore embedded instructions; input sanitization on long-form fields; output schema enforced (parse + validate before persistence). |
| Abuse / cost blowup                    | Per-org rate limit + monthly token cap; per-feature caps at the registry; usage surfaced to tenants.                                                                                                                                |
| Key exposure                           | Provider keys live in server env only; no `NEXT_PUBLIC_*`; Egress review before merge.                                                                                                                                              |
| Hallucinated numbers                   | AI never writes to financial fields (amounts, forecasts) — it may _suggest_, user commits. Structural separation: model output is never the source of truth for numeric domain state.                                               |

## 9. Security & authorization (N2)

### 9.1 Identity & sessions

- Auth.js v5, Credentials provider, passwords hashed with **argon2id** (or bcrypt if argon2 native binding causes Windows/AES friction — decide in Phase 1).
- Database sessions in httpOnly, `SameSite=Lax`, `Secure` cookies; CSRF protection from Next.js same-origin + Server Actions; explicit CSRF token check on state-changing route handlers.
- Session payload on the server carries `{ userId, organizationId, role }`. Client receives only a non-sensitive projection (`/api/session` getter or RSC `useSession`).

### 9.2 Authorization matrix (role = Membership.role)

| Action                               | Owner | Admin | Member |
| ------------------------------------ | ----- | ----- | ------ |
| View own org data                    | ✓     | ✓     | ✓      |
| Create/edit accounts & opportunities | ✓     | ✓     | ✓      |
| Run prep/objection practice          | ✓     | ✓     | ✓      |
| Manage members/invites               | ✓     | ✓     | ✗      |
| Edit org settings, quotas, plan      | ✓     | ✓     | ✗      |
| Change roles / delete org            | ✓     | ✗     | ✗      |

Enforced in the **service layer** (central `authorize(ctx, ability)`), never trusted from buttons or query params.

### 9.3 Request pipeline

```
middleware.ts  →  (1) session cookie present? (2) org resolved? (3) onboarding complete?
                     ├─ public routes: no session required
                     ├─ /app: session required; !org → /app/onboarding; else proceed
                     └─ /app/settings/*: role checked in service layer
Route Handler  →  (4) zod-validate input   (5) authorize   (6) run service with TenantContext
```

### 9.4 Hardening checklist (applies from Phase 1)

CSRF · rate limiting on auth + AI + invite endpoints · input validation at every boundary · output encoding (React escapes by default; avoid `dangerouslySetInnerHTML`) · no client-side secrets · dependency audits (`pnpm audit` in CI) · security headers strict (CSP, HSTS, X-Frame) · invitation tokens: short-lived, single-use, hash-at-rest · logging redacts PII/keys.

## 10. Validation & data integrity

- Shared zod schemas in `packages/contracts` are the single source of truth consumed by forms (client), Server Actions (server), and Route Handlers.
- Domain invariants live in rule modules and are re-asserted in repositories at write time where cheap (e.g., opportunity stages follow a valid transition map).
- Money stored as integer minor units + ISO currency; currency is org-scoped per quota period (see [domain-model.md](domain-model.md)).

## 11. Observability

- Structured JSON logs server-side (request id, org id hashed, feature, latency); no PII.
- Error tracking: route/service boundary wrapper that annotates errors with feature + org (hashed) + stack, never query params.
- Per-org **AI usage** is first-class (a table, not just logs): tenants see tokens spend; we reconcile cost.
- Simple synthetic check (cron) that exercises auth → dashboard → one service call against a staging org.

## 12. Environments & deployment

| Env        | Next.js               | Supabase                              | Purpose                                 |
| ---------- | --------------------- | ------------------------------------- | --------------------------------------- |
| local      | Next dev              | local Supabase (CLI) or shared dev db | fast iteration; RLS on                  |
| preview    | Vercel preview per PR | dev db                                | PR validation incl. e2e                 |
| production | Vercel prod           | prod db                               | users; RLS enforced; pooled connections |

**Supabase connections:** app connects over the transaction pooler port to the **app role** (RLS-subject). A separate owner/service-role connection string exists for migrations only, run via a scripted `prisma migrate` from CI with review, never from app code.

**Migrations:** Prisma migration files grouped per phase; each tenant-table migration ships a matching RLS policy file + isolation test (§7.3).

**Env/secret management:** server-only env vars in the Vercel environment; a `.env.example` in repo; local `.env` gitignored.

## 13. Risks & trade-offs

| Risk                                                                | Mitigation                                                                                                                                                                    |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RLS setup with Auth.js sessions is unusual (Supabase Auth not used) | Contract documented (§7.2); Phase 1 spikes the claim-setting path with an isolation test before any feature work.                                                             |
| Vercel AI SDK provider API stability                                | Wrap in `AiService`; keep providers behind registry; version lock.                                                                                                            |
| Prisma + RLS (session claim) friction                               | Both RLS and app-layer scoping implemented independently; if the claim approach proves fragile, Layer 1 alone still prevents leakage (we keep the isolation test as the bar). |
| AI cost on practice chat is unbounded                               | Token caps + message limits per session (MVP: cap session length); per-org monthly cap.                                                                                       |
| Windows dev environment (this repo runs on Windows)                 | Scripts in Node (no bash-only step in `dev`/`test` documented in CLAUDE.md); argon2 native builds noted.                                                                      |
| Non-enumerable ids (cuid2) slow index scans as FK                   | Fine at MVP scale; switch to UUIDv4 if perf demands.                                                                                                                          |

## 14. Open questions (recorded in this doc until resolved)

1. Currency model: one currency per org per quota period (assumed) vs per-account currency conversion. **Assumption: single org currency; multi-currency is out of MVP.**
2. Auth session strategy: database sessions (recommended, revocable) vs JWT. **Assumption: database sessions.**
3. Does "forecast risk" need real ML in MVP? **Assumption: rule-based signals only; AI suggest-only.**
4. CRM integrations (Salesforce/HubSpot) deferred — confirm at MVP review.
5. Invitation onboarding depth (single-role "seller" vs multi-role) — see [domain-model.md](domain-model.md).
