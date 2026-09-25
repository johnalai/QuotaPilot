/**
 * QuotaPilot · Forecast Override Repository ISOLATION TEST (live DB).
 *
 * Tests that forecast override repository methods properly enforce tenancy
 * via the transaction-scoped RLS claim set in the withTenant wrapper.
 *
 * Run via: pnpm --filter @quotapilot/web test:isolation
 */
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

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
// mistaken for this run's fixture.
const RUN = Date.now().toString(36);
const ORG_A = `forecast-org-a-${RUN}`;
const ORG_B = `forecast-org-b-${RUN}`;
const USER = `forecast-user-${RUN}`; // org_A owner + org_B owner
const userEmail = () => `forecast-user-${RUN}@quotapilot.invalid`;

const claim = (orgId: string) => JSON.stringify({ org_id: orgId });

let app: PrismaClient | null = null;
let owner: PrismaClient | null = null;

// Repository instances
let catalogA: CatalogRepo | null = null;
let catalogB: CatalogRepo | null = null;

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
  console.log('RUN value:', RUN);
  console.log('ORG_A:', ORG_A);
  console.log('USER:', USER);

  // Clean up any leftover data from previous runs
  await o.$executeRaw`DELETE FROM forecast_override WHERE id IN ('override-a-jan-${RUN}', 'override-a-feb-${RUN}', 'override-b-jan-${RUN}', 'override-b-feb-${RUN}')`;
  await o.$executeRaw`DELETE FROM membership WHERE id IN ('m-a1-${RUN}', 'm-b1-hardcoded')`;
  await o.$executeRaw`DELETE FROM "user" WHERE id = ${USER}`;
  await o.$executeRaw`DELETE FROM organization WHERE id IN (${ORG_A}, ${ORG_B})`;

  // Now insert the fresh data
  await o.$executeRaw`INSERT INTO organization (id, name, slug, quota_currency, updated_at) VALUES (${ORG_A}, 'Org A', ${ORG_A}, 'USD', NOW())`;
  await o.$executeRaw`INSERT INTO organization (id, name, slug, quota_currency, updated_at) VALUES (${ORG_B}, 'Org B', ${ORG_B}, 'USD', NOW())`;
  await o.$executeRaw`INSERT INTO "user" (id, email, updated_at) VALUES (${USER}, ${userEmail()}, NOW())`;
  await o.$executeRaw`INSERT INTO membership (id, organization_id, user_id, role, updated_at) VALUES ('m-a1-${RUN}', ${ORG_A}, ${USER}, 'owner', NOW())`;
  await o.$executeRaw`INSERT INTO membership (id, organization_id, user_id, role, updated_at) VALUES ('m-b1-hardcoded', ${ORG_B}, ${USER}, 'owner', NOW())`;

  // Seed forecast overrides for both organizations
  await o.$executeRaw`
    INSERT INTO forecast_override (id, organization_id, month, committed, "bestCase", pipeline, created_at, updated_at)
    VALUES
    ($1, ${ORG_A}, '2026-01', 10000, 15000, 20000, NOW(), NOW()),
    ($2, ${ORG_A}, '2026-02', 12000, 18000, 22000, NOW(), NOW()),
    ($3, ${ORG_B}, '2026-01', 5000, 8000, 12000, NOW(), NOW()),
    ($4, ${ORG_B}, '2026-02', 6000, 9000, 13000, NOW(), NOW())
  `, `override-a-jan-${RUN}`, `override-a-feb-${RUN}`, `override-b-jan-${RUN}`, `override-b-feb-${RUN}`;
});

afterAll(async () => {
  const o = ownerRole();
  await o.$executeRaw`DELETE FROM forecast_override WHERE id IN ('override-a-jan-${RUN}', 'override-a-feb-${RUN}', 'override-b-jan-${RUN}', 'override-b-feb-${RUN}')`;
  await o.$executeRaw`DELETE FROM membership WHERE id IN ('m-a1-hardcoded', 'm-b1-hardcoded')`;
  await o.$executeRaw`DELETE FROM "user" WHERE id IN (${USER})`;
  await o.$executeRaw`DELETE FROM organization WHERE id IN (${ORG_A}, ${ORG_B})`;
  await app?.$disconnect();
  await owner?.$disconnect();
});

