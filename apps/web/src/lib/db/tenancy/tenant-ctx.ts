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
export async function withTenant<T>(
  ctx: { organizationId: string },
  fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('request.jwt.claims', ${JSON.stringify({ org_id: ctx.organizationId })}, true)`;
    return fn(tx);
  });
}
