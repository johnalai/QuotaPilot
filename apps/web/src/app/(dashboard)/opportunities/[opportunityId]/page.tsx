import { notFound, redirect } from 'next/navigation';

import { listAccounts } from '@/features/accounts/service';
import { OpportunityDetailPage } from '@/features/opportunities';
import { getOpportunity } from '@/features/opportunities/service';
import { getSessionServer } from '@/lib/auth/session';
import type { TenantContext } from '@/lib/db/client';
import type { DealRow } from '@/lib/db/tenancy/catalog';
import { ApiError } from '@/lib/errors';

/**
 * Resolve the opportunity, turning a scoped miss into `null`.
 *
 * Kept out of the component body so no JSX is constructed inside a try/catch —
 * React renders lazily, so such a catch cannot catch render errors.
 */
async function loadOpportunity(ctx: TenantContext, opportunityId: string): Promise<DealRow | null> {
  try {
    return await getOpportunity(ctx, opportunityId);
  } catch (error) {
    if (error instanceof ApiError && error.code === 'NOT_FOUND') return null;
    throw error;
  }
}

/**
 * `/opportunities/[opportunityId]` — opportunity detail (route-map §3.4).
 *
 * Server Component. The scoped lookup means another org's id renders as a 404
 * rather than confirming the row exists. The account name is resolved through
 * the accounts service, never with a direct query from the route layer.
 */
export default async function Page({ params }: { params: Promise<{ opportunityId: string }> }) {
  const { opportunityId } = await params;

  const ctx = await getSessionServer();
  if (!ctx) redirect('/login');

  const opportunity = await loadOpportunity(ctx, opportunityId);
  if (!opportunity) notFound();

  const accounts = await listAccounts(ctx);
  const accountName = accounts.find((a) => a.id === opportunity.accountId)?.name ?? null;

  return <OpportunityDetailPage opportunity={opportunity} accountName={accountName} />;
}
