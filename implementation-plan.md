# QuotaPilot — Implementation Plan

**Status:** Approved for planning · **Date:** 2026-09-14
**Companion docs:** [architecture.md](architecture.md), [domain-model.md](domain-model.md), [route-map.md](route-map.md)

Goal: a **shippable MVP** (real users, real tenant isolation) in a bounded number of incremental phases, each with a Definition of Done that includes tests. Roughly **7 phases, ~12–16 engineer-weeks** total, delivered in the order below. Phases 1 and 2 gate everything else.

---

## Phase 0 — Scaffold & foundations (½ wk)

**Output:** runnable empty app, toolchain, CI, repo hygiene.

- `git init` (repo is currently not under git) + `.gitignore` (node_modules, .env, .next, coverage, prisma migrations only in committed path).
- `pnpm create next-app` (TypeScript, App Router, strict, ESLint+Prettier) + workspaces layout:
  - `apps/web` (Next.js) · `packages/contracts` (zod schemas, shared types) · `packages/prompts` (AI prompt templates + schemas) · `packages/domain` (pure rule modules).
- Supabase project (dev) created; local Supabase CLI optional for offline dev. Connection strings stubbed (pooler for app role later).
- CI: GitHub Actions — lint, typecheck, `pnpm test` (Vitest), `pnpm build`.
- **DoD:** `pnpm dev` runs; health page renders; CI green; repo committed.

## Phase 1 — Auth, orgs, tenancy (1.5–2 wks) ⚠️ gating

**Output:** hard isolation is proven before any feature data exists.

- Auth.js v5: Credentials provider, argon2 password hashing (or bcrypt fallback if native argon fails on Windows — decide here, once), database sessions; `/register` creates `User` + `Organization` + `Membership(owner)` in one transaction.
- RLS phase: enable RLS; create **app role** (subject to RLS) + keep owner/service-role for migrations only; implement `set_config('request.jwt.claims', …)` per request (interactive transaction) OR Prisma RLS preview adapter — **spike both, pick one, document decision in architecture §7.2**.
- RLS policies on all tenant tables (org, membership, invite, quota, account, opp, meeting, prep, objection, practice, forecast, risk, task, aiusage).
- Tenant isolation test suite (the bar): direct Psql/Prisma client under **app role** proves org A can't read/write org B rows with RLS alone, and repository layer always scopes.
- Invite flow (create, single-use accept), role enforcement scaffolding (`authorize()`).
- **DoD:** register→org→login→logout works; cross-tenant read/write **fails** in tests; public routes gated.

## Phase 2 — Core domain CRUD (1.5–2 wks)

**Output:** the operating layer — quota setup, accounts, opportunities, meetings.

- Zod contracts package; repo layer for each tenant table (all org-scoped); service layer use cases; first Server Actions + zealous Server Components.
- QuotaPlan + components invariants (`quota.ts`); Accounts/Opportunities CRUD with stage transition validation; simple Meeting bookmarks.
- Rule modules wired: `weightedOpportunity` + `scoreAccounts` computed on write + `/api/forecast/recompute`.
- Revalidation tags wired on SAs (§ route-map).
- **DoD:** full CRUD via UI; unit tests for `quota.ts`/`forecast.ts`; tenancy tests extend to new tables.

## Phase 3 — Rule engine & forecast (1 wk)

**Output:** prioritization, risk flags, daily action plan (all deterministic in MVP).

- `risk.ts`: rule set + `RiskSignal` persistence; `plan.ts`: `schedulePlan` for today/upcoming; dashboard assembles action plan + forecast snapshot.
- Forecast page CRUD with `committed ≤ best ≤ pipeline` invariant.
- Seed script: demo org with realistic accounts/opps/objections for dev + e2e.
- **DoD:** dashboard shows a plausible, priority-ordered plan from seeded data; risk signals compute on opp/forecast update; unit coverage on all three rule modules.

## Phase 4 — AI features (2 wks) ⚠️ core value

**Output:** the two MVP copilots + metered usage.

