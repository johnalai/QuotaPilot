import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Task {
  title: string;
  kind: string;
  reason: string;
}

interface Props {
  tasks: Task[];
}

const KIND_LABELS: Record<string, string> = {
  call: 'Call',
  demo: 'Demo',
  prep: 'Prep',
  review: 'Review',
  outreach: 'Outreach',
};

/**
 * Today's plan tile (route-map §3.1) — the greedy, deterministic output of
 * packages/domain/rules/plan.ts: highest-scoring live deals first, then
 * critical/high risk signals, then top-of-funnel outreach.
 */
export function TodayPlanCard({ tasks }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Today&apos;s plan</CardTitle>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks scheduled today.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {tasks.map((t, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">
                    {KIND_LABELS[t.kind] ?? t.kind} · {t.title}
                  </span>
                  <p className="text-xs text-muted-foreground">{t.reason}</p>
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
