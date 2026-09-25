/**
 * QuotaPilot · accounts service — live read/write path with RLS enforced.
 *
 * Exercises the *service* layer end to end against a real database: zod
 * validation, `authorize`, the tenant-scoped repository write, and the scoped
 * read. The isolation suites next to this file prove RLS at the SQL level; this
 * one proves the service the app actually calls behaves.
 *
 * Run via: pnpm --filter @quotapilot/web test:isolation
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { PrismaClient } from '@prisma/client';

import { createAccount, getAccount, listAccounts } from '@/features/accounts/service';
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
const ORG_A = `acctsvc-a-${RUN}`;
const ORG_B = `acctsvc-b-${RUN}`;

const CTX_A: TenantContext = { organizationId: ORG_A, role: 'owner' };
const CTX_B: TenantContext = { organizationId: ORG_B, role: 'owner' };

let owner: PrismaClient | null = null;

function ownerRole(): PrismaClient {
  owner ??= new PrismaClient({ datasources: { db: { url: OWNER_URL } } });
  return owner;
}

beforeAll(async () => {
  const o = ownerRole();
  await o.$executeRaw`INSERT INTO organization (id, name, slug, quota_currency, updated_at) VALUES (${ORG_A}, 'Svc A', ${ORG_A}, 'USD', NOW())`;
  await o.$executeRaw`INSERT INTO organization (id, name, slug, quota_currency, updated_at) VALUES (${ORG_B}, 'Svc B', ${ORG_B}, 'USD', NOW())`;
});

afterAll(async () => {
  const o = ownerRole();
  await o.$executeRaw`DELETE FROM customer WHERE organization_id IN (${ORG_A}, ${ORG_B})`;
  await o.$executeRaw`DELETE FROM organization WHERE id IN (${ORG_A}, ${ORG_B})`;
  await owner?.$disconnect();
});

describe('accounts service', () => {
  it('creates an account inside the caller org', async () => {
    const account = await createAccount(CTX_A, {
      name: 'Alpha Industries',
      industry: 'SaaS',
      segment: 'Enterprise',
      stage: 'active',
    });

    expect(account.organizationId).toBe(ORG_A);
    expect(account.name).toBe('Alpha Industries');
    expect(account.stage).toBe('active');
  });

  it('ignores an organizationId supplied in the input (the client cannot pick the org)', async () => {
    const account = await createAccount(CTX_A, {
      name: 'Spoof Attempt',
      organizationId: ORG_B,
      stage: 'new',
    });

    expect(account.organizationId).toBe(ORG_A);
  });

  it('rejects invalid input before it reaches the database', async () => {
    await expect(createAccount(CTX_A, { name: '' })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
  });

  it('lists only the caller org rows', async () => {
    await createAccount(CTX_B, { name: 'Beta Only', stage: 'new' });

    const accountsA = await listAccounts(CTX_A);
    const names = accountsA.map((a) => a.name);

    expect(names).toContain('Alpha Industries');
    expect(names).not.toContain('Beta Only');
  });

  it('cannot read another org account by id (NOT_FOUND, not a leak)', async () => {
    const beta = await createAccount(CTX_B, { name: 'Beta Secret', stage: 'new' });

    await expect(getAccount(CTX_A, beta.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(getAccount(CTX_B, beta.id)).resolves.toMatchObject({ name: 'Beta Secret' });
  });
});
