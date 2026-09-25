# Phase 2a — Functional MVP Dashboard

**Status:** Approved for implementation · **Date:** 2026-09-21
**Scope:** the smallest coherent slice that makes the dashboard real: auth flows

- domain CRUD + rule engine + seed data + wired dashboard cards.

## 1. Goal

A logged-in user, in an org with seeded data, sees a dashboard whose three cards
(quota progress, today's plan, forecast & risk) show real computed numbers —
not placeholders. Everything behind it (auth, tenancy, RLS, rules) is in place.

## 2. What this slice includes

| Layer        | Delivered                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth         | Credentials login/register (Auth.js v5), `middleware.ts` session→tenant gating, `/api/session` projection, onboarding redirect                         |
| Schema       | `QuotaPlan`, `Account`, `Opportunity`, `ForecastLine`, `RiskSignal`, `ActionTask` — each `organization_id`-scoped + RLS policy + isolation test        |
| Repositories | org-scoped DAL (`quota`, `account`, `opportunity`, `forecast`, `risk`, `action`) with transaction-bound `set_config('request.jwt.claims')` claim setup |
| Rules        | `priority.ts`, `forecast.ts`, `risk.ts`, `plan.ts` — pure, unit-tested in `packages/domain`                                                            |
| Contracts    | zod schemas in `packages/contracts` for every entity + form input                                                                                      |
| Seed         | `db:seed` — demo org with 1 owner, 6 accounts, 12 opportunities, 3 forecast lines, 12 action tasks, 5 objections                                       |
| UI           | wired dashboard cards + `actions` page; login/register forms functional                                                                                |

## 3. Explicitly out of scope

- CSV import, onboarding wizard final pass, e2e (Phase 5)
- AI copilots / prep / practice (Phase 4)
- Invitations, member management, settings pages (Phase 2b)
- CRM connectors, billing, audit log (deferred)

## 4. Key decisions

1. **One QuotaPlan per org** (domain-model §6 assumption, confirmed).
2. **`packages/contracts` and `packages/domain` are real workspace packages** —
   rules and schemas live there, framework-free, so they're unit-testable and
   reusable by the app's `lib/calculations` adapters.
3. **Computed fields are never in input schemas** — `priority_score`,
   `weighted_value`, `risk_score`, `action.priority` are rule outputs only.
4. **Money is integer minor units everywhere**; display converts via
   `@quotapilot/domain/lib/money`.
5. **RLS pattern mirrors Phase 1 exactly** — null-safe predicate
   `NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id'`,
   claim set inside a Prisma interactive transaction via `set_config(..., true)`.
6. **`organization` stays un-RLS'd** (tenant root) — service-layer authz + grants.

## 5. Verification

- `pnpm typecheck` clean
- `pnpm test` green (rule unit tests + contract tests)
- `pnpm test:isolation` green (new tenant tables added to the gate)
- `pnpm dev` → register → dashboard shows real numbers
- Cross-tenant: org A's dashboard never shows org B's accounts/opps
