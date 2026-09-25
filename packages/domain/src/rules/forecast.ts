/**
 * forecast — roll up pipeline into a per-month forecast.
 *
 * Rule module (domain-model §3): pure, no I/O, no AI. The forecast is the
 * sum of each opportunity's committed amount bucketed by close month, weighted
 * by the stage's close probability. Nothing here trusts a seller-entered
 * forecast — the forecast is *derived* from committed pipeline.
 *
 *   forecast[month] = Σ (amount × stageWinProbability)
 *
 * The confidence of a line is the same stage probability; a forecast made
 * entirely of negotiation deals is more confident than one made of
 * prospecting deals, and that's a computed property, not a guess.
 */

import type { ForecastLine, Opportunity } from '@quotapilot/contracts';

/** Win probability by stage — must stay in sync with priority.ts. */
const STAGE_WIN_PROBABILITY: Record<Opportunity['stage'], number> = {
  prospecting: 0.1,
  qualified: 0.3,
  proposal: 0.5,
  negotiation: 0.7,
  won: 1.0,
  lost: 0.0,
};

function closeMonthOf(date: string): string {
  return date.slice(0, 7);
}

export interface ForecastLineResult {
  month: string;
  amount: number;
  weightedAmount: number;
  confidence: number;
  opportunityCount: number;
}

/** Sum committed pipeline into per-month forecast lines. */
export function buildForecast(opportunities: Opportunity[]): ForecastLineResult[] {
  const byMonth = new Map<string, { amount: number; weighted: number; count: number }>();

  for (const op of opportunities) {
    if (op.stage === 'lost') continue;
    const month = closeMonthOf(op.closeDate);
    const probability = STAGE_WIN_PROBABILITY[op.stage];
    const entry = byMonth.get(month) ?? { amount: 0, weighted: 0, count: 0 };
    entry.amount += op.amount;
    entry.weighted += op.amount * probability;
    entry.count += 1;
    byMonth.set(month, entry);
  }

  return [...byMonth.entries()]
    .map(([month, e]) => ({
      month,
      amount: e.amount,
      weightedAmount: e.weighted,
      confidence: e.amount > 0 ? e.weighted / e.amount : 0,
      opportunityCount: e.count,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** Total committed pipeline across all non-lost opportunities. */
export function totalPipeline(opportunities: Opportunity[]): number {
  return opportunities.filter((op) => op.stage !== 'lost').reduce((sum, op) => sum + op.amount, 0);
}

/** Total weighted (risk-adjusted) forecast value. */
export function totalWeightedForecast(opportunities: Opportunity[]): number {
  return opportunities
    .filter((op) => op.stage !== 'lost')
    .reduce((sum, op) => sum + op.amount * STAGE_WIN_PROBABILITY[op.stage], 0);
}

/** Total opportunity amount (pipeline) across all non-lost opportunities. */
export function totalOpportunityAmount(opportunities: Opportunity[]): number {
  return opportunities.filter((op) => op.stage !== 'lost').reduce((sum, op) => sum + op.amount, 0);
}
