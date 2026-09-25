# Next task — `/quota` page, form and live test

**Read first:** [CLAUDE.md](../CLAUDE.md) (rules) → [STATUS.md](../STATUS.md) (measured
state + the "traps already paid for" list) → this file. `STATUS.md` wins over any
plan document.

**Handoff state:** 53 isolation tests across 9 files, 56 unit tests, all gates
green. This spec should take it to 10 files / ~58 tests.

**Definition of done:** `/quota` renders the caller's plan as a Server Component,
edits it through a Server Action, and a live test proves persistence, org scoping
and the authorization rule. Gates green. `STATUS.md` updated **in the same
commit**.

---

## What already exists (do not rebuild)

| Piece                         | Where                                     | Notes                                                                                                         |
| ----------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `QuotaPlan` model + migration | `prisma/schema.prisma`                    | one row per org                                                                                               |
| `QuotaPlanRepo`               | `lib/db/tenancy/quotaplan.ts`             | `findByOrg(ctx)`, `upsert(ctx, input)` — both `withTenant`                                                    |
| `quotaPlanSchema`             | `packages/contracts/src/domain-models.ts` | the single source of truth for validation                                                                     |
| Quota rules                   | `packages/domain/src/rules/quota-calc.ts` | pure, already unit-tested                                                                                     |
| **Service**                   | `features/quota/service.ts`               | `getQuotaPlan(ctx)`, `saveQuotaPlan(ctx, input)` — **written, gate-green, and currently imported by nothing** |

You are wiring up the UI. If you find yourself changing RLS, the schema, the
contracts, or the rules, stop and say so instead.

## Deliverables

1. **`apps/web/src/features/quota/components/quota-page.tsx`** — replace the 12-line
   stub. Presentational, takes the row as a prop. Show the plan's figures, and an
   explicit empty state when the org has no plan yet.
2. **`apps/web/src/features/quota/components/quota-form.tsx`** — new client island
   (`'use client'`), `useActionState` bound to the action below. Mirrors
   `features/accounts/components/new-account-form.tsx`.
3. **`apps/web/src/app/(dashboard)/quota/actions.ts`** — new Server Action
   `saveQuotaPlanAction`. Resolves the session with `getSessionServer()`, redirects
   to `/login` when absent, calls `saveQuotaPlan(ctx, input)`, returns the error
   shape on failure, `revalidatePath('/quota')` and redirect on success.
4. **`apps/web/src/app/(dashboard)/quota/page.tsx`** — replace the stub with a
   Server Component: session → `getQuotaPlan(ctx)` → `<QuotaForm/>` +
   `<QuotaPage plan={...} />`.
5. **`apps/web/src/lib/db/live/quota-service-isolation.test.ts`** — new live suite
   (see below).

## Field handling — get this right

- `quotaAmount` and `avgDealValue` are **integer minor units**. The form takes whole
  currency units and the **action** converts with `toMinorUnits()` from
  `@/lib/utils/format-currency`. An empty input must reach validation as `NaN`, never
  as a silent `0`.
- `winRate`, `opportunityConversionRate`, `discoveryConversionRate`,
  `firstMeetingConversionRate` are decimals (0–1). `pipelineCoverageTarget` is a
  number such as `3`. `salesCycleMonths` is an integer. `currency` is one of
  `USD | EUR | GBP | CAD | AUD` — let the contract validate it, do not hand-roll the
  union.
- Validate in the service (already done) **and** let the contract decide the shape:
  no field may be invented in the form that the contract does not carry.

## Rules that a reviewer will check

- Org comes from the `TenantContext` — never from the form, never from a query param.
- Tenant data only through the repository. No raw `prisma` in the page, the action,
  or the service.
- **No `'use server'` on `features/quota/service.ts`.** That directive publishes every
  export as a browser-callable Server Action. Action modules live in
  `app/**/actions.ts`.
- `authorize(ctx, ability)` is **synchronous and returns a boolean** — do not `await`
  it and do not destructure it. Writing a quota plan requires `manage_settings`
  (owner/admin), which the service already enforces.
- Service calls from a page are **sequential**, never `Promise.all` — each opens its
  own `withTenant` transaction and concurrent ones fail with `P2028`.
- `redirect()` must not sit inside a `try`/`catch`, and JSX must not be constructed
  inside one.
- Next 16: dynamic `params` are a `Promise` and must be awaited (not needed here, but
  true for the detail-style routes).

## The live test must cover

1. **Persists** — save a plan, read it back through `getQuotaPlan`.
2. **One row per org** — saving twice updates rather than creating a second row.
3. **Org scoping** — a second org's plan is invisible to the first; a different org's
   context gets its own row.
4. **Authorization** — `saveQuotaPlan` with `role: 'member'` rejects with
   `FORBIDDEN` (`manage_settings` is owner/admin only). This is the test that matters
   most; a member must not be able to set the org's quota.
5. **Validation** — a negative amount, or an unknown currency, rejects with
   `VALIDATION` before the database is touched.

Seed fixtures with the owner-role client and clean up in `afterAll`, children before
parents (see the accounts and opportunities service suites for the shape).

## Evidence required before you claim this is done

Run all of these and paste the real output — a summary is not evidence:

```
pnpm typecheck
pnpm test
pnpm lint
pnpm format:check
pnpm build                      # must pass with NO database reachable
pnpm --filter @quotapilot/web test:isolation
```

Plus one real request against a running app with a logged-in session: `/quota`
returns 200 and shows the figures, and a save through the form is visible after the
redirect. `scripts/dev-up.ps1 -NoDev` brings up Postgres and the gateway; the seed
creates a login-able owner (`owner@acme.invalid` / `Password123!`).

## Traps that will bite you (from STATUS.md)

- `authorize()` returns a boolean — destructuring it silently 403s every request.
- Prisma tagged templates: `'prefix-${x}'` inside SQL quotes sends the literal
  `prefix-$1`. Ids must be built in JS and passed as bind parameters.
- Contracts' ids are **opaque strings** (`cuid(2)` and `slug` ids, not UUIDs).
- A guard that redirects to a route subject to that guard is an infinite loop.
- `pnpm -r typecheck` fails fast: a `packages/*` failure means `apps/web` was never
  typechecked.
- PowerShell treats `[` in a path as a wildcard — use `-LiteralPath`.

## Update STATUS.md in the same commit

Move `/quota` from "Genuinely absent or placeholder" into "Verified working", update
the gate counts, and revise "Next three steps" (the invite flow is next, and it closes
the last Phase 1 item).
