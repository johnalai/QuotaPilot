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
const RUN = Date.now().toString(36);
const ORG_A = `iso-a-${RUN}`;
const ORG_B = `iso-b-${RUN}`;
const USER = `iso-user-${RUN}`; // org_A owner + org_B owner
const USER2 = `iso-user2-${RUN}`; // org_A member (the unique (org, user) key allows
// only ONE membership per user per org, so the second org_A row needs a second user)
const userEmail = () => `iso-user-${RUN}@quotapilot.invalid`;
const user2Email = () => `iso-user2-${RUN}@quotapilot.invalid`;

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
  const m1 = `m-a1-${RUN}`; // org_A owner (USER)
  const m2 = `m-a2-${RUN}`; // org_A member (USER2)
  const m3 = `m-b1-${RUN}`; // org_B owner (USER)
  const i1 = `i-a-${RUN}`; // org_A invite
  const i2 = `i-b-${RUN}`; // org_B invite
  await o.$executeRaw`INSERT INTO organization (id, name, slug, quota_currency, updated_at) VALUES (${ORG_A}, 'Org A', ${ORG_A}, 'USD', NOW())`;
  await o.$executeRaw`INSERT INTO organization (id, name, slug, quota_currency, updated_at) VALUES (${ORG_B}, 'Org B', ${ORG_B}, 'USD', NOW())`;
  await o.$executeRaw`INSERT INTO "user" (id, email, updated_at) VALUES (${USER}, ${userEmail()}, NOW()), (${USER2}, ${user2Email()}, NOW())`;
  await o.$executeRaw`INSERT INTO membership (id, organization_id, user_id, role, updated_at) VALUES (${m1}, ${ORG_A}, ${USER}, 'owner', NOW())`;
  await o.$executeRaw`INSERT INTO membership (id, organization_id, user_id, role, updated_at) VALUES (${m2}, ${ORG_A}, ${USER2}, 'member', NOW())`;
  await o.$executeRaw`INSERT INTO membership (id, organization_id, user_id, role, updated_at) VALUES (${m3}, ${ORG_B}, ${USER}, 'owner', NOW())`;
  await o.$executeRaw`INSERT INTO invite (id, organization_id, email, role, created_by, expires_at, updated_at) VALUES (${i1}, ${ORG_A}, ${userEmail()}, 'member', ${USER}, NOW() + interval '7 days', NOW()), (${i2}, ${ORG_B}, ${userEmail()}, 'member', ${USER}, NOW() + interval '7 days', NOW())`;
});

afterAll(async () => {
  const o = ownerRole();
  // Cleanup fixtures as owner (the only role allowed).
  await o.$executeRaw`DELETE FROM invite WHERE id IN (${`i-a-${RUN}`}, ${`i-b-${RUN}`})`;
  await o.$executeRaw`DELETE FROM membership WHERE id IN (${`m-a1-${RUN}`}, ${`m-a2-${RUN}`}, ${`m-b1-${RUN}`})`;
  await o.$executeRaw`DELETE FROM "user" WHERE id IN (${USER}, ${USER2})`;
  await o.$executeRaw`DELETE FROM organization WHERE id IN (${ORG_A}, ${ORG_B})`;
  await app?.$disconnect();
  await owner?.$disconnect();
});

