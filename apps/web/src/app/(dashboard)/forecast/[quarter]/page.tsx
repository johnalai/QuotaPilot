import { notFound, redirect } from 'next/navigation';

import {
  buildForecast,
  totalPipeline,
  totalWeightedForecast,
} from '@quotapilot/domain/rules/forecast';
import type { Opportunity } from '@quotapilot/contracts';

import { getSessionServer } from '@/lib/auth/session';
import { withTenant } from '@/lib/db/tenancy/tenant-ctx';
import { formatCurrency } from '@/lib/utils/format-currency';

import { ForecastQuarterForm, type ForecastQuarterRow } from './forecast-quarter-form';

const QUARTER_PATTERN = /^(\d{4})-Q([1-4])$/;

/** `2026-Q1` → `['2026-01', '2026-02', '2026-03']`; null when malformed. */
function monthsOfQuarter(quarter: string): string[] | null {
  const match = QUARTER_PATTERN.exec(quarter);
  if (!match) return null;

  const [, year, quarterNumber] = match;
  const firstMonth = (Number(quarterNumber) - 1) * 3 + 1;

  return [0, 1, 2].map((offset) => `${year}-${String(firstMonth + offset).padStart(2, '0')}`);
}

function formatMonth(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * `/forecast/[quarter]` — quarter drill-down (route-map §3.5).
 *
 * Server Component: every tenant-scoped read runs inside `withTenant`, i.e. on
 * the transaction-bound client with the request's org claim set
 * transaction-scoped (architecture §7.2). The org is never taken from the URL.
 *
 * The committed/best-case/pipeline figures a seller can edit are *overrides*
 * (explicit, user-entered). The computed line is always derived from committed
 * pipeline by the pure rule modules — a derived figure is never hand-editable
 * (CLAUDE.md §3).
 */
export default async function ForecastQuarterPage({
  params,
}: {
  // Next 16: dynamic params are a Promise and must be awaited.
  params: Promise<{ quarter: string }>;
}) {
  const { quarter } = await params;
  const months = monthsOfQuarter(quarter);

  if (!months) notFound();

  const ctx = await getSessionServer();
  if (!ctx) redirect('/login');

  const { opportunities, overrides } = await withTenant(ctx, async (tx) => {
    const opportunityRows = await tx.dealOpportunity.findMany({
      where: { organizationId: ctx.organizationId },
      select: {
        id: true,
        organizationId: true,
        accountId: true,
        ownerId: true,
        name: true,
        stage: true,
        amount: true,
        closeDate: true,
      },
    });

    const overrideRows = await tx.forecastOverride.findMany({
      where: { organizationId: ctx.organizationId, month: { in: months } },
      select: { month: true, committed: true, bestCase: true, pipeline: true },
    });

    const mapped: Opportunity[] = opportunityRows.map((op) => ({
      id: op.id,
      organizationId: op.organizationId,
      accountId: op.accountId,
      ownerId: op.ownerId,
      name: op.name,
      stage: op.stage,
      amount: op.amount,
      closeDate: op.closeDate.toISOString().slice(0, 10),
    }));

    return { opportunities: mapped, overrides: overrideRows };
  });

  // Computed from committed pipeline (source of truth), then overlaid with any
  // explicit seller override for that month.
  const linesByMonth = new Map(buildForecast(opportunities).map((line) => [line.month, line]));
  const overrideByMonth = new Map(overrides.map((row) => [row.month, row]));

  const rows: ForecastQuarterRow[] = months.map((month) => {
    const line = linesByMonth.get(month);
    const override = overrideByMonth.get(month);

    return {
      month,
      label: formatMonth(month),
      computedAmount: line?.amount ?? 0,
      computedWeighted: line?.weightedAmount ?? 0,
      confidence: line?.confidence ?? 0,
      opportunityCount: line?.opportunityCount ?? 0,
      committed: override?.committed ?? 0,
      bestCase: override?.bestCase ?? 0,
      pipeline: override?.pipeline ?? 0,
      hasOverride: Boolean(override),
    };
  });

  const quarterOpportunities = opportunities.filter((op) =>
    months.includes(op.closeDate.slice(0, 7)),
  );
  const committedTotal = quarterOpportunities
    .filter((op) => op.stage !== 'lost')
    .reduce((sum, op) => sum + op.amount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Forecast — {quarter}</h1>
        <p className="text-sm text-muted-foreground">
          Edit the committed / best-case / pipeline override for each month. Computed figures come
          from open pipeline and cannot be edited directly.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <h2 className="text-sm font-medium text-muted-foreground">Committed pipeline</h2>
          <p className="text-2xl font-bold">{formatCurrency(committedTotal)}</p>
        </div>
        <div className="rounded-lg border p-4">
          <h2 className="text-sm font-medium text-muted-foreground">Weighted forecast</h2>
          <p className="text-2xl font-bold">
            {formatCurrency(totalWeightedForecast(quarterOpportunities))}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <h2 className="text-sm font-medium text-muted-foreground">Open opportunities</h2>
          <p className="text-2xl font-bold">
            {quarterOpportunities.filter((op) => op.stage !== 'lost').length}
          </p>
        </div>
      </div>

      <ForecastQuarterForm quarter={quarter} rows={rows} />

      <p className="text-sm text-muted-foreground">
        Total pipeline across all quarters: {formatCurrency(totalPipeline(opportunities))}
      </p>
    </div>
  );
}
