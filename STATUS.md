# Status — measured, not planned

**Last verified:** 2026-09-25, against a live local stack (Postgres + the app
running, a real logged-in session). The commit that last changed this file is the
pin.

**How to use this file.** It records what has been _observed working_ and what is
_genuinely absent_, each with the command or artefact that proves it. Read it
before proposing work. `implementation-plan.md` describes **intent**; this
describes **state**. Where they disagree, this file wins — and if it goes stale,
update it in the same commit as the work that changed it.

A bullet here is a **claim**, not proof. Before relying on one — or before
reporting work as verified — re-run the command or query it cites. A "verified
working" entry has already been written once for a flow that could not run at all.

## Gates

All green as of the commit that last changed this file.

| Gate           | Command                                        | Result                     |
| -------------- | ---------------------------------------------- | -------------------------- |
| Typecheck      | `pnpm typecheck`                               | 0 errors (both packages)   |
| Unit tests     | `pnpm test`                                    | 8 files, 56 tests          |
| Lint           | `pnpm lint`                                    | 0 errors, 3 warnings       |
| Format         | `pnpm format:check`                            | clean                      |
| Build          | `pnpm build`                                   | green **with no database** |
| Isolation gate | `pnpm --filter @quotapilot/web test:isolation` | 9 files, 53 tests          |
| CI             | GitHub Actions                                 | both jobs green            |

## Verified working

Observed over real HTTP against a logged-in session, or by direct database query.

- **Auth loop** — register (user + org + owner membership in one transaction) →
  login → authenticated pages render → logout. The session carries `id`,
  `organizationId`, `role`; logout clears the cookie (`Max-Age=0`) and guarded
  routes return 307 to `/login`.
- **Tenancy / RLS** — two roles: `quotapilot` (owner, `rolbypassrls = t`) and
  `quotapilot_app` (runtime, `rolbypassrls = f`). 10 policies across 9 tables;
  4 migrations applied.
- **Isolation release gate** — 53 live tests, including fails-closed, cross-tenant
  read/write rejection, claim non-leakage across pooled connections, and the
  sign-in identity claim.
- **Dashboard** (`/dashboard`) — 200, rendering Today plan, Upcoming plan, Sign out.
- **Forecast** — `/forecast` (Server Component: current quarter, monthly computed
  vs override, quarter links, RECOMPUTE) and `/forecast/[quarter]` (edit per-month
  overrides, clear one).
- **Accounts** — `/accounts` lists real rows plus a create form;
  `/accounts/[accountId]` 200; an unknown id returns 404 (no existence leak).
- **Opportunities** — `/opportunities` lists the pipeline with account links and a
  running committed total, plus a create form; `/opportunities/[opportunityId]`
  200; an unknown id returns 404. The service refuses an opportunity attached to
  another org's account (see the traps).
- **Domain rules** — forecast, daily/multi-day plan, priority, risk, quota calc;
  pure and unit-tested.
- **Onboarding wizard** — `/ramp` renders the wizard (200); an un-onboarded user
  hitting any other guarded route is sent there (307); completing **or** skipping
  sets `onboarded_at`, after which `/dashboard` returns 200. The loop that made
  this unreachable is fixed (see the traps). Persistence, idempotency and
  user-scoping are covered by a live test, not just by hand.

## Genuinely absent or placeholder

- **Placeholder pages** (the feature component is a stub): `/quota`, `/actions`,
  `/call-coach`, `/weekly-review`. (`/ramp` is now implemented as the
  onboarding wizard.)
- **Invite flow** — the `Invite` model and `invite_isolation` policy exist; there
  is no route, handler, or accept action.
- **No `Meeting` model** in the schema.
- **Forecast per-owner breakdown** — route-map §3.5 asks for it; the drill-down
  is per-month.
- **RLS policies are split**: `membership` / `invite` come from migrations, the
  rest from `prisma/phase2a-rls.sql`, applied out-of-band with psql. That file is
  not idempotent and is not part of `migrate deploy`.
- **Dashboard reads are sequential** to avoid `P2028` — each repository method
  opens its own `withTenant` transaction. One transaction per request is the
  better shape and needs tx-bound repository methods.
- **No component tests** — there is no React testing setup; page behaviour is
  verified by HTTP checks, not unit tests.
- **Mutations use two mechanisms** — the forecast write still goes through a route
  handler (`/api/forecast/values`), while accounts and opportunities use Server
  Actions. CLAUDE.md prefers Server Actions throughout; migrating the forecast
  form is the remaining step.

## Traps already paid for

Each of these cost real debugging time. Do not rediscover them.

- `authorize(ctx, ability)` returns a **boolean** and needs `ctx.role`.
  Destructuring it (`const { authorize } = await authorize(...)`) yields
  `undefined` and silently rejects every request with 403.
- Prisma tagged templates: `${x}` becomes a bind **parameter**, so
  `'prefix-${x}'` written inside SQL quotes sends the literal text `prefix-$1`.
- `next typegen` must run before `tsc` on a fresh checkout: `next-env.d.ts`
  imports gitignored `.next/types`, so `LayoutProps` does not exist otherwise.
  CI does this; a local fresh clone needs `pnpm --filter @quotapilot/web typegen`.
- `pnpm -r typecheck` fails fast, so a failure in `packages/*` means `apps/web`
  was never typechecked at all.
- Sign-in cannot use the org claim — discovering the org is the point of the
  lookup. It uses `withUserClaim` → `app.user_id` → the `membership_self` policy.
- A `Promise.all` over several repository reads opens that many concurrent
  interactive transactions and can fail with `P2028`. Serialise, or share one
  transaction.
- A `<Toaster />` without a `Toast.Provider` ancestor throws and 500s every page
  that renders the root layout.
- The contracts declared ids as `z.string().uuid()`, but Prisma generates
  `cuid(2)` and the seed uses slugs like `seed-owner-001` — so **no real row could
  pass**. It stayed hidden because nothing validated an id until the opportunities
  service did, at which point every valid create failed with VALIDATION while the
  cross-tenant _rejection_ test passed for the wrong reason. Ids are opaque
  non-empty strings now.
- A foreign key that crosses tenants is not caught by RLS: `deal.account_id` has
  no tenant component, and the policy only checks `organization_id`. Services must
  re-resolve the parent through the scoped repository before writing.
- A guard that redirects to a route which is itself subject to that guard is an
  infinite loop. The onboarding gate sent every un-onboarded request to `/ramp`
  _including_ `/ramp` (`Location: /ramp` from `/ramp`), so the wizard was
  unreachable and a newly registered user could never clear the gate. Any
  exemption the guard matrix names (route-map §1: "yes except `ramp`") has to be
  in the middleware, not only in the document.
- `'use server'` on a `features/*/service.ts` module is not a marker for "server
  code" — it publishes **every export as a Server Action** with its own id,
  callable from the browser. Action modules belong in `app/**/actions.ts`.
- PowerShell treats `[` in a path as a wildcard — use `-LiteralPath`.

## Next three steps

1. **Invite flow** — `/invite/[token]`, accept action, role enforced in the
   service layer. This closes the last Phase 1 item.
2. **`/quota`** — the `QuotaPlan` model, `QuotaPlanRepo` and the quota rules all
   exist; only the page is a stub.
3. **`/actions`** — the actions feature is a stub; needs to show today's action
   plan and integrate with the domain rule modules.

Then: weekly-review, call-coach, and the forecast per-owner breakdown.
