import Link from 'next/link';

import type { DealRow } from '@/lib/db/tenancy/catalog';
import { formatCurrency } from '@/lib/utils/format-currency';

export interface OpportunityDetailPageProps {
  opportunity: DealRow;
  /** Resolved by the page; null when the account row is not visible. */
  accountName: string | null;
}

/**
 * Opportunity detail (route-map §3.4). Presentational — the page resolves the
 * opportunity through the scoped service, which raises NOT_FOUND for an id that
 * belongs to another org.
 *
 * Revenue notes, risk signals and forecast placement are user-entered or
 * rule-derived, and land with those features. No AI-written financial fields.
 */
export function OpportunityDetailPage({ opportunity, accountName }: OpportunityDetailPageProps) {
  const fields: Array<[string, string]> = [
    ['Stage', opportunity.stage],
    ['Amount', formatCurrency(opportunity.amount)],
    ['Close date', opportunity.closeDate],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">{opportunity.name}</h1>
        {accountName && (
          <p className="text-sm text-muted-foreground">
            Account:{' '}
            <Link href={`/accounts/${opportunity.accountId}`} className="hover:underline">
              {accountName}
            </Link>
          </p>
        )}
      </div>

      <dl className="grid gap-4 sm:grid-cols-3">
        {fields.map(([label, value]) => (
          <div key={label} className="rounded-lg border p-4">
            <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
            <dd className="mt-1 tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="text-sm text-muted-foreground">
        Risk signals, revenue notes and forecast placement land with those features (route-map
        §3.4). Money stays in integer minor units and is never written by AI.
      </p>
    </div>
  );
}
