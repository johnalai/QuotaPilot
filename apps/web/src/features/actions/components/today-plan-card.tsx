import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Dashboard "today" tile (top-5 tasks, route-map §3.1). Composed by
 * `(dashboard)/dashboard/page.tsx`. Phase 3 wires the real plan.
 */
export function TodayPlanCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Today&apos;s plan</CardTitle>
        <CardDescription>Priority-ordered tasks — Phase 3.</CardDescription>
      </CardHeader>
    </Card>
  );
}