- `AiService` + provider registry (Anthropic default; OpenAI/Google registered fallbacks) over Vercel AI SDK; feature → {prompt, modelRoute, caps, schema}.
- `packages/prompts`: versioned templates — `discoveryGuide`, `demoPlan`, `objectionRoleplay`, `objectionScore`, each with input/output zod schemas + golden tests (mock provider in unit, real in staging).
- Prep builder + streaming `POST /api/ai/prep`; interactive objection practice `POST /api/ai/practice`; `ScorePractice`; usage rows written on stream end; per-org caps enforced.
- Guardrails per architecture §8.2 (prompt-injection-safe system prompt, output-schema validation before persist, financial fields write-protected).
- **DoD:** user generates+regenerates a prep doc and completes a scored practice session; caps block abuse; token spend visible in dashboard; mock-provider tests green.

## Phase 5 — Import & polish (1 wk)

**Output:** CSV import, empty states, onboarding completeness, e2e coverage.

- `/api/import/csv` for accounts & opportunities: dry-run → validation report → apply; template download.
- Onboarding wizard final pass; empty/demo data states; responsive pass (mobile ~320px).
- Playwright e2e: register→onboard→create account/opp→see it in dashboard→run prep smoke (mocked AI).
- **DoD:** import roundtrip works; onboarding is skip-safe; e2e green in PR preview.

## Phase 6 — Hardening (1 wk)

**Output:** production-readiness.

- Rate limiting (auth, AI, invites), security headers (CSP, HSTS, X-Frame), `pnpm audit` in CI.
- AuditLog minimal (who did what on member/role/quota changes) — scaffold.
- Observability: structured logs + error wrapper; per-org usage surfaced in `/app/settings`.
- RLS policy regression suite (any tenant-table PR must extend it); secrets scan in CI.
- **DoD:** security checklist from architecture §9.4 signed off; e2e + isolation suite green on prod-like env.

## Phase 7 — Launch prep (non-blocking, 1 wk)

Staging env, production Supabase project + pooler cutover, migration release script (owner role only), synthetic ping, backup/RTO check, launch runbook, feedback intake. **Out of scope beyond this:** CRM connectors, billing, ML forecasting (documented as future).

---

## Cross-cutting: testing strategy (from architecture §10 / N4)

| Level       | Tool                                  | Scope                                                                                                                 | Gates                                         |
| ----------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Unit        | Vitest                                | rule modules (priority, forecast/weighting, risk, plan), zod schemas, prompt golden tests (mock provider), validators | each Phase 2–4                                |
| Integration | Vitest + real Postgres (Supabase dev) | repository org-scoping, RLS isolation suite (§7 architecture), invariant enforcement at write                         | Phase 1 onward, **every tenant-table change** |
| API         | Vitest + supertest                    | Route Handler validation/error contract, authorization matrix                                                         | Phase 4–5                                     |
| E2E         | Playwright                            | auth → onboarding → CRUD → dashboard → prep smoke                                                                     | Phase 5+                                      |
| Security    | typed test + manual checklist         | cross-tenant read/write negative tests; prompt-injection; caps                                                        | Phase 1 & 6                                   |

**Tenancy test = the release gate for any PR touching a tenant table.** A PR that changes `organization_id`-bearing tables without an isolation test is blocked.

## Dependency order & milestones

```
Phase 0 → Phase 1 ─► Phase 2 ─► Phase 3 ─► Phase 4 ─► Phase 5 ─► Phase 6 ─► Phase 7
  scaffold    isolation  CRUD       rules      AI        import/   harden    launch
```

- **Milestone A (end Phase 1):** "proven isolation" — security foundation demoed. Approve before Phase 2.
- **Milestone B (end Phase 3):** core app usable with seeded data; internal dogfood.
- **Milestone C (end Phase 5):** MVP for pilot users.
- **Milestone D (end Phase 6):** prod-ready.

## Effort & risks

- Estimates are **team-days**, not commitments; re-baseline after Phase 1 spike of RLS approach.
- Highest-risk item: **Prisma + RLS session-claim integration** (Phase 1) — full spike before investing in features. Fallback documented: Layer-1 app scoping alone satisfies the isolation bar if RLS turns out to be an adoption drag.
- AI cost control (Phase 4) must ship with caps from day one, not retrofitted.

## What I will NOT do without a separate approval

Database schema/migrations, app scaffolding (`create-next-app`), and any feature code all wait for your green light on this plan. The next step after approval of these docs is **Phase 0/1 groundwork** — nothing further is built speculatively.
