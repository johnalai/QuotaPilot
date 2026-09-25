import 'server-only';

import { prisma } from '../client';
import type { PrismaClient } from '@prisma/client';

/**
 * Tenant-scoped transaction helper (architecture §7.2).
 *
 * The org claim is set transaction-scoped inside the SAME Prisma interactive
 * transaction that performs the tenant-scoped queries. This is the ONLY way
 * to scope a read/write to the caller's org:
 *   - the claim is `set_config(..., true)` ≈ SET LOCAL — it never leaks to the
 *     next pooled connection (verified by the isolation suite);
 *   - every query runs on the transaction-bound client, never the root client;
 *   - the claim is derived from the session (TenantContext), never from a
 *     query-string/body org id.
 *
 * Repositories receive a TenantContext and call `withTenant(ctx, fn)` for every
 * read or write. There is no tenant-scoped lookup method that omits the ctx.
 */
/** The transaction-bound client handed to the helpers below. */
type TenantTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

export async function withTenant<T>(
  ctx: { organizationId: string },
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('request.jwt.claims', ${JSON.stringify({ org_id: ctx.organizationId })}, true)`;
    return fn(tx);
  });
}

/**
 * Identity-scoped transaction helper — **sign-in only**.
 *
 * `withTenant` cannot help before a tenant is known: sign-in has to *discover*
 * the caller's org, so there is no org claim to set, and `membership` (which is
 * RLS-protected by the org claim) reads as zero rows. That silently produced
 * sessions with no organizationId and made every authenticated page
 * unreachable.
 *
 * `app.user_id` is the narrower second claim: the `membership_self` policy
 * exposes only rows whose `user_id` matches it, for SELECT only.
 *
 * Callers MUST set this only for an identity they have just verified
 * (i.e. after `verifyPassword`), never from a request body or query parameter.
 */
export async function withUserClaim<T>(
  userId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    return fn(tx);
  });
}
