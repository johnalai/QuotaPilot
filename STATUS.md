# Status — measured, not planned

**Last verified:** 2026-09-25, at commit `ab77fa0`, against a live local stack
(Postgres + the app running, a real logged-in session).

**How to use this file.** It records what has been _observed working_ and what is
_genuinely absent_, each with the command or artefact that proves it. Read it
before proposing work. `implementation-plan.md` describes **intent**; this
describes **state**. Where they disagree, this file wins — and if it goes stale,
update it in the same commit as the work that changed it.

## Gates

All green at the commit above.

| Gate           | Command                                        | Result                     |
| -------------- | ---------------------------------------------- | -------------------------- |
| Typecheck      | `pnpm typecheck`                               | 0 errors (both packages)   |
| Unit tests     | `pnpm test`                                    | 8 files, 56 tests          |
| Lint           | `pnpm lint`                                    | 0 errors, 3 warnings       |
| Format         | `pnpm format:check`                            | clean                      |
| Build          | `pnpm build`                                   | green **with no database** |
| Isolation gate | `pnpm --filter @quotapilot/web test:isolation` | 7 files, 43 tests          |
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
- **Isolation release gate** — 43 live tests, including fails-closed, cross-tenant
  read/write rejection, claim non-leakage across pooled connections, and the
  sign-in identity claim.
- **Dashboard** (`/dashboard`) — 200, rendering Today plan, Upcoming plan, Sign out.
- **Forecast** — `/forecast` (Server Component: current quarter, monthly computed
  vs override, quarter links, RECOMPUTE) and `/forecast/[quarter]` (edit per-month
  overrides, clear one).
- **Accounts** — `/accounts` lists real rows plus a create form;
  `/accounts/[accountId]` 200; an unknown id returns 404 (no existence leak).
- **Domain rules** — forecast, daily/multi-day plan, priority, risk, quota calc;
  pure and unit-tested.

## Genuinely absent or placeholder

- **Placeholder pages** (the feature component is a stub): `/opportunities` (+
  detail), `/quota`, `/actions`, `/call-coach`, `/weekly-review`, `/ramp`.
  `/ramp` matters most: a user with `onboarded_at = null` is redirected there, so
  the first-run experience is a placeholder.
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
- **Mutations use two mechanisms** — forecast and accounts writes go through route
  handlers or Server Actions depending on the file. CLAUDE.md prefers Server
  Actions throughout.

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
- PowerShell treats `[` in a path as a wildcard — use `-LiteralPath`.

## Next three steps

1. **Opportunities CRUD** — accounts are its parent (`deal.account_id` is NOT
   NULL). Mirror the accounts shape: service → Server Components → live service
   tests.
2. **Invite flow** — `/invite/[token]`, accept action, role enforced in the
   service layer. This closes the last Phase 1 item.
3. **`/ramp`** — the post-registration landing page is still a placeholder, and
   it is the first thing a new user sees.

Then the remaining placeholders: quota, actions, weekly-review, call-coach.
