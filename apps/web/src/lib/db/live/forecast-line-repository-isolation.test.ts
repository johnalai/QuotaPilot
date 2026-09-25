/**
 * QuotaPilot · Phase 1 Slice 2 — RLS ISOLATION RELEASE GATE (live DB).
 *
 * NOT part of `pnpm test`: the root vitest config excludes `src/lib/db/live/**`.
 * Run explicitly (see prisma/vitest.isolation.config.ts):
 *   pnpm --filter @quotapilot/web test:isolation
 *
 * Prereqs: dev container up, Slice 2 migration applied, `quotapilot_app` role
 * bootstrapped (bootstrap-app-role.sql). Reads APP_DATABASE_URL (the NOBYPASSRLS
 * app role) and MIGRATION_DATABASE_URL (the migration/owner role) — set by
 * dotenv-cli in the npm script. The tests never trust a bare DATABASE_URL.
 *
 * This is the cross-tenant isolation suite that architecture §7.2 mandates as
 * the gate for every PR touching a tenant-scoped table. Every positive
 * isolation result below is produced by the APP role while RLS is enforced —
 * never by the owner (whose RLS bypass could fake a pass).
 *
 * Two layers are exercised deliberately:
 *   - the RAW app-role client (tests 1-3) proves the RLS policies themselves
 *     fail closed and scope by claim;
 *   - the REPOSITORY (tests 4-5) proves reads are scoped by the TenantContext
 *     it is handed. A repository read cannot express "no claim": listForecast
 *     runs through withTenant(ctx), which always sets the claim from ctx. So
 *     the fails-closed assertions belong on the raw client, above.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Mock server-only to prevent errors in test environment
vi.mock('server-only', () => ({}));

import { PrismaClient } from '@prisma/client';
import { CatalogRepo } from '../tenancy/catalog';

const APP_URL = process.env.APP_DATABASE_URL;
const OWNER_URL = process.env.MIGRATION_DATABASE_URL;

if (!APP_URL || !OWNER_URL) {
  throw new Error(
    'isolation suite needs APP_DATABASE_URL (app role) and MIGRATION_DATABASE_URL (owner). ' +
      'Run via `pnpm --filter @quotapilot/web test:isolation`.',
  );
}

// Seed fixture ids with a per-run suffix so a leaked prior run can never be
// mistaken for this run's fixture. The random component matters because two
// suite modules can load within the same millisecond.
const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const ORG_A = `iso-a-${RUN}`;
const ORG_B = `iso-b-${RUN}`;
const USER = `iso-user-${RUN}`; // org_A owner + org_B owner
const USER2 = `iso-user2-${RUN}`; // org_A member (the unique (org, user) key allows
// only ONE membership per user per org, so the second org_A row needs a second user)
const userEmail = () => `iso-user-${RUN}@quotapilot.invalid`;
const user2Email = () => `iso-user2-${RUN}@quotapilot.invalid`;

// Fixture row ids live at module scope: declaring them inside `beforeAll` puts
// them out of scope in the `afterAll` that has to clean them up.
const M1 = `m-a1-${RUN}`; // org_A owner (USER)
const M2 = `m-a2-${RUN}`; // org_A member (USER2)
const M3 = `m-b1-${RUN}`; // org_B owner (USER)
const I1 = `i-a-${RUN}`; // org_A invite
const I2 = `i-b-${RUN}`; // org_B invite
const ACCT_A = `acct-a-${RUN}`;
const ACCT_B = `acct-b-${RUN}`;
const OPP_A1 = `opp-a-1-${RUN}`;
const OPP_A2 = `opp-a-2-${RUN}`;
const OPP_B1 = `opp-b-1-${RUN}`;
const FL_A1 = `fl-a1-${RUN}`;
const FL_A2 = `fl-a2-${RUN}`;
const FL_B1 = `fl-b1-${RUN}`;

const claim = (orgId: string) => JSON.stringify({ org_id: orgId });

let app: PrismaClient | null = null;
let owner: PrismaClient | null = null;

function appRole(): PrismaClient {
  app ??= new PrismaClient({ datasources: { db: { url: APP_URL } } });
  return app;
}

/** Owner client — used ONLY to seed/cleanup fixtures, never to assert isolation. */
function ownerRole(): PrismaClient {
  owner ??= new PrismaClient({ datasources: { db: { url: OWNER_URL } } });
  return owner;
}

