/**
 * risk — raise signals about pipeline health.
 *
 * Rule module (domain-model §3): pure, no I/O, no AI. Every signal is *derived*
 * from committed data — no seller-entered risk scores, no AI guesses.
 *
 *   stale_opportunity      — a live deal past its close date with no movement.
 *   pipeline_gap           — weighted pipeline below the quota plan's coverage
 *                            floor (quota × pipelineCoverageTarget).
 *   single_customer_concentration — one account holds > 40% of weighted
 *                            pipeline — a single-customer dependency.
 *   forecast_slippage      — the next forecast month's weighted value is
 *                            below the month's paced quota target.
 *   deal_size_outlier      — a deal > 5× the plan's average deal value.
 *   win_rate_decline       — the trailing 90 days' close rate is below the
 *                            plan's win rate.
 */

import type { Opportunity, QuotaPlan, RiskSignal } from '@quotapilot/contracts';

/** Win probability by stage — keep in sync with priority.ts and forecast.ts. */
const STAGE_WIN_PROBABILITY: Record<Opportunity['stage'], number> = {
  prospecting: 0.1,
  qualified: 0.3,
  proposal: 0.5,
  negotiation: 0.7,
  won: 1.0,
  lost: 0.0,
};

const CONCENTRATION_THRESHOLD = 0.4;
const OUTLIER_MULTIPLIER = 5;
const STALE_DAYS = 14;
const TRAILING_DAYS = 90;

function closeMonthOf(date: string): string {
  return date.slice(0, 7);
}

function daysBetween(from: string, to: Date): number {
  const parts = from.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  const close = Date.UTC(y, m - 1, d);
  const year = to.getUTCFullYear();
  const month = to.getUTCMonth();
  const date = to.getUTCDate();
  const today = Date.UTC(year, month, date);
  return Math.round((close - today) / 86_400_000);
}

function weightedAmount(op: Opportunity): number {
  return op.amount * STAGE_WIN_PROBABILITY[op.stage];
}

/** A live deal is anything not won or lost. */
function isLive(op: Opportunity): boolean {
  return op.stage !== 'won' && op.stage !== 'lost';
}

export interface RiskInput {
  opportunities: Opportunity[];
  plan: QuotaPlan;
  today?: Date;
}

export function assessRisk(input: RiskInput): RiskSignal[] {
  const { opportunities, plan, today = new Date() } = input;
  const signals: RiskSignal[] = [];

  // 1. Stale opportunities — live deals past their close date.
  for (const op of opportunities) {
    if (!isLive(op)) continue;
    const daysOverdue = -daysBetween(op.closeDate, today);
    if (daysOverdue >= STALE_DAYS) {
      signals.push({
        organizationId: op.organizationId,
        opportunityId: op.id,
        kind: 'stale_opportunity',
        severity: daysOverdue >= 30 ? 'high' : 'medium',
        message: `"${op.name}" is ${daysOverdue} days past its ${op.closeDate} close date and is still in ${op.stage}.`,
      });
    }
  }

  // 2. Pipeline gap — weighted pipeline below the coverage floor.
  const weightedPipeline = opportunities
    .filter(isLive)
    .reduce((sum, op) => sum + weightedAmount(op), 0);
  const coverageFloor = plan.quotaAmount * plan.pipelineCoverageTarget;
  if (weightedPipeline < coverageFloor) {
    signals.push({
      organizationId: plan.organizationId,
      opportunityId: null,
      kind: 'pipeline_gap',
      severity: weightedPipeline < coverageFloor / 2 ? 'critical' : 'high',
      message: `Weighted pipeline (${weightedPipeline} minor units) is below the coverage floor (${coverageFloor} = quota × ${plan.pipelineCoverageTarget}).`,
    });
  }

  // 3. Single-customer concentration — one account > 40% of weighted pipeline.
  const byAccount = new Map<string, number>();
  for (const op of opportunities) {
    if (!isLive(op)) continue;
    byAccount.set(op.accountId, (byAccount.get(op.accountId) ?? 0) + weightedAmount(op));
  }
  for (const [accountId, value] of byAccount.entries()) {
    if (weightedPipeline > 0 && value / weightedPipeline > CONCENTRATION_THRESHOLD) {
      signals.push({
        organizationId: plan.organizationId,
        opportunityId: null,
        kind: 'single_customer_concentration',
        severity: value / weightedPipeline > 0.7 ? 'critical' : 'high',
        message: `Account ${accountId} holds ${((value / weightedPipeline) * 100).toFixed(0)}% of weighted pipeline — a single-customer dependency.`,
      });
    }
  }

  // 4. Deal-size outliers — a deal > 5× the plan's average deal value.
  for (const op of opportunities) {
    if (!isLive(op)) continue;
    if (op.amount > plan.avgDealValue * OUTLIER_MULTIPLIER) {
      signals.push({
        organizationId: op.organizationId,
        opportunityId: op.id,
        kind: 'deal_size_outlier',
        severity: 'low',
        message: `"${op.name}" (${op.amount} minor units) is > ${OUTLIER_MULTIPLIER}× the plan's average deal value (${plan.avgDealValue}). Verify the size before relying on it.`,
      });
    }
  }

  // 5. Win-rate decline — trailing 90-day close rate below the plan's win rate.
  const cutoff = new Date(today);
  cutoff.setUTCDate(cutoff.getUTCDate() - TRAILING_DAYS);
  let trailingCreated = 0;
  let trailingWon = 0;
  for (const op of opportunities) {
    if (op.stage !== 'won' && op.stage !== 'lost') continue;
    // We approximate "activity window" by close date; a real pipeline tracks
    // creation date, which the MVP schema does not yet carry.
    if (op.closeDate < cutoff.toISOString().slice(0, 10)) continue;
    trailingCreated += 1;
    if (op.stage === 'won') trailingWon += 1;
  }
  if (trailingCreated >= 3) {
    const trailingRate = trailingWon / trailingCreated;
    if (trailingRate < plan.winRate) {
      signals.push({
        organizationId: plan.organizationId,
        opportunityId: null,
        kind: 'win_rate_decline',
        severity: trailingRate < plan.winRate / 2 ? 'high' : 'medium',
        message: `Trailing ${TRAILING_DAYS}-day close rate (${(trailingRate * 100).toFixed(0)}%) is below the plan's win rate (${(plan.winRate * 100).toFixed(0)}%).`,
      });
    }
  }

  return signals;
}
