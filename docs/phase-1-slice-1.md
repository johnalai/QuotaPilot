# Phase 1 · Slice 1 — Auth deps, password hashing, and the RLS mechanism spike

**Status:** recorded · **Date:** 2026-09-16 · **Part of** `implementation-plan.md` Phase 1 (gating)

This slice did **not** create a production Prisma schema, migrations, or the
`User/Organization/Membership/Invite` tables, and it did not wire Auth.js. It
installed the Phase 1 dependencies, decided the password-hashing library, and
proved the Postgres RLS + session-claim mechanism against a throwaway scratch
table in the local dev database. Everything is scratch and reproducible.

---

## 1. Installed versions

Added to `apps/web/package.json`:

| Package                | Version         | Kind          | Note                                                                  |
| ---------------------- | --------------- | ------------- | --------------------------------------------------------------------- |
| `next-auth`            | `5.0.0-beta.32` | dependency    | Auth.js v5 (beta line); peer-verified against `next ^16`, `react ^19` |
| `@auth/prisma-adapter` | `2.11.3`        | dependency    | peer range supports `@prisma/client` up to `>=6`                      |
| `@prisma/client`       | `6.19.3`        | dependency    | latest stable 6.x — see version rationale below                       |
| `argon2`               | `0.45.1`        | dependency    | native (node-gyp-build); see hashing decision                         |
| `prisma`               | `6.19.3`        | devDependency | Prisma CLI (`@prisma/engines` 6.19.3)                                 |

Why **Prisma 6.19.3** and not 7.10.0 / 8.0.0-rc:

- npm dist-tags at install time: `latest` = `8.0.0-rc.15` (a **release
  candidate**, avoided for Phase 1), previous stable line = `7.x`
  (`prev` → `7.10.0`).
- `@auth/prisma-adapter@2.11.3` declares peer `@prisma/client >=2.26 || ≥3 || ≥4 || ≥5 || ≥6`
  — it does **not** declare Prisma 7 support. A Prisma-7 pin would trip a peer
  warning and is an unproven matrix.
- The documented RLS mechanism (architecture §7.2 — `set_config` in an
  interactive transaction) is Prisma-6-era, and this repo has no production
  schema yet; 6.19.3 is the lowest-friction, fully-peer-compatible choice.
  **Prisma 7.10 (or 8 once stable) is a Phase 2+ upgrade candidate.**

`pnpm-workspace.yaml` `allowBuilds` now includes `argon2`, `@prisma/client`,
`@prisma/engines`, `prisma` (native/pre/postinstall scripts). `pnpm` blocked
these by default; they were deliberately allowed because argon2 ships a native
binary and Prisma runs generate/engine installs.

Environment: Node 24.13.0, pnpm 11.7.0, Postgres 16 (docker compose `db`),
Docker Desktop 28.5.2. Local 5432 is only used by the dev container.

## 2. Password-hashing decision — **argon2**

Rule: test argon2 first; fall back to bcryptjs only if the native package
cannot install or run reliably on this Windows setup.

Result: **argon2@0.45.1 installed and ran reliably** (`argon2id`, PHC format).
The hash round-trip test (`apps/web/src/lib/password.ts` +
`password.test.ts`) passes 4/4 on this machine:

- produces a `$argon2id$` hash,
- verifies the correct password,
- rejects a wrong password,
- uses a fresh salt per hash (two hashes of the same password differ).

Hash throughput ~300–400 ms per hash at argon2 defaults (64 MiB memory cost,
time cost 3) — acceptable for login.

**Decision recorded:** use **argon2id** (native `argon2@0.45.1`) for the
Credentials provider. If a future machine/Pipeline runner ever cannot build it,
the fallback path is `bcryptjs@3.0.3` (pure JS) behind the same seam
`apps/web/src/lib/password.ts` — no call sites change. There are two `auth`
seams to remember: `password.ts` (`hashPassword`/`verifyPassword`) and the
Auth.js adapter wiring, which this slice deliberately does **not** implement.

## 3. RLS approach tested

Mechanism proposed in architecture §7.2: per HTTP request, open an interactive
transaction and set `select set_config('request.jwt.claims', '<json>', true)`
(transaction-local) before executing repository queries; every tenant table has
a policy `USING/WITH CHECK (org_id = (current_setting('request.jwt.claims',
true)::jsonb ->> 'org_id'))`. The fallback (Prisma RLS preview adapter) was
the plan's alternative; this slice tests the deterministic `set_config` path
end-to-end so the decision is evidence-based.

