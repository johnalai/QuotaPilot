import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Dashboard quota progress rail (target vs booked, current period).
 * Composed by `(dashboard)/dashboard/page.tsx`. Phase 3 wires real numbers.
 */
export function QuotaProgressCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quota progress</CardTitle>
        <CardDescription>Target vs booked this period — Phase 3.</CardDescription>
      </CardHeader>
    </Card>
  );
}
