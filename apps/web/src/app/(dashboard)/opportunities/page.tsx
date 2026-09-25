import { redirect } from 'next/navigation';

import { listAccounts } from '@/features/accounts/service';
import { NewOpportunityForm, OpportunitiesPage } from '@/features/opportunities';
import { listOpportunities } from '@/features/opportunities/service';
import { getSessionServer } from '@/lib/auth/session';
import { formatCurrency } from '@/lib/utils/format-currency';

/**
 * `/opportunities` — pipeline table (route-map §3.4).
 *
 * Server Component: the session resolves to a TenantContext and both reads go
 * through services, which run every query inside `withTenant` (the
 * transaction-scoped RLS claim).
 *
 * The two reads are SEQUENTIAL, not `Promise.all`: each service call opens its
 * own interactive transaction, and concurrent ones can fail with P2028 — the bug
 * that 500'd the dashboard.
 */
export default async function Page() {
  const ctx = await getSessionServer();
  if (!ctx) redirect('/login');

  const opportunities = await listOpportunities(ctx);
  const accounts = await listAccounts(ctx);

  // Account names come from the accounts list the page already has — no extra
  // query, and no direct DB access from the route layer.
  const accountNameById = new Map(accounts.map((account) => [account.id, account.name]));
  const rows = opportunities.map((opportunity) => ({
    ...opportunity,
    accountName: accountNameById.get(opportunity.accountId) ?? 'Unknown account',
  }));

  const pipelineTotal = opportunities.reduce((sum, opportunity) => sum + opportunity.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Opportunities</h1>
        <p className="text-sm text-muted-foreground">
          {opportunities.length} open · {formatCurrency(pipelineTotal)} committed pipeline
        </p>
      </div>

      <NewOpportunityForm accounts={accounts.map((a) => ({ id: a.id, name: a.name }))} />

      <OpportunitiesPage opportunities={rows} />
    </div>
  );
}
