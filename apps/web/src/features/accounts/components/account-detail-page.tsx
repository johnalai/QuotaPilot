import type { CustomerRow } from '@/lib/db/tenancy/catalog';

export interface AccountDetailPageProps {
  account: CustomerRow;
}

/**
 * Account detail (route-map §3.3). Presentational — the page resolves the
 * account through the service, which throws NOT_FOUND for an id that belongs to
 * another org.
 */
export function AccountDetailPage({ account }: AccountDetailPageProps) {
  const fields: Array<[string, string]> = [
    ['Industry', account.industry ?? '—'],
    ['Segment', account.segment ?? '—'],
    ['Stage', account.stage],
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{account.name}</h1>

      <dl className="grid gap-4 sm:grid-cols-3">
        {fields.map(([label, value]) => (
          <div key={label} className="rounded-lg border p-4">
            <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
            <dd className="mt-1">{value}</dd>
          </div>
        ))}
      </dl>

      <p className="text-sm text-muted-foreground">
        Opportunities, health flags and next-best prep for this account land with the opportunities
        feature (route-map §3.4).
      </p>
    </div>
  );
}
