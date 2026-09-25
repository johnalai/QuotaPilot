import Link from 'next/link';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { DealRow } from '@/lib/db/tenancy/catalog';
import { formatCurrency } from '@/lib/utils/format-currency';

export interface OpportunityListRow extends DealRow {
  /** Resolved by the page from the account list — no extra query. */
  accountName: string;
}

export interface OpportunitiesPageProps {
  opportunities: OpportunityListRow[];
}

/**
 * Pipeline table (route-map §3.4). Presentational — the page fetches through the
 * opportunities service and resolves account names from the accounts list.
 *
 * The weighted column and the risk chip need the stage-probability table and the
 * risk rules surfaced per row; they land with `rankOpportunities` in the UI.
 */
export function OpportunitiesPage({ opportunities }: OpportunitiesPageProps) {
  if (opportunities.length === 0) {
    return (
      <p className="rounded-lg border p-6 text-sm text-muted-foreground">
        No opportunities yet — add the first one above.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Account</TableHead>
          <TableHead>Stage</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Close date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {opportunities.map((opportunity) => (
          <TableRow key={opportunity.id}>
            <TableCell>
              <Link
                href={`/opportunities/${opportunity.id}`}
                className="font-medium hover:underline"
              >
                {opportunity.name}
              </Link>
            </TableCell>
            <TableCell>
              <Link href={`/accounts/${opportunity.accountId}`} className="hover:underline">
                {opportunity.accountName}
              </Link>
            </TableCell>
            <TableCell>{opportunity.stage}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCurrency(opportunity.amount)}
            </TableCell>
            <TableCell className="tabular-nums">{opportunity.closeDate}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
