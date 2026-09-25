/**
 * QuotaPilot · Forecast Override RLS ISOLATION TEST (live DB).
 *
 * Tests that forecast override queries properly enforce tenancy at the database level
 * via RLS, ensuring no cross-organization data leakage.
 *
 * Run via: pnpm --filter @quotapilot/web test:isolation
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaClient } from '@prisma/client';

const APP_URL = process.env.APP_DATABASE_URL;
const OWNER_URL = process.env.MIGRATION_DATABASE_URL;

if (!APP_URL || !OWNER_URL) {
  throw new Error(
    'isolation suite needs APP_DATABASE_URL (app role) and MIGRATION_DATABASE_URL (owner). ' +
      'Run via `pnpm --filter @quotapilot/web test:isolation`.',
  );
}

// Seed fixture ids with a per-run suffix so a leaked prior run can never be
// mistaken for this run's fixture.
const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const ORG_A = `forecast-org-a-${RUN}`;
const ORG_B = `forecast-org-b-${RUN}`;
const USER = `forecast-user-${RUN}`; // org_A owner + org_B owner
const userEmail = () => `forecast-user-${RUN}@quotapilot.invalid`;

// Fixture row ids. These MUST be built in JS and passed as bind parameters.
// Inside a Prisma tagged template, `${...}` becomes a `$n` placeholder, so
// writing 'm-a1-${RUN}' *inside SQL quotes* sends the literal text `m-a1-$1`:
// the per-run suffix silently never applied and both forecast suites ended up
// competing for the same row ids.
const MEMBERSHIP_A = `m-a1-${RUN}`;
const MEMBERSHIP_B = `m-b1-${RUN}`;
const OVERRIDE_IDS = [
  `override-a-jan-${RUN}`,
  `override-a-feb-${RUN}`,
  `override-b-jan-${RUN}`,
  `override-b-feb-${RUN}`,
];

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
  await o.$executeRaw`INSERT INTO "user" (id, email, updated_at) VALUES (${USER}, ${userEmail()}, NOW())`;
  await o.$executeRaw`INSERT INTO membership (id, organization_id, user_id, role, updated_at) VALUES (${MEMBERSHIP_A}, ${ORG_A}, ${USER}, 'owner', NOW())`;
  await o.$executeRaw`INSERT INTO membership (id, organization_id, user_id, role, updated_at) VALUES (${MEMBERSHIP_B}, ${ORG_B}, ${USER}, 'owner', NOW())`;

  // Seed forecast overrides for both organizations
  await o.$executeRaw`
    INSERT INTO forecast_override (id, organization_id, month, committed, "bestCase", pipeline, created_at, updated_at)
    VALUES
    (${OVERRIDE_IDS[0]}, ${ORG_A}, '2026-01', 10000, 15000, 20000, NOW(), NOW()),
    (${OVERRIDE_IDS[1]}, ${ORG_A}, '2026-02', 12000, 18000, 22000, NOW(), NOW()),
    (${OVERRIDE_IDS[2]}, ${ORG_B}, '2026-01', 5000, 8000, 12000, NOW(), NOW()),
    (${OVERRIDE_IDS[3]}, ${ORG_B}, '2026-02', 6000, 9000, 13000, NOW(), NOW())
  `;
});

afterAll(async () => {
  const o = ownerRole();
  await o.$executeRaw`DELETE FROM forecast_override WHERE id IN (${OVERRIDE_IDS[0]}, ${OVERRIDE_IDS[1]}, ${OVERRIDE_IDS[2]}, ${OVERRIDE_IDS[3]})`;
  await o.$executeRaw`DELETE FROM membership WHERE id IN (${MEMBERSHIP_A}, ${MEMBERSHIP_B})`;
  await o.$executeRaw`DELETE FROM "user" WHERE id IN (${USER})`;
  await o.$executeRaw`DELETE FROM organization WHERE id IN (${ORG_A}, ${ORG_B})`;
  await app?.$disconnect();
  await owner?.$disconnect();
});

describe('RLS backstop on forecast_override (transaction-scoped claim)', () => {
  it('no claim → reads zero rows (fails closed)', async () => {
    const p = appRole();
    const rows = await p.$queryRaw<{ organization_id: string }[]>`
      SELECT organization_id FROM forecast_override WHERE organization_id IN (${ORG_A}, ${ORG_B})`;
    expect(rows).toHaveLength(0);
  });

  it('claim org_A → only org_A forecast overrides visible', async () => {
    const p = appRole();
    await p.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('request.jwt.claims', ${claim(ORG_A)}, true)`;
      const rows = await tx.$queryRaw<{ organization_id: string; month: string }[]>`
        SELECT organization_id, month FROM forecast_override WHERE organization_id IN (${ORG_A}, ${ORG_B}) ORDER BY organization_id, month`;
      expect(
        rows.map((r) => ({
          organization_id: r.organization_id,
          month: r.month,
        })),
      ).toEqual([
        { organization_id: ORG_A, month: '2026-01' },
        { organization_id: ORG_A, month: '2026-02' },
      ]);
    });
  });

  it('claim org_A → INSERT org_B row rejected by WITH CHECK policy', async () => {
    const p = appRole();
    await expect(
      p.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('request.jwt.claims', ${claim(ORG_A)}, true)`;
        await tx.$executeRaw`
          INSERT INTO forecast_override (id, organization_id, month, committed, "bestCase", pipeline, created_at, updated_at)
          VALUES ('leak-override', ${ORG_B}, '2026-03', 1000, 2000, 3000, NOW(), NOW())
        `;
      }),
    ).rejects.toThrow();
  });

  it('claim org_A → UPDATE/DELETE of org_B rows matches 0 rows', async () => {
    const p = appRole();
    await p.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('request.jwt.claims', ${claim(ORG_A)}, true)`;
      const updated = await tx.$executeRaw`
        UPDATE forecast_override SET committed = 99999 WHERE organization_id = ${ORG_B}
      `;
      expect(updated).toBe(0);
      const deleted = await tx.$executeRaw`
        DELETE FROM forecast_override WHERE organization_id = ${ORG_B}
      `;
      expect(deleted).toBe(0);
    });
  });

  it('claim org_B (positive control) → only org_B forecast overrides visible', async () => {
    const p = appRole();
    await p.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('request.jwt.claims', ${claim(ORG_B)}, true)`;
      const rows = await tx.$queryRaw<{ organization_id: string; month: string }[]>`
        SELECT organization_id, month FROM forecast_override WHERE organization_id IN (${ORG_A}, ${ORG_B}) ORDER BY organization_id, month`;
      expect(
        rows.map((r) => ({
          organization_id: r.organization_id,
          month: r.month,
        })),
      ).toEqual([
        { organization_id: ORG_B, month: '2026-01' },
        { organization_id: ORG_B, month: '2026-02' },
      ]);
    });
  });

  it('claim does not leak across transactions: next pool query reads 0 rows (null-safe)', async () => {
    const p = appRole();
    const [after] = await p.$queryRaw<{ setting: string | null }[]>`
      SELECT current_setting('request.jwt.claims', true) AS setting`;
    expect(after.setting === null || after.setting === '').toBe(true);
    const rows = await p.$queryRaw<{ organization_id: string }[]>`
      SELECT organization_id FROM forecast_override WHERE organization_id IN (${ORG_A}, ${ORG_B})`;
    expect(rows).toHaveLength(0);
  });
});
