/**
 * QuotaPilot · `membership_self` — the identity claim used by sign-in.
 *
 * Sign-in has to discover the caller's org, so it cannot use the org claim:
 * `membership` is RLS-protected by `membership_isolation`, and with no claim the
 * RLS-subject app role read zero rows. That silently produced sessions with no
 * organizationId, which the route-layer guard then rejected — every
 * authenticated page was unreachable.
 *
 * The fix added a second, narrower policy (`membership_self`) plus the
 * `app.user_id` claim, set server-side only after the password verifies. This
 * suite pins the safety property that makes that acceptable:
 *
 *   - with neither claim: nothing is visible (fails closed)
 *   - with `app.user_id`: ONLY that user's own rows, across every org
 *   - with the org claim: unchanged org-scoped behaviour
 *
 * Run via: pnpm --filter @quotapilot/web test:isolation
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { PrismaClient } from '@prisma/client';

const APP_URL = process.env.APP_DATABASE_URL;
const OWNER_URL = process.env.MIGRATION_DATABASE_URL;

if (!APP_URL || !OWNER_URL) {
  throw new Error(
    'isolation suite needs APP_DATABASE_URL (app role) and MIGRATION_DATABASE_URL (owner). ' +
      'Run via `pnpm --filter @quotapilot/web test:isolation`.',
  );
}

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const ORG_A = `mclaim-a-${RUN}`;
const ORG_B = `mclaim-b-${RUN}`;
const USER_1 = `mclaim-u1-${RUN}`;
const USER_2 = `mclaim-u2-${RUN}`;
const M_1A = `mclaim-m1a-${RUN}`; // user 1 in org A
const M_1B = `mclaim-m1b-${RUN}`; // user 1 in org B
const M_2B = `mclaim-m2b-${RUN}`; // user 2 in org B — must never be visible to user 1

const orgClaim = (orgId: string) => JSON.stringify({ org_id: orgId });

let app: PrismaClient | null = null;
let owner: PrismaClient | null = null;

function appRole(): PrismaClient {
  app ??= new PrismaClient({ datasources: { db: { url: APP_URL } } });
  return app;
}

function ownerRole(): PrismaClient {
  owner ??= new PrismaClient({ datasources: { db: { url: OWNER_URL } } });
  return owner;
}

beforeAll(async () => {
  const o = ownerRole();

  await o.$executeRaw`INSERT INTO organization (id, name, slug, quota_currency, updated_at) VALUES (${ORG_A}, 'Claim A', ${ORG_A}, 'USD', NOW())`;
  await o.$executeRaw`INSERT INTO organization (id, name, slug, quota_currency, updated_at) VALUES (${ORG_B}, 'Claim B', ${ORG_B}, 'USD', NOW())`;
  await o.$executeRaw`INSERT INTO "user" (id, email, updated_at) VALUES (${USER_1}, ${`mclaim-u1-${RUN}@quotapilot.invalid`}, NOW()), (${USER_2}, ${`mclaim-u2-${RUN}@quotapilot.invalid`}, NOW())`;
  await o.$executeRaw`INSERT INTO membership (id, organization_id, user_id, role, status, updated_at) VALUES (${M_1A}, ${ORG_A}, ${USER_1}, 'owner', 'active', NOW())`;
  await o.$executeRaw`INSERT INTO membership (id, organization_id, user_id, role, status, updated_at) VALUES (${M_1B}, ${ORG_B}, ${USER_1}, 'member', 'active', NOW())`;
  await o.$executeRaw`INSERT INTO membership (id, organization_id, user_id, role, status, updated_at) VALUES (${M_2B}, ${ORG_B}, ${USER_2}, 'owner', 'active', NOW())`;
});

afterAll(async () => {
  const o = ownerRole();
  await o.$executeRaw`DELETE FROM membership WHERE id IN (${M_1A}, ${M_1B}, ${M_2B})`;
  await o.$executeRaw`DELETE FROM "user" WHERE id IN (${USER_1}, ${USER_2})`;
  await o.$executeRaw`DELETE FROM organization WHERE id IN (${ORG_A}, ${ORG_B})`;
  await app?.$disconnect();
  await owner?.$disconnect();
});

describe('membership_self (the sign-in identity claim)', () => {
  it('no claim → zero memberships visible (fails closed)', async () => {
    const rows = await appRole().$queryRaw<{ id: string }[]>`
      SELECT id FROM membership WHERE id IN (${M_1A}, ${M_1B}, ${M_2B})`;
    expect(rows).toHaveLength(0);
  });

  it('app.user_id = user 1 → only user 1 own memberships, across orgs', async () => {
    const p = appRole();
    await p.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.user_id', ${USER_1}, true)`;
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM membership WHERE id IN (${M_1A}, ${M_1B}, ${M_2B})`;
      expect(rows.map((r) => r.id).sort()).toEqual([M_1A, M_1B].sort());
    });
  });

  it('app.user_id → never exposes another user memberships', async () => {
    const p = appRole();
    await p.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.user_id', ${USER_1}, true)`;
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM membership WHERE id = ${M_2B}`;
      expect(rows).toHaveLength(0);
    });
  });

  it('the org claim still scopes by organization (unchanged behaviour)', async () => {
    const p = appRole();
    await p.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('request.jwt.claims', ${orgClaim(ORG_B)}, true)`;
      const rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM membership WHERE id IN (${M_1A}, ${M_1B}, ${M_2B})`;
      expect(rows.map((r) => r.id).sort()).toEqual([M_1B, M_2B].sort());
    });
  });

  it('the identity claim does not leak into the next pooled query', async () => {
    const p = appRole();
    await p.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.user_id', ${USER_1}, true)`;
    });

    const [after] = await p.$queryRaw<{ setting: string | null }[]>`
      SELECT current_setting('app.user_id', true) AS setting`;
    expect(after?.setting === null || after?.setting === '').toBe(true);
  });
});
