import Link from 'next/link';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CustomerRow } from '@/lib/db/tenancy/catalog';

export interface AccountsPageProps {
  accounts: CustomerRow[];
}

/**
 * Account list (route-map §3.3). Presentational — the page fetches through the
 * accounts service and hands the rows down.
 *
 * Priority sorting and the filter rail arrive with the `PrioritizeAccounts` rule;
 * the columns here are the ones the schema actually carries today.
 */
export function AccountsPage({ accounts }: AccountsPageProps) {
  if (accounts.length === 0) {
    return (
      <p className="rounded-lg border p-6 text-sm text-muted-foreground">
        No accounts yet — add the first one above.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Industry</TableHead>
          <TableHead>Segment</TableHead>
          <TableHead>Stage</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((account) => (
          <TableRow key={account.id}>
            <TableCell>
              <Link href={`/accounts/${account.id}`} className="font-medium hover:underline">
                {account.name}
              </Link>
            </TableCell>
            <TableCell>{account.industry ?? '—'}</TableCell>
            <TableCell>{account.segment ?? '—'}</TableCell>
            <TableCell>{account.stage}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