describe('app role identity (must be the NOBYPASSRLS non-owner)', () => {
  it('current_user is quotapilot_app with rolbypassrls = false and not a superuser', async () => {
    const p = appRole();
    const [rows] = await p.$queryRaw<{ current_user: string }[]>`
      SELECT current_user`;
    expect(rows.current_user).toBe('quotapilot_app');
    const [attrs] = await p.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(attrs.rolsuper).toBe(false);
    expect(attrs.rolbypassrls).toBe(false);
  });

  it('the app role is NOT the owner of application tables', async () => {
    const p = appRole();
    const [row] = await p.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count FROM pg_class c
      WHERE c.relkind IN ('r', 'p') AND c.relnamespace = 'public'::regnamespace
        AND c.relowner = (SELECT oid FROM pg_roles WHERE rolname = 'quotapilot_app')`;
    expect(row.count).toBe(0);
  });
});

describe('RLS backstop on membership (transaction-scoped claim, null-safe predicate)', () => {
  it('no claim → reads zero rows (fails closed)', async () => {
    const p = appRole();
    const rows = await p.$queryRaw<{ organization_id: string }[]>`
      SELECT organization_id FROM membership WHERE organization_id IN (${ORG_A}, ${ORG_B})`;
    expect(rows).toHaveLength(0);
  });

  it('claim org_A → only org_A memberships visible', async () => {
    const p = appRole();
    await p.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('request.jwt.claims', ${claim(ORG_A)}, true)`;
      const rows = await tx.$queryRaw<{ organization_id: string }[]>`
        SELECT organization_id FROM membership WHERE organization_id IN (${ORG_A}, ${ORG_B}) ORDER BY organization_id`;
      expect(rows.map((r) => r.organization_id)).toEqual([ORG_A, ORG_A]);
    });
  });

  it('claim org_A → INSERT org_B row rejected by WITH CHECK policy', async () => {
    const p = appRole();
    await expect(
      p.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT set_config('request.jwt.claims', ${claim(ORG_A)}, true)`;
        await tx.$executeRaw`INSERT INTO membership (id, organization_id, user_id, role) VALUES ('leak-m', ${ORG_B}, ${USER}, 'member')`;
      }),
    ).rejects.toThrow();
  });

  it('claim org_A → UPDATE/DELETE of org_B rows matches 0 rows', async () => {
    const p = appRole();
    await p.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('request.jwt.claims', ${claim(ORG_A)}, true)`;
      const updated =
        await tx.$executeRaw`UPDATE membership SET role = 'admin' WHERE organization_id = ${ORG_B}`;
      expect(updated).toBe(0);
      const deleted = await tx.$executeRaw`DELETE FROM membership WHERE organization_id = ${ORG_B}`;
      expect(deleted).toBe(0);
    });
  });

  it('claim org_B (positive control) → only org_B memberships visible', async () => {
    const p = appRole();
    await p.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('request.jwt.claims', ${claim(ORG_B)}, true)`;
      const rows = await tx.$queryRaw<{ organization_id: string }[]>`
        SELECT organization_id FROM membership WHERE organization_id IN (${ORG_A}, ${ORG_B}) ORDER BY organization_id`;
      expect(rows.map((r) => r.organization_id)).toEqual([ORG_B]);
    });
  });

  it('claim does not leak across transactions: next pool query reads 0 rows (null-safe)', async () => {
    const p = appRole();
    const [after] = await p.$queryRaw<{ setting: string | null }[]>`
      SELECT current_setting('request.jwt.claims', true) AS setting`;
    expect(after.setting === null || after.setting === '').toBe(true);
    const rows = await p.$queryRaw<{ organization_id: string }[]>`
      SELECT organization_id FROM membership WHERE organization_id IN (${ORG_A}, ${ORG_B})`;
    expect(rows).toHaveLength(0);
  });
});

describe('RLS backstop on invite (same null-safe predicate)', () => {
  it('claim org_A → only org_A invites visible', async () => {
    const p = appRole();
    await p.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('request.jwt.claims', ${claim(ORG_A)}, true)`;
      const rows = await tx.$queryRaw<{ organization_id: string }[]>`
        SELECT organization_id FROM invite WHERE organization_id IN (${ORG_A}, ${ORG_B}) ORDER BY organization_id`;
      expect(rows.map((r) => r.organization_id)).toEqual([ORG_A]);
    });
  });

  it('claim org_B (positive control) → only org_B invites visible', async () => {
    const p = appRole();
    await p.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('request.jwt.claims', ${claim(ORG_B)}, true)`;
      const rows = await tx.$queryRaw<{ organization_id: string }[]>`
        SELECT organization_id FROM invite WHERE organization_id IN (${ORG_A}, ${ORG_B}) ORDER BY organization_id`;
      expect(rows.map((r) => r.organization_id)).toEqual([ORG_B]);
    });
  });
});
