import { redirect } from 'next/navigation';

import { AccountsPage, NewAccountForm } from '@/features/accounts';
import { listAccounts } from '@/features/accounts/service';
import { getSessionServer } from '@/lib/auth/session';

/**
 * `/accounts` — account list (route-map §3.3).
 *
 * Server Component: the session resolves to a TenantContext and the list comes
 * back through the accounts service, which runs every query inside `withTenant`
 * (the transaction-scoped RLS claim). No client fetch, no loading state.
 *
 * Creating an account is a Server Action bound to the form island, so the org is
 * never supplied by the browser.
 */
export default async function Page() {
  const ctx = await getSessionServer();
  if (!ctx) redirect('/login');

  const accounts = await listAccounts(ctx);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Accounts</h1>
        <p className="text-sm text-muted-foreground">
          {accounts.length} account{accounts.length === 1 ? '' : 's'} in this organization.
        </p>
      </div>

      <NewAccountForm />

      <AccountsPage accounts={accounts} />
    </div>
  );
}
