import { notFound, redirect } from 'next/navigation';

import { AccountDetailPage } from '@/features/accounts';
import { getAccount } from '@/features/accounts/service';
import { getSessionServer } from '@/lib/auth/session';
import { ApiError } from '@/lib/errors';
import type { TenantContext } from '@/lib/db/client';
import type { CustomerRow } from '@/lib/db/tenancy/catalog';

/**
 * Resolve the account, turning a scoped miss into `null`.
 *
 * Kept out of the component body so no JSX is constructed inside a try/catch —
 * React renders lazily, so a try/catch around JSX cannot catch render errors.
 */
async function loadAccount(ctx: TenantContext, accountId: string): Promise<CustomerRow | null> {
  try {
    return await getAccount(ctx, accountId);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'NOT_FOUND') return null;
    throw error;
  }
}

/**
 * `/accounts/[accountId]` — account detail (route-map §3.3).
 *
 * Server Component. `getAccount` scopes the lookup to the caller's org, so an id
 * belonging to another org renders as a 404 rather than leaking that the record
 * exists.
 */
export default async function Page({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;

  const ctx = await getSessionServer();
  if (!ctx) redirect('/login');

  const account = await loadAccount(ctx, accountId);
  if (!account) notFound();

  return <AccountDetailPage account={account} />;
}
