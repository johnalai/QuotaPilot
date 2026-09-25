# Phase 1 · Slice 2 — Roles, schema, and the RLS foundation

**Status:** recorded · **Date:** 2026-09-16 · **Part of** `implementation-plan.md` Phase 1

This slice applies the Phase 1 **vertical slice**: the production Prisma schema
(`organization`, `user`, `membership`, `invite`, plus the Auth.js adapter tables
`account` / `session` / `verification_token`), the `quotapilot_app` runtime role
(NOBYPASSRLS, non-owner), per-table grants, the row-level-security backstop on the
tenant tables, and the two live-DB suites that gate every future tenant-scoped
PR (isolation + referential integrity).

It did **not** implement registration, login, logout, invitations, route gating,
or UI. No feature code ships in this slice.

---

## 1. Approved design (recorded in the Phase 1 Slice 2 approval)

| Decision                    | Value                                                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Physical table names        | lowercase snake_case (`organization`, `user`, `membership`, `invite`, `account`, `session`, `verification_token`) |
| Physical column names       | lowercase snake_case (`organization_id`, `provider_account_id`, …)                                                |
| Prisma field names          | camelCase, kept exact for the Auth.js adapter contract (`sessionToken`, `providerAccountId`, `refresh_token`, …)  |
| `Invite.createdById`        | required, `ON DELETE RESTRICT`                                                                                    |
| `Invite.organization`       | `ON DELETE CASCADE`                                                                                               |
| `organization` grants       | narrow; **no DELETE / TRUNCATE / REFERENCES**                                                                     |
| `membership` / `invite` RLS | org-claim policies enabled                                                                                        |
| Enum type names             | mixed-case (`"PlanTier"`, `"MembershipRole"`, `"MembershipStatus"`) — approved for this migration                 |
| Suites in this slice        | cross-tenant isolation **release gate** + referential-integrity (both against the local dev DB)                   |

## 2. Roles and credential separation

- **Owner / migration role:** `quotapilot` — the docker-compose bootstrap
  superuser (`rolsuper=t`, `rolbypassrls=t`). Used for migrations, `GRANT`,
  `CREATE POLICY`, seeding, and the test cleanup/seeding. Its **only** function
  on the runtime path is to be excluded from it.
- **App (RLS-subject) role:** `quotapilot_app`, bootstrapped from
  `apps/web/prisma/bootstrap-app-role.sql`:
  `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT`
  - `GRANT CONNECT ON DATABASE quotapilot`.

Verified role attributes (post-bootstrap, live DB):

| Check                                           | Result |
| ----------------------------------------------- | ------ |
| `rolbypassrls = f`                              | ✅     |
| not superuser / no CREATEROLE / no CREATEDB     | ✅     |
| owns **0** objects (owns no application tables) | ✅     |
| **no** `CREATE` on schema `public` (USAGE only) | ✅     |
| no role memberships → no inherited privileges   | ✅     |

- Migration/owner credentials live in **`.env.migration`** (gitignored:
  `DATABASE_URL` = `MIGRATION_DATABASE_URL` = owner URL).
- Runtime credentials live in **`.env.local`** (gitignored):
  `DATABASE_URL` = `APP_DATABASE_URL` = `quotapilot_app` URL.
- `.env.*` are gitignored; `.env.example` (tracked) documents both with
  placeholders.
- Distinct env var names (`APP_DATABASE_URL` / `MIGRATION_DATABASE_URL`) defeat
  dotenv-cli merge collisions when both files are loaded (`test:isolation`).

## 3. Migration owner

Verified against the **local** dev container before applying: `quotapilot` is the
owner (superuser), `_prisma_migrations` had 0 rows (clean slate), and the target
database `quotapilot@localhost:5432` is the only database touched. No production
or Supabase connection string is used anywhere in this repository.

