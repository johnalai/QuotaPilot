/**
 * QuotaPilot · Phase 1 Slice 2 — REFERENTIAL-INTEGRITY suite (live DB).
 *
 * NOT part of `pnpm test` (same as isolation.test.ts — `src/lib/db/live/**` is
 * excluded from the root config). Run via:
 *   pnpm --filter @quotapilot/web test:isolation
 *
 * Uses the OWNER client (MIGRATION_DATABASE_URL) so rows can be created and the
 * effects of FK constraints observed directly. Runs against the real schema
 * after the Slice 2 migration is applied.
 *
 * Verifies the two directions of the approved relation design:
 *   - Invite.createdBy  … ON DELETE RESTRICT  → deleting a user who created an
 *     invite must FAIL (P2003).
 *   - Invite.organization … ON DELETE CASCADE → deleting an organization removes
 *     its invites.
 * Plus the cascade sanity check: deleting a user cascades memberships, accounts
 * and sessions (the adapter-table FKs use the same physical user_id column).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaClient } from '@prisma/client';
import type { Organization, User } from '@prisma/client';

const OWNER_URL = process.env.MIGRATION_DATABASE_URL;

if (!OWNER_URL) {
  throw new Error(
    'referential-integrity suite needs MIGRATION_DATABASE_URL (owner). Run via test:isolation.',
  );
}

let owner: PrismaClient | null = null;
let orgA: Organization | null = null; // org deleted by describe 2 (cascade test)
let plainOrg: Organization | null = null; // clean org for plainUser (never deleted)
let inviter: User | null = null; // user who creates an invite
let plainUser: User | null = null; // user with membership + account + session, no invites

function ownerRole(): PrismaClient {
  owner ??= new PrismaClient({ datasources: { db: { url: OWNER_URL } } });
  return owner;
}

beforeAll(async () => {
  const o = ownerRole();
  orgA = await o.organization.create({
    data: { name: 'RI Org A', slug: `ri-orga-${Date.now()}`, quotaCurrency: 'CAD' },
  });
  plainOrg = await o.organization.create({
    data: { name: 'RI Org Plain', slug: `ri-orgp-${Date.now()}`, quotaCurrency: 'CAD' },
  });
  inviter = await o.user.create({
    data: { email: `ri-inviter-${Date.now()}@quotapilot.invalid`, passwordHash: 'x' },
  });
  plainUser = await o.user.create({
    data: { email: `ri-plain-${Date.now()}@quotapilot.invalid`, passwordHash: 'x' },
  });
  await o.invite.create({
    data: {
      organizationId: orgA.id,
      email: `ri-target-${Date.now()}@quotapilot.invalid`,
      role: 'member',
      createdById: inviter.id,
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    },
  });
});

afterAll(async () => {
  const o = ownerRole();
  try {
    await o.invite.deleteMany({
      where: { organizationId: { in: [orgA?.id ?? '', plainOrg?.id ?? ''] } },
    });
    await o.membership.deleteMany({
      where: { organizationId: { in: [orgA?.id ?? '', plainOrg?.id ?? ''] } },
    });
    await o.user.deleteMany({ where: { id: { in: [inviter?.id ?? '', plainUser?.id ?? ''] } } });
    await o.organization.deleteMany({
      where: { id: { in: [orgA?.id ?? '', plainOrg?.id ?? ''] } },
    });
  } finally {
    await owner?.$disconnect();
  }
});

describe('deleting a user who created an invite is blocked (Invite.createdBy RESTRICT)', () => {
  it('user.delete fails with a foreign-key error (P2003)', async () => {
    const o = ownerRole();
    await expect(o.user.delete({ where: { id: inviter!.id } })).rejects.toMatchObject({
      code: 'P2003',
    });
    // Row is still there.
    const stillThere = await o.user.findUnique({ where: { id: inviter!.id } });
    expect(stillThere).not.toBeNull();
  });
});

describe('deleting an organization removes its invites (Invite.organization CASCADE)', () => {
  it('organization.delete succeeds and all its invites are gone', async () => {
    const o = ownerRole();
    await o.organization.delete({ where: { id: orgA!.id } });
    const remaining = await o.invite.count({ where: { organizationId: orgA!.id } });
    expect(remaining).toBe(0);
  });
});

describe('deleting a user cascades its tenant + adapter links (CASCADE FKs)', () => {
  it('memberships, accounts and sessions of the user are removed', async () => {
    const o = ownerRole();
    // Give plainUser the full web of relations first (in its own clean org).
    await o.membership.create({
      data: { organizationId: plainOrg!.id, userId: plainUser!.id, role: 'member' },
    });
    await o.account.create({
      data: {
        userId: plainUser!.id,
        type: 'credentials',
        provider: 'credentials',
        providerAccountId: plainUser!.id,
      },
    });
    await o.session.create({
      data: {
        sessionToken: `ri-sess-${Date.now()}`,
        userId: plainUser!.id,
        expires: new Date(Date.now() + 86_400_000),
      },
    });

    await o.user.delete({ where: { id: plainUser!.id } });

    expect(await o.membership.count({ where: { userId: plainUser!.id } })).toBe(0);
    expect(await o.account.count({ where: { userId: plainUser!.id } })).toBe(0);
    expect(await o.session.count({ where: { userId: plainUser!.id } })).toBe(0);
  });
});
