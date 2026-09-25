import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ForecastLine {
  month: string;
  amount: number;
  weightedAmount: number;
  confidence: number;
}

interface TopDeal {
  id: string;
  name: string;
  stage: string;
  amount: number;
  score: number;
}

interface RiskCount {
  low: number;
  medium: number;
  high: number;
  critical: number;
}

interface Props {
  forecast: ForecastLine[];
  riskCount: RiskCount;
  topDeals: TopDeal[];
}

const SEVERITY_ORDER: (keyof RiskCount)[] = ['critical', 'high', 'medium', 'low'];

/**
 * Forecast & risk snapshot tile (route-map §3.1). Wired to real computed
 * numbers: the per-month forecast roll-up from packages/domain/rules/forecast
 * and the risk signals from packages/domain/rules/risk.
 */
export function RiskSnapshotCard({ forecast, riskCount, topDeals }: Props) {
  const total = forecast.reduce((s, f) => s + f.amount, 0);
  const weightedTotal = forecast.reduce((s, f) => s + f.weightedAmount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forecast &amp; risk</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Committed forecast</p>
          <p className="text-xl font-bold">{total.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">
            weighted {weightedTotal.toLocaleString()} · {forecast.length} month(s)
          </p>
        </div>

        <div>
          <p className="mb-1 text-xs text-muted-foreground">Risk signals</p>
          <div className="flex flex-wrap gap-1.5">
            {SEVERITY_ORDER.map((sev) => {
              const count = riskCount[sev];
              if (count === 0) return null;
              const color =
                sev === 'critical'
                  ? 'bg-destructive text-destructive-foreground'
                  : sev === 'high'
                    ? 'bg-orange-500 text-white'
                    : sev === 'medium'
                      ? 'bg-yellow-500 text-black'
                      : 'bg-muted text-muted-foreground';
              return (
                <span
                  key={sev}
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${color}`}
                >
                  {count} {sev}
                </span>
              );
            })}
          </div>
        </div>

        {topDeals.length > 0 && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Top deals</p>
            <ul className="flex flex-col gap-1">
              {topDeals.slice(0, 3).map((d) => (
                <li key={d.id} className="flex items-center justify-between text-sm">
                  <span className="min-w-0 truncate">
                    {d.name} · {d.stage}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {d.amount.toLocaleString()} ({d.score})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}