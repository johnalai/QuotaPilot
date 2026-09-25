import { formatMinorUnits } from '@quotapilot/domain/lib/money';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Props {
  quotaAmount: number;
  pipeline: number;
  weightedPipeline: number;
  coverage: number;
  attainment: number;
  currency: string;
}

/**
 * Quota progress rail (route-map §3.1) — wired to real computed numbers.
 *
 * Pipeline is the committed total; weightedPipeline is the risk-adjusted
 * value (amount × stage win probability). Attainment uses the weighted
 * value so a pipeline full of prospecting deals doesn't look like a win.
 */
export function QuotaProgressCard({
  quotaAmount,
  pipeline,
  weightedPipeline,
  coverage,
  attainment,
  currency,
}: Props) {
  const pct = (v: number) => Math.min(100, Math.max(0, Math.round(v * 100)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quota progress</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold">
              {formatMinorUnits(weightedPipeline, currency)}
            </span>
            <span className="text-sm text-muted-foreground">
              of {formatMinorUnits(quotaAmount, currency)}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${pct(attainment)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {pct(attainment)}% attained (risk-weighted) · {pct(coverage)}× coverage
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-muted/50 p-2">
            <p className="text-xs text-muted-foreground">Committed pipeline</p>
            <p className="font-medium">{formatMinorUnits(pipeline, currency)}</p>
          </div>
          <div className="rounded-lg bg-muted/50 p-2">
            <p className="text-xs text-muted-foreground">Weighted</p>
            <p className="font-medium">{formatMinorUnits(weightedPipeline, currency)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
