/**
 * priority — opportunity scoring for the "what to work on now" view.
 *
 * Rule module (domain-model §3): pure, no I/O, no AI. The score is a product
 * of three *computed* factors, never user-entered:
 *
 *   score = weightedAmount × winProbability × urgency
 *
 *   weightedAmount = amount × stageProbability — the risk-weighted value of
 *     the deal, so a $100k negotiation outranks a $100k prospecting deal.
 *   winProbability — derived from the opportunity's stage, never typed in.
 *   urgency — 1 / (daysToClose + 1), so near-term deals outrank distant ones
 *     and a deal past its close date still scores (it needs attention, not
 *     abandonment).
 *
 * Money stays integer minor units throughout; the score itself is a unitless
 * ranking weight, not a financial value.
 */

import type { Opportunity } from '@quotapilot/contracts';
import type { QuotaPlan } from '@quotapilot/contracts';

/** Win probability by stage — the funnel's empirical close rate. */
const STAGE_WIN_PROBABILITY: Record<Opportunity['stage'], number> = {
  prospecting: 0.1,
  qualified: 0.3,
  proposal: 0.5,
  negotiation: 0.7,
  won: 1.0,
  lost: 0.0,
};

export interface PriorityInput {
  opportunity: Opportunity;
  plan: QuotaPlan;
  /** Reference date; defaults to today (UTC). */
  today?: Date;
}

export interface PriorityResult {
  score: number;
  weightedAmount: number;
  winProbability: number;
  urgency: number;
  daysToClose: number;
}

/** Days between two YYYY-MM-DD dates, signed (negative = past due). */
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

/**
 * Score an opportunity. `weightedAmount` and `winProbability` are computed
 * from the stage; `urgency` is computed from the close date. Nothing here
 * trusts a seller-entered score.
 */
export function scoreOpportunity(input: PriorityInput): PriorityResult {
  const { opportunity, plan, today = new Date() } = input;

  const winProbability = STAGE_WIN_PROBABILITY[opportunity.stage];
  if (winProbability === 0) {
    return {
      score: 0,
      weightedAmount: 0,
      winProbability: 0,
      urgency: 0,
      daysToClose: daysBetween(opportunity.closeDate, today),
    };
  }

  const weightedAmount = opportunity.amount * winProbability;
  const daysToClose = daysBetween(opportunity.closeDate, today);
  // urgency ∈ (0, 1]; today-closing deals score highest, distant deals taper.
  const urgency = 1 / (Math.max(daysToClose, -365) + 1);

  return {
    score: weightedAmount * urgency,
    weightedAmount,
    winProbability,
    urgency,
    daysToClose,
  };
}

/** Rank opportunities by descending score. */
export function rankOpportunities(
  opportunities: Opportunity[],
  plan: QuotaPlan,
  today?: Date,
): Array<{ opportunity: Opportunity } & PriorityResult> {
  return opportunities
    .map((op) => ({ opportunity: op, ...scoreOpportunity({ opportunity: op, plan, today }) }))
    .sort((a, b) => b.score - a.score);
}
