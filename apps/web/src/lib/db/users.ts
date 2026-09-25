import 'server-only';

import { prisma } from './client';

/**
 * User-row access — the repository seam for the `user` table.
 *
 * `user` is deliberately NOT tenant-scoped: it carries no RLS policy (unlike
 * `membership`, `invite` and the domain tables), because a user exists *before*
 * they belong to any org — sign-in reads this table with no tenant context at
 * all. So this module does not open a `withTenant` transaction, and it must
 * never be used to reach tenant-scoped data; those go through `tenancy/*`.
 */

/**
 * Mark onboarding complete for one user.
 *
 * Idempotent by construction: the `onboarded_at IS NULL` guard means a second
 * call does not move the original completion time, and re-running never throws.
 * A `count` of 0 therefore means "already onboarded" (or an unknown id) — the
 * caller passes an id it got from the session, so neither is expected.
 */
export async function markUserOnboarded(userId: string): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, onboardedAt: null },
    data: { onboardedAt: new Date() },
  });
}

/** Read a user's onboarding state. Used by tests and the guard's projection. */
export async function getOnboardedAt(userId: string): Promise<Date | null> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardedAt: true },
  });

  return row?.onboardedAt ?? null;
}