beforeAll(async () => {
  const o = ownerRole();

  await o.$executeRaw`INSERT INTO organization (id, name, slug, quota_currency, updated_at) VALUES (${ORG_A}, 'Org A', ${ORG_A}, 'USD', NOW())`;
  await o.$executeRaw`INSERT INTO organization (id, name, slug, quota_currency, updated_at) VALUES (${ORG_B}, 'Org B', ${ORG_B}, 'USD', NOW())`;
  await o.$executeRaw`INSERT INTO "user" (id, email, updated_at) VALUES (${USER}, ${userEmail()}, NOW()), (${USER2}, ${user2Email()}, NOW())`;
  await o.$executeRaw`INSERT INTO membership (id, organization_id, user_id, role, updated_at) VALUES (${M1}, ${ORG_A}, ${USER}, 'owner', NOW())`;
  await o.$executeRaw`INSERT INTO membership (id, organization_id, user_id, role, updated_at) VALUES (${M2}, ${ORG_A}, ${USER2}, 'member', NOW())`;
  await o.$executeRaw`INSERT INTO membership (id, organization_id, user_id, role, updated_at) VALUES (${M3}, ${ORG_B}, ${USER}, 'owner', NOW())`;
  await o.$executeRaw`INSERT INTO invite (id, organization_id, email, role, created_by, expires_at, updated_at) VALUES (${I1}, ${ORG_A}, ${userEmail()}, 'member', ${USER}, NOW() + interval '7 days', NOW()), (${I2}, ${ORG_B}, ${userEmail()}, 'member', ${USER}, NOW() + interval '7 days', NOW())`;

  // Accounts first: deal.account_id is NOT NULL, so an opportunity cannot exist
  // without an owning account.
  await o.$executeRaw`
    INSERT INTO customer (id, organization_id, name, stage, created_at, updated_at)
    VALUES
      (${ACCT_A}, ${ORG_A}, 'Account A', 'active', NOW(), NOW()),
      (${ACCT_B}, ${ORG_B}, 'Account B', 'active', NOW(), NOW())
  `;

  // Opportunities (table is mapped to "deal")
  await o.$executeRaw`
    INSERT INTO deal (id, organization_id, account_id, owner_id, name, stage, amount, close_date, created_at, updated_at)
    VALUES
      (${OPP_A1}, ${ORG_A}, ${ACCT_A}, ${USER}, 'Opportunity A1', 'prospecting', 100000, '2026-09-30', NOW(), NOW()),
      (${OPP_A2}, ${ORG_A}, ${ACCT_A}, ${USER}, 'Opportunity A2', 'prospecting', 200000, '2026-10-31', NOW(), NOW()),
      (${OPP_B1}, ${ORG_B}, ${ACCT_B}, ${USER}, 'Opportunity B1', 'prospecting', 150000, '2026-09-30', NOW(), NOW())
  `;

  // Seed forecast lines for each org
  await o.$executeRaw`
    INSERT INTO forecast_line (id, organization_id, opportunity_id, month, amount, confidence, created_at)
    VALUES
      (${FL_A1}, ${ORG_A}, ${OPP_A1}, '2026-09', 100000, 0.8, NOW()),
      (${FL_A2}, ${ORG_A}, ${OPP_A2}, '2026-10', 200000, 0.6, NOW()),
      (${FL_B1}, ${ORG_B}, ${OPP_B1}, '2026-09', 150000, 0.7, NOW())
  `;
});

afterAll(async () => {
  const o = ownerRole();
  // Children before parents.
  await o.$executeRaw`DELETE FROM forecast_line WHERE id IN (${FL_A1}, ${FL_A2}, ${FL_B1})`;
  await o.$executeRaw`DELETE FROM deal WHERE id IN (${OPP_A1}, ${OPP_A2}, ${OPP_B1})`;
  await o.$executeRaw`DELETE FROM customer WHERE id IN (${ACCT_A}, ${ACCT_B})`;
  await o.$executeRaw`DELETE FROM invite WHERE id IN (${I1}, ${I2})`;
  await o.$executeRaw`DELETE FROM membership WHERE id IN (${M1}, ${M2}, ${M3})`;
  await o.$executeRaw`DELETE FROM "user" WHERE id IN (${USER}, ${USER2})`;
  await o.$executeRaw`DELETE FROM organization WHERE id IN (${ORG_A}, ${ORG_B})`;
  await app?.$disconnect();
  await owner?.$disconnect();
});

describe('forecast_line RLS (transaction-scoped claim, null-safe predicate)', () => {
  it('no claim → raw read returns zero rows (fails closed)', async () => {
    const rows = await appRole().$queryRaw<{ id: string }[]>`
      SELECT id FROM forecast_line WHERE organization_id IN (${ORG_A}, ${ORG_B})`;
    expect(rows).toHaveLength(0);
  });

  it('claim org_A → raw read sees only org_A forecast lines', async () => {
    const p = appRole();
    await p.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('request.jwt.claims', ${claim(ORG_A)}, true)`;
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM forecast_line WHERE organization_id IN (${ORG_A}, ${ORG_B})`;
      expect(rows.map((r) => r.id).sort()).toEqual([FL_A1, FL_A2].sort());
    });
  });

  it('claim org_B → raw read sees only org_B forecast lines (positive control)', async () => {
    const p = appRole();
    await p.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('request.jwt.claims', ${claim(ORG_B)}, true)`;
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM forecast_line WHERE organization_id IN (${ORG_A}, ${ORG_B})`;
      expect(rows.map((r) => r.id)).toEqual([FL_B1]);
    });
  });

  it('repository read is scoped to the ctx it is given, never another org', async () => {
    const repo = new CatalogRepo(appRole());
    const rows = await repo.listForecast({ organizationId: ORG_A });

    expect(rows.map((r) => r.id).sort()).toEqual([FL_A1, FL_A2].sort());
    expect(rows.every((r) => r.organizationId === ORG_A)).toBe(true);
  });

  it('claim does not leak across transactions: the next pooled query has no claim', async () => {
    const p = appRole();
    await p.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('request.jwt.claims', ${claim(ORG_A)}, true)`;
    });

    const [after] = await p.$queryRaw<{ setting: string | null }[]>`
      SELECT current_setting('request.jwt.claims', true) AS setting`;
    expect(after.setting === null || after.setting === '').toBe(true);
  });
});