**Hardening applied to the policy (the one deviation from architecture §7.2):**
the claim read is null-guarded — `NULLIF(current_setting('request.jwt.claims',
true), '')::jsonb ->> 'org_id'` — so both NULL and the `''` placeholder read as
"no claim" and the policy fails closed (0 rows / no rows written). Rationale and
the 22P02 failure this prevents are documented in §6. The recommendation (§9) is
to record this hardened form into architecture §7.2.

## 4. Database role used

- **Owner/setup role:** `quotapilot` (the docker-compose bootstrap superuser).
  Used **only** for setup (`CREATE ROLE app_role`, `CREATE TABLE`,
  `CREATE POLICY`, `GRANT`, seed) and cleanup, and one non-claim sanity select.
  It bypasses RLS and is explicitly **not** the path any isolation claim rests on.
- **Application (RLS-subject) role:** `app_role`, created as
  `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT`.
  Verified `rolbypassrls = f`. All isolation checks run as `app_role`.

There is no `BYPASSRLS` anywhere on the tested path — every positive result
below is produced while RLS is enforced.

## 5. Connection mode used

- **Direct-SQL path:** `psql -U app_role` via the container's local socket
  (each `psql` invocation is a fresh connection).
- **Prisma path:** `@prisma/client` v6.19.3 over TCP against
  `app_role@localhost:5432/quotapilot`, one pooled `PrismaClient` (default
  pool) plus one `?connection_limit=1` client to deterministically demonstrate
  the session-scoped leak danger.

Local Postgres here is **not** behind PgBouncer. Production will use Supabase's
**transaction** pooler; the conclusion in §7 is written to be pooler-safe.

## 6. Claim-setting behavior (what was observed)

1. **No claim at all** → with the null-safe policy the predicate evaluates
   NULL → RLS blocks reads (0 rows) and writes. Verified via both direct SQL and
   Prisma. Nuance observed: `current_setting('request.jwt.claims', true)` is
   NULL on a fresh connection **only before the placeholder GUC has ever been
   SET on the server**; once any connection has SET the two-part name, the
   placeholder is registered server-wide and `current_setting` then returns `''`
   (its empty default) rather than NULL — including on brand-new connections.
   Hence the policy must treat `''` and NULL identically.
2. **Transaction-scoped claim (`set_config(..., true)` = `SET LOCAL`) inside
   `prisma.$transaction(async (tx) => …)`** → only rows of the claimed org are
   visible; an `INSERT` of another org's row throws Postgres error
   `new row violates row-level security policy`; `UPDATE`/`DELETE` against
   another org's rows match **0 rows**. Verified both ways (org_A and org_B
   positive control) in both direct SQL and Prisma.
3. **Session state does not survive across connections.** A `SET
request.jwt.claims` (session-scoped, `is_local=false`) on one connection was
   invisible on a freshly-opened second connection (NULL; reads still blocked).
   Prisma's default pooled client behaves the same: after the interactive
   transactions commit, later pool queries evaluate the claim as inert.
4. **Why session-scoped claims are unsafe (demonstrated on purpose):** on a
   fixed connection, a session-scoped `set_config(..., false)` persisted and
   leaked into the next statement on that connection. Under any pool that
   reuses connections, session-scoped claims are therefore non-deterministic —
   a later request could inherit a leaked claim. Architecture §7.2's mandate to
   use **transaction-scoped** claims is the correct design.

5. **The `22P02` placeholder hazard (why the policy is null-safe).** With the
   naive predicate `current_setting('request.jwt.claims', true)::jsonb`, success
   or `22P02 invalid input syntax for type json` depends on the connection's
   history (see §6.1): once any connection has SET the GUC, its `''` placeholder
   reads as an attempted cast of an empty string — a hard ERROR mid-request, not
   a quiet no-rows result. This was observed live during the spike (a plain read
   threw `22P02` on a pool connection that had previously been SET). The
   null-safe form (`NULLIF(..., '')::jsonb`) turns it into a fail-closed policy.
   **Defense-in-depth must fail quiet, not fail loud.**

## 7. Prepared-statement / pooling issues

