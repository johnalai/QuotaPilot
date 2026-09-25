/**
 * QuotaPilot · onboarding service — live database behaviour.
 *
 * Covers what no unit test can: that completing onboarding actually persists,
 * that it is idempotent, and that it touches **only** the acting user.
 *
 * The service takes the session context as a parameter rather than reading it
 * from request context, which is precisely what makes this testable.
 *
 * Run via: pnpm --filter @quotapilot/web test:isolation
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { PrismaClient } from '@prisma/client';

import { completeOnboarding, skipOnboarding } from '@/features/onboarding/service';
import type { SessionContext } from '@/lib/auth/session';
import { getOnboardedAt } from '@/lib/db/users';

const OWNER_URL = process.env.MIGRATION_DATABASE_URL;

if (!OWNER_URL) {
  throw new Error(
    'isolation suite needs MIGRATION_DATABASE_URL (owner). ' +
      'Run via `pnpm --filter @quotapilot/web test:isolation`.',
  );
}

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const ORG = `onb-org-${RUN}`;
const USER_A = `onb-user-a-${RUN}`;
const USER_B = `onb-user-b-${RUN}`;

const ctxFor = (userId: string): SessionContext => ({
  userId,
  organizationId: ORG,
  role: 'owner',
});

let owner: PrismaClient | null = null;

function ownerRole(): PrismaClient {
  owner ??= new PrismaClient({ datasources: { db: { url: OWNER_URL } } });
  return owner;
}

beforeAll(async () => {
  const o = ownerRole();
  await o.$executeRaw`INSERT INTO organization (id, name, slug, quota_currency, updated_at) VALUES (${ORG}, 'Onboarding', ${ORG}, 'USD', NOW())`;
  await o.$executeRaw`INSERT INTO "user" (id, email, updated_at) VALUES (${USER_A}, ${`onb-a-${RUN}@quotapilot.invalid`}, NOW()), (${USER_B}, ${`onb-b-${RUN}@quotapilot.invalid`}, NOW())`;
});

afterAll(async () => {
  const o = ownerRole();
  await o.$executeRaw`DELETE FROM "user" WHERE id IN (${USER_A}, ${USER_B})`;
  await o.$executeRaw`DELETE FROM organization WHERE id = ${ORG}`;
  await owner?.$disconnect();
});

describe('onboarding service', () => {
  it('persists completion for the acting user', async () => {
    expect(await getOnboardedAt(USER_A)).toBeNull();

    await completeOnboarding(ctxFor(USER_A));

    expect(await getOnboardedAt(USER_A)).not.toBeNull();
  });

  it('is idempotent — re-running does not move the original timestamp', async () => {
    const first = await getOnboardedAt(USER_A);

    await completeOnboarding(ctxFor(USER_A));
    await skipOnboarding(ctxFor(USER_A));

    expect(await getOnboardedAt(USER_A)).toEqual(first);
  });

  it('touches only the acting user', async () => {
    await completeOnboarding(ctxFor(USER_A));

    expect(await getOnboardedAt(USER_A)).not.toBeNull();
    expect(await getOnboardedAt(USER_B)).toBeNull();
  });

  it('skip clears the gate too, so a user is never trapped on the wizard', async () => {
    await skipOnboarding(ctxFor(USER_B));

    expect(await getOnboardedAt(USER_B)).not.toBeNull();
  });
});
