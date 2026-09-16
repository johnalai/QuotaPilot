import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Dashboard forecast snapshot tile (committed / best-case / pipeline +
 * risk count, route-map §3.1). Composed by `(dashboard)/dashboard/page.tsx`.
 * Phase 3 wires real numbers.
 */
export function RiskSnapshotCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Forecast &amp; risk</CardTitle>
        <CardDescription>Snapshot for the current quarter — Phase 3.</CardDescription>
      </CardHeader>
    </Card>
  );
}