- **No failure** preparing statements with the claim or the RLS policy.
  `set_config` ran fine as a normal (prepared) statement through Prisma's query
  engine.
- **Pooling consequence (the key finding):** Prisma pools and reuses
  connections; session-scoped GUCs are not a per-request boundary. The claim
  must be set with `is_local = true` inside the request's interactive
  transaction (or a dedicated per-request transaction), so it is reverted at
  COMMIT/ROLLBACK. This is compatible with PgBouncer **transaction** pooling
  (which also discards session state between transactions — the transaction-
  scoped approach is unaffected).
- Prisma interactive transactions require a transaction-capable pooler in
  production (Supabase transaction pooler); statement-only pooling would block
  this pattern.

## 8. Test results

| Check                                                              | Path                        | Result                  |
| ------------------------------------------------------------------ | --------------------------- | ----------------------- |
| role is `app_role`, `rolbypassrls = f`                             | direct SQL + Prisma         | ✅                      |
| no claim → SELECT blocked (0 rows)                                 | direct SQL + Prisma         | ✅                      |
| claim org_A → only org_A rows                                      | direct SQL + Prisma         | ✅                      |
| claim org_A → INSERT org_B → RLS error                             | direct SQL + Prisma         | ✅                      |
| claim org_A → UPDATE / DELETE org_B → 0 rows                       | direct SQL + Prisma         | ✅                      |
| claim org_B (positive control) → only org_B rows                   | direct SQL + Prisma         | ✅                      |
| session claim invisible on a fresh connection                      | direct SQL (2 conns)        | ✅                      |
| claim inert after Prisma transactions (later pool query)           | Prisma spike                | ✅ (7/7)                |
| session-scoped claim persists on a reused connection (danger demo) | Prisma `connection_limit=1` | ✅ (observed, expected) |

Password hashing: `apps/web/src/lib/password.test.ts` 4/4 ✅.

Files used in this slice (all scratch unless noted):

- `apps/web/src/lib/password.ts` + `password.test.ts` — **kept** (real helper/test).
- `apps/web/src/lib/db/spikes/{rls-scratch-setup.sql,rls-scratch-direct-checks.sql,rls-scratch-cleanup.sql,prisma.spike.prisma,rls-scratch.spike.ts,vitest.spike.config.ts}` — **throwaway, delete with cleanup.sql after milestone**.
- `apps/web/package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` — **kept** (deps + allowBuilds).

## 9. Recommendation

**Adopt the `set_config('request.jwt.claims', …, true)` interactive-transaction
mechanism** as the Phase 1 RLS integration. It is proven deterministic here on
a real app role subject to RLS, works through the Prisma query engine and
prepared statements, and is compatible with transaction pooling. The Prisma RLS
**preview** adapter is not needed and adds an unproven dependency; it remains a
documented fallback if a future schema change makes raw `set_config` awkward.

Recorded into `architecture.md` §7.2 at Phase 1 approval (2026-09-16): the
transaction-scoped `set_config('request.jwt.claims', …, true)` mechanism set
inside the same Prisma interactive transaction as the tenant-scoped queries
(with all such queries on the transaction-bound client), the null-safe policy
predicate (`NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->>
'org_id'`), the `NOVBYPASSRLS` app role / owner-migration-role split, and the
reconnect-probe + session-leak evidence for rejecting session-scoped claims. A
pooled connection can therefore never turn isolation into a `22P02` crash.

## 10. Unresolved risks

- **Prisma 7 / 8 migration** — revisit the drop-in upgrade before Phase 2 when
  binding `@auth/prisma-adapter` (peer range) and the production schema.
- **PgBouncer transaction pooling not yet exercised live** — the local
  container has no pooler; Slice 2+ should validate against Supabase dev's
  pooler before Phase 2 depending on it.
- **Argon2 build portability** — compiles here; CI (ubuntu-latest, node 22) and
  the Vercel build environment still need to be exercised. bcryptjs fallback is
  ready behind `password.ts` if a runner can't build.
- **`prisma generate` on the real schema** — not yet run (no production schema
  exists); the spike demonstrated the toolchain works with a model-less
  datasource.
- **The scratch artifacts** (`spikes/`) should be removed before Phase 1
  milestone; `app_role`, the scratch table, and the throwaway credential are
  local-dev only and are dropped by `rls-scratch-cleanup.sql`.
