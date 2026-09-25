import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { formatMonthLabel } from '@/features/forecast/quarters';
import { getForecastOverview } from '@/features/forecast/service';
import { getSessionServer } from '@/lib/auth/session';
import { formatCurrency } from '@/lib/utils/format-currency';

import { RecomputeButton } from './recompute-button';

/**
 * `/forecast` — current-quarter overview (route-map §3.5, SRC).
 *
 * This is a Server Component: it resolves the tenant from the session and reads
 * through the forecast service, which runs every query inside `withTenant` (the
 * transaction-scoped RLS claim). Nothing is fetched from the browser, so there
 * is no loading state and no client-side cache to go stale.
 *
 * Editing lives on the drill-down at `/forecast/[quarter]`; this page links to
 * it rather than duplicating the form.
 *
 * Computed figures come from committed pipeline via the pure rule modules and
 * are never hand-editable. The committed / best-case / pipeline columns are the
 * explicit seller overrides for that month, when one exists.
 */
export default async function ForecastPage() {
  const ctx = await getSessionServer();
  if (!ctx) redirect('/login');

  const overview = await getForecastOverview(ctx);
  const { quarter, months, totals, quarters } = overview;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Forecast</h1>
          <p className="text-sm text-muted-foreground">
            Current quarter: {quarter}. Figures are computed from open pipeline; overrides are what
            the seller commits to.
          </p>
        </div>
        <RecomputeButton />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Pipeline total</CardTitle>
            <CardDescription>All open opportunities</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totals.pipelineTotal)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weighted forecast</CardTitle>
            <CardDescription>Pipeline adjusted by stage probability</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCurrency(totals.weightedTotal)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Open opportunities</CardTitle>
            <CardDescription>Active deals in pipeline</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totals.opportunityCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{quarter}</CardTitle>
            <CardDescription>Committed vs weighted</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Committed</span>
              <span>{formatCurrency(totals.quarterCommitted)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Weighted</span>
              <span>{formatCurrency(totals.quarterWeighted)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Open deals</span>
              <span>{totals.quarterOpportunities}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monthly breakdown — {quarter}</CardTitle>
          <CardDescription>
            Computed from close dates; override columns are seller-entered when set.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Computed</TableHead>
                <TableHead className="text-right">Weighted</TableHead>
                <TableHead className="text-right">Deals</TableHead>
                <TableHead className="text-right">Committed</TableHead>
                <TableHead className="text-right">Best case</TableHead>
                <TableHead className="text-right">Pipeline</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map((row) => (
                <TableRow key={row.month}>
                  <TableCell>{formatMonthLabel(row.month)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(row.computedAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(row.computedWeighted)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.opportunityCount}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.override ? formatCurrency(row.override.committed) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.override ? formatCurrency(row.override.bestCase) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.override ? formatCurrency(row.override.pipeline) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quarters with pipeline</CardTitle>
          <CardDescription>
            Open a quarter to edit its committed / best-case overrides.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {quarters.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open pipeline to forecast.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {quarters.map((q) => (
                <li key={q.quarter}>
                  <Link
                    href={`/forecast/${q.quarter}`}
                    className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-muted"
                  >
                    <span className="font-medium">{q.quarter}</span>
                    <span className="text-muted-foreground">
                      {formatCurrency(q.committed)} · {q.opportunityCount} deal
                      {q.opportunityCount === 1 ? '' : 's'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