`ALTER DEFAULT PRIVILEGES` explicitly targets the migration owner so any future
table/sequence created by `quotapilot` inherits the same grants automatically:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE quotapilot IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO quotapilot_app;
ALTER DEFAULT PRIVILEGES FOR ROLE quotapilot IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO quotapilot_app;
```

## 4. Schema (final migration `20260916220744_init`)

Tables (`applied` from the reported DDL — see §7 for evidence):

| Table                                        | Tenant-scoped? | RLS     | Notes                                           |
| -------------------------------------------- | -------------- | ------- | ----------------------------------------------- |
| `organization`                               | root           | **no**  | narrow grants, no DELETE (Slice 2 Adjustment 1) |
| `user`                                       | no             | **no**  | identity; no org-claim policy                   |
| `membership`                                 | yes            | **yes** | `(organization_id, user_id)` unique             |
| `invite`                                     | yes            | **yes** | `created_by` RESTRICT, `organization` CASCADE   |
| `account` / `session` / `verification_token` | no             | **no**  | Auth.js adapter contract                        |

Key constraints: `membership.organization_id`/`user_id` CASCADE; `invite.organization_id`
CASCADE; `invite.created_by` RESTRICT; `account.user_id` / `session.user_id` CASCADE;
`organization.slug` unique; `user.email` unique; `account.provider + provider_account_id`
unique; `session.session_token` unique; `verification_token.identifier + token` unique.

The full `migration.sql` (enum types, tables, indexes/uniques, FKs, grants,
`ALTER DEFAULT PRIVILEGES`, RLS policies) was shown in full and approved before
execution (item 4 of the apply safeguards).

## 5. Grants and the RLS backstop

Grant model (all as migration owner):

- `USAGE` on schema `public` (no `CREATE` → no DDL for the app role).
- Full CRUD on `"user"`, `membership`, `invite`, `account`, `session`,
  `verification_token`.
- `organization`: `SELECT`; column-restricted `INSERT` / `UPDATE`
  (`id, name, slug, quota_currency, settings, feature_flags, updated_at`) —
  **no** `DELETE`; `plan_tier` stays DB-defaulted (`'pro'`) and is not writable
  by the app role.
- `USAGE, SELECT` on all sequences (future-proofing).
- **`USAGE` on the enum types** `"PlanTier"`, `"MembershipRole"`,
  `"MembershipStatus"` — the app role must be able to read/write enum-typed
  columns (`membership.role`, `invite.role`, `organization.plan_tier`).
- `ALTER DEFAULT PRIVILEGES FOR ROLE quotapilot` (above).

RLS: `ALTER TABLE membership / invite ENABLE ROW LEVEL SECURITY;` with the
**transaction-scoped, null-safe** org-claim policy mandated by architecture §7.2
(the Slice 1 finding — fails **quiet** closed, never a `22P02` crash):

```sql
CREATE POLICY membership_isolation ON membership FOR ALL
  USING (organization_id = NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id')
  WITH CHECK (organization_id = NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'org_id');
-- invite_isolation: identical predicate
```

`organization` deliberately carries **no** org-claim policy: it is the tenant
root, reached only through the service-layer authorization boundary
(`authorizeOrganization` in
[apps/web/src/lib/db/authorization/org-access.ts](../apps/web/src/lib/db/authorization/org-access.ts))
backed by least-privilege grants.

## 6. Test suites in this slice

- **Unit (pure, part of `pnpm test`):** `org-access.test.ts` — the unrelated-org
  boundary (member of org_B hitting org_A fails closed), inactive/owner/admin
  matrix.
- **Live DB (excluded from `pnpm test`, run via `pnpm --filter @quotapilot/web
test:isolation`):**
  - `src/lib/db/live/isolation.test.ts` — the **cross-tenant RLS release gate**.
    Every positive isolation assertion is produced by the NOBYPASSRLS app role,
    never the owner (whose RLS bypass would fake a pass). Covers: app-role
    identity/ownership, no-claim fails closed, org_claim org_A → only org_A rows,
    INSERT org_B rejected by `WITH CHECK`, UPDATE/DELETE org_B → 0 rows, org_B
    positive control, and claim inertness after the transaction commits (pool
    safety).
  - `src/lib/db/live/referential-integrity.test.ts` — FK directions: deleting an
    invite-creating user **fails** P2003 (RESTRICT); deleting an organization
    **cascades** its invites; deleting a user cascades its memberships/accounts/
    sessions.

## 7. Apply sequence (as executed)

1. ✅ Verified migration-owner role (`quotapilot`, local superuser).
2. ✅ `ALTER DEFAULT PRIVILEGES` retargeted to `FOR ROLE quotapilot`.
3. ✅ Showed the complete final migration SQL (all seven sections) before running.
4. ✅ Confirmed migration-owner `DATABASE_URL` ≠ runtime `DATABASE_URL`.
5. ✅ Confirmed only the local dev database is modified.
6. ✅ Bootstrapped `quotapilot_app`; verified role attributes (§2).
7. ✅ Applied the migration (`pnpm --filter @quotapilot/web db:migrate`) —
   `20260916220744_init` applied, `prisma generate` OK.
8. ✅ Ran the isolation suite — 10/10.
9. ✅ Ran the referential-integrity suite — 3/3.
10. ✅ Ran `pnpm lint` / `pnpm typecheck` / `pnpm test`.

Two seed bugs were caught and fixed while bringing up the isolation suite (both
in the fixture seed, not in the schema):

- `organization` / `user` / `membership` / `invite` have **NOT NULL `updated_at`
  with no DB default** (only `created_at` is DB-defaulted). The raw seed INSERTs
  omitted it → `23502`. Fixed by supplying `updated_at = NOW()`.
- The fixture initially created **two memberships for one user in org_A** — but
  the unique index `(organization_id, user_id)` (correctly) allows one per
  (org, user). Fixed by giving the org_A _member_ membership to a second seed
  user, keeping the two-rows-per-org expectation. Vitest's `afterAll` runs even
  when `beforeAll` throws, so no fixture ever leaked between runs (verified: 0
  orphaned `iso-*` rows after each failure).

## 8. Test evidence

| Check                                                        | Path                  | Result                          |
| ------------------------------------------------------------ | --------------------- | ------------------------------- |
| `quotapilot_app` identity: `rolbypassrls = f`, not superuser | isolation suite       | ✅ 2/2                          |
| app role owns 0 application tables                           | isolation suite       | ✅                              |
| no claim → reads **0** rows (fails closed)                   | isolation suite       | ✅                              |
| claim org_A → only org_A memberships visible                 | isolation suite       | ✅                              |
| claim org_A → INSERT org_B row rejected (`WITH CHECK`)       | isolation suite       | ✅                              |
| claim org_A → UPDATE/DELETE org_B → 0 rows                   | isolation suite       | ✅                              |
| claim org_B (positive control) → only org_B rows             | isolation suite       | ✅                              |
| claim inert after transaction (no cross-connection leak)     | isolation suite       | ✅                              |
| deleting an invite-creating user → P2003 (RESTRICT)          | referential-integrity | ✅                              |
| deleting an organization cascades its invites                | referential-integrity | ✅                              |
| deleting a user cascades memberships/accounts/sessions       | referential-integrity | ✅                              |
| unrelated-org authz fails closed (unit)                      | `pnpm test`           | ✅ 7/7                          |
| lint / typecheck / full unit suite                           | repo root             | ✅ lint · typecheck · **38/38** |

> Evidence note: rows 1–11 (live-DB isolation + referential integrity) are from the
> recorded Slice 2 run (§7). They were **not** re-executed during this cleanup — the
> migration was intentionally not applied in this environment. Rows 12–13 were
> re-verified here and reflect this run.

## 9. Unresolved risks

- **PgBouncer transaction pooling not yet exercised live** — carried forward from
  Slice 1; validate against a Supabase dev pooler before Phase 2 depends on it.
- **Auth.js adapter field contract** — this slice establishes the exact physical
  columns. Wiring the adapter (Phase 2) will be the first consumer of the
  `account`/`session`/`verification_token` schema.
- **`spikes/` scratch artifacts** (Slice 1) still to be removed at the Phase 1
  milestone per Slice 1 §10.
