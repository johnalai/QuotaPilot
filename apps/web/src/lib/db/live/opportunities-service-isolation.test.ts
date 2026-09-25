/**
 * QuotaPilot · opportunities service — live read/write path with RLS enforced.
 *
 * Exercises the service the app actually calls, against a real database:
 * validation, `authorize`, the tenant-scoped write, and the scoped read.
 *
 * The account-ownership case is the important one. `deal.account_id` is a plain
 * foreign key with no tenant component, and the RLS policy only checks
 * `organization_id` — so neither layer below the service prevents attaching an
 * opportunity to *another org's* account. The service re-resolves the account
 * through the scoped repository and rejects it, and this pins that behaviour.
 *
 * Run via: pnpm --filter @quotapilot/web test:isolation
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { PrismaClient } from '@prisma/client';

import {
  createOpportunity,
  getOpportunity,
  listOpportunities,
} from '@/features/opportunities/service';
import type { TenantContext } from '@/lib/db/client';

const APP_URL = process.env.APP_DATABASE_URL;
const OWNER_URL = process.env.MIGRATION_DATABASE_URL;

if (!APP_URL || !OWNER_URL) {
  throw new Error(
    'isolation suite needs APP_DATABASE_URL (app role) and MIGRATION_DATABASE_URL (owner). ' +
      'Run via `pnpm --filter @quotapilot/web test:isolation`.',
  );
}

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const ORG_A = `oppsvc-a-${RUN}`;
const ORG_B = `oppsvc-b-${RUN}`;
const USER_A = `oppsvc-ua-${RUN}`;
const USER_B = `oppsvc-ub-${RUN}`;
const ACCT_A = `oppsvc-acct-a-${RUN}`;
const ACCT_B = `oppsvc-acct-b-${RUN}`;

const CTX_A: TenantContext = { organizationId: ORG_A, role: 'owner' };
const CTX_B: TenantContext = { organizationId: ORG_B, role: 'owner' };

let owner: PrismaClient | null = null;

function ownerRole(): PrismaClient {
  owner ??= new PrismaClient({ datasources: { db: { url: OWNER_URL } } });
  return owner;
}

beforeAll(async () => {
  const o = ownerRole();

  await o.$executeRaw`INSERT INTO organization (id, name, slug, quota_currency, updated_at) VALUES (${ORG_A}, 'Opp A', ${ORG_A}, 'USD', NOW())`;
  await o.$executeRaw`INSERT INTO organization (id, name, slug, quota_currency, updated_at) VALUES (${ORG_B}, 'Opp B', ${ORG_B}, 'USD', NOW())`;
  await o.$executeRaw`INSERT INTO "user" (id, email, updated_at) VALUES (${USER_A}, ${`oppsvc-ua-${RUN}@quotapilot.invalid`}, NOW()), (${USER_B}, ${`oppsvc-ub-${RUN}@quotapilot.invalid`}, NOW())`;
  await o.$executeRaw`INSERT INTO customer (id, organization_id, name, stage, created_at, updated_at) VALUES (${ACCT_A}, ${ORG_A}, 'Account A', 'active', NOW(), NOW())`;
  await o.$executeRaw`INSERT INTO customer (id, organization_id, name, stage, created_at, updated_at) VALUES (${ACCT_B}, ${ORG_B}, 'Account B', 'active', NOW(), NOW())`;
});

afterAll(async () => {
  const o = ownerRole();
  await o.$executeRaw`DELETE FROM deal WHERE organization_id IN (${ORG_A}, ${ORG_B})`;
  await o.$executeRaw`DELETE FROM customer WHERE organization_id IN (${ORG_A}, ${ORG_B})`;
  await o.$executeRaw`DELETE FROM "user" WHERE id IN (${USER_A}, ${USER_B})`;
  await o.$executeRaw`DELETE FROM organization WHERE id IN (${ORG_A}, ${ORG_B})`;
  await owner?.$disconnect();
});

describe('opportunities service', () => {
  it('creates an opportunity against an account in the caller org', async () => {
    const opportunity = await createOpportunity(CTX_A, {
      accountId: ACCT_A,
      name: 'Renewal — Account A',
      stage: 'proposal',
      amount: 1_250_000,
      closeDate: '2026-12-31',
      ownerId: USER_A,
    });

    expect(opportunity.organizationId).toBe(ORG_A);
    expect(opportunity.accountId).toBe(ACCT_A);
    expect(opportunity.name).toBe('Renewal — Account A');
    expect(opportunity.stage).toBe('proposal');
    expect(opportunity.amount).toBe(1_250_000);
    expect(opportunity.closeDate).toBe('2026-12-31');
  });

  it('refuses to attach an opportunity to another org account', async () => {
    await expect(
      createOpportunity(CTX_A, {
        accountId: ACCT_B, // belongs to ORG_B
        name: 'Cross-tenant attempt',
        stage: 'prospecting',
        amount: 100,
        closeDate: '2026-12-31',
        ownerId: USER_A,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('ignores an organizationId supplied in the input', async () => {
    const opportunity = await createOpportunity(CTX_A, {
      accountId: ACCT_A,
      name: 'Spoof attempt',
      stage: 'qualified',
      amount: 500,
      closeDate: '2026-12-31',
      ownerId: USER_A,
      organizationId: ORG_B,
    });

    expect(opportunity.organizationId).toBe(ORG_A);
  });

  it('rejects invalid input before it reaches the database', async () => {
    const base = {
      accountId: ACCT_A,
      stage: 'prospecting',
      closeDate: '2026-12-31',
      ownerId: USER_A,
    };

    await expect(
      createOpportunity(CTX_A, { ...base, name: '', amount: 100 }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      createOpportunity(CTX_A, { ...base, name: 'Bad stage', stage: 'not-a-stage', amount: 100 }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      createOpportunity(CTX_A, { ...base, name: 'Bad amount', amount: Number.NaN }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('lists only the caller org rows', async () => {
    await createOpportunity(CTX_B, {
      accountId: ACCT_B,
      name: 'Beta Only',
      stage: 'prospecting',
      amount: 999,
      closeDate: '2026-12-31',
      ownerId: USER_B,
    });

    const names = (await listOpportunities(CTX_A)).map((o) => o.name);

    expect(names).toContain('Renewal — Account A');
    expect(names).not.toContain('Beta Only');
  });

  it('cannot read another org opportunity by id (NOT_FOUND, not a leak)', async () => {
    const beta = await createOpportunity(CTX_B, {
      accountId: ACCT_B,
      name: 'Beta Secret',
      stage: 'prospecting',
      amount: 1234,
      closeDate: '2026-12-31',
      ownerId: USER_B,
    });

    await expect(getOpportunity(CTX_A, beta.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(getOpportunity(CTX_B, beta.id)).resolves.toMatchObject({ name: 'Beta Secret' });
  });
});