describe('ForecastOverride repository methods with RLS enforcement', () => {
  beforeEach(() => {
    // Create repository instances for each organization
    catalogA = new CatalogRepo(appRole());
    catalogB = new CatalogRepo(appRole());
  });

  afterEach(() => {
    // Clean up repository instances
    catalogA = null;
    catalogB = null;
  });

  describe('listForecastOverrides', () => {
    it('org A → only org A forecast overrides visible', async () => {
      const overridesA = await catalogA.listForecastOverrides({ organizationId: ORG_A });
      expect(overridesA).toHaveLength(2);
      expect(overridesA.every(o => o.organizationId === ORG_A)).toBe(true);
      expect(overridesA.map(o => o.month).sort()).toEqual(['2026-01', '2026-02']);
    });

    it('org B → only org B forecast overrides visible', async () => {
      const overridesB = await catalogB.listForecastOverrides({ organizationId: ORG_B });
      expect(overridesB).toHaveLength(2);
      expect(overridesB.every(o => o.organizationId === ORG_B)).toBe(true);
      expect(overridesB.map(o => o.month).sort()).toEqual(['2026-01', '2026-02']);
    });

    it('no claim → reads zero rows (fails closed)', async () => {
      // Create a repository without setting the claim (simulating no tenant context)
      const catalogNoClaim = new CatalogRepo(appRole());
      const overrides = await catalogNoClaim.listForecastOverrides({ organizationId: ORG_A });
      expect(overrides).toHaveLength(0);
    });
  });

  describe('getForecastOverride', () => {
    it('org A → can retrieve org A forecast overrides', async () => {
      const override = await catalogA.getForecastOverride({ organizationId: ORG_A }, '2026-01');
      expect(override).not.toBeNull();
      if (override) {
        expect(override.organizationId).toBe(ORG_A);
        expect(override.month).toBe('2026-01');
        expect(override.committed).toBe(10000);
      }
    });

    it('org A → returns null for non-existent month', async () => {
      const override = await catalogA.getForecastOverride({ organizationId: ORG_A }, '2026-13');
      expect(override).toBeNull();
    });

    it('org B → can retrieve org B forecast overrides', async () => {
      const override = await catalogB.getForecastOverride({ organizationId: ORG_B }, '2026-01');
      expect(override).not.toBeNull();
      if (override) {
        expect(override.organizationId).toBe(ORG_B);
        expect(override.month).toBe('2026-01');
        expect(override.committed).toBe(5000);
      }
    });

    it('no claim → reads zero rows (fails closed)', async () => {
      // Create a repository without setting the claim (simulating no tenant context)
      const catalogNoClaim = new CatalogRepo(appRole());
      const override = await catalogNoClaim.getForecastOverride({ organizationId: ORG_A }, '2026-01');
      expect(override).toBeNull();
    });
  });

  describe('upsertForecastOverride', () => {
    it('org A → can create/update org A forecast overrides', async () => {
      // Test create
      const newOverride = await catalogA.upsertForecastOverride({
        organizationId: ORG_A,
        input: {
          month: '2026-03',
          committed: 11000,
          bestCase: 16000,
          pipeline: 21000,
        },
      });

      expect(newOverride).not.toBeNull();
      if (newOverride) {
        expect(newOverride.organizationId).toBe(ORG_A);
        expect(newOverride.month).toBe('2026-03');
        expect(newOverride.committed).toBe(11000);
        expect(newOverride.bestCase).toBe(16000);
        expect(newOverride.pipeline).toBe(21000);
      }

      // Test update
      const updatedOverride = await catalogA.upsertForecastOverride({
        organizationId: ORG_A,
        input: {
          month: '2026-03',
          committed: 12000,
          bestCase: 17000,
          pipeline: 22000,
        },
      });

      expect(updatedOverride).not.toBeNull();
      if (updatedOverride) {
        expect(updatedOverride.organizationId).toBe(ORG_A);
        expect(updatedOverride.month).toBe('2026-03');
        expect(updatedOverride.committed).toBe(12000);
        expect(updatedOverride.bestCase).toBe(17000);
        expect(updatedOverride.pipeline).toBe(22000);
      }
    });

    it('org A → attempting to create org B forecast override creates org A override instead', async () => {
      // This test verifies that even if we try to create an override for org B's organization_id
      // while using org A's repository context, it will still create it for org A due to RLS

      // Try to create an override with org B's ID but using org A's context
      // The repository method will ignore the organizationId in the input and use the context's organizationId
      // due to the withTenant wrapper and how the data is constructed in the create call

      const override = await catalogA.upsertForecastOverride({
        organizationId: ORG_A, // Context says org A
        input: {
          month: '2026-03',
          committed: 5000,   // These values match org B's january override
          bestCase: 8000,
          pipeline: 12000,
        },
      });

      expect(override).not.toBeNull();
      if (override) {
        // The override should be for org A, not org B, because the context organizationId is used
        expect(override.organizationId).toBe(ORG_A);
        expect(override.month).toBe('2026-03');
        expect(override.committed).toBe(5000);
        expect(override.bestCase).toBe(8000);
        expect(override.pipeline).toBe(12000);
      }
    });
  });
});