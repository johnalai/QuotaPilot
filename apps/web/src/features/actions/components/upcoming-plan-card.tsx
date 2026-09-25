import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DayPlan {
  date: string;
  tasks: {
    title: string;
    kind: string;
    reason: string;
  }[];
}

interface Props {
  dayPlans: DayPlan[];
}

const KIND_LABELS: Record<string, string> = {
  call: 'Call',
  demo: 'Demo',
  prep: 'Prep',
  review: 'Review',
  outreach: 'Outreach',
};

/**
 * Upcoming plan tile (route-map §3.6) — shows a multi-day action plan.
 */
export function UpcomingPlanCard({ dayPlans }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming plan</CardTitle>
      </CardHeader>
      <CardContent>
        {dayPlans.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks scheduled.</p>
        ) : (
          <div className="space-y-4">
            {dayPlans.map((dayPlan, dayIndex) => (
              <div key={dayPlan.date} className="border-t pt-4 first:border-t-0 first:pt-0">
                <h2 className="text-sm font-medium text-muted-foreground">
                  {new Date(dayPlan.date).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </h2>
                <ol className="flex flex-col gap-2 mt-2">
                  {dayPlan.tasks.map((task, taskIndex) => (
                    <li key={taskIndex} className="flex items-start gap-2 text-sm">
                      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs">
                        {taskIndex + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">
                          {KIND_LABELS[task.kind] ?? task.kind} · {task.title}
                        </span>
                        <p className="text-xs text-muted-foreground">{task.reason}</p>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
