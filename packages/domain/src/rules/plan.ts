/**
 * plan — turn ranked opportunities and risk signals into a daily action plan.
 *
 * Rule module (domain-model §3): pure, no I/O, no AI. The planner is greedy
 * and deterministic: work the highest-scoring live deals first, then address
 * the highest-severity risk signals, then fill remaining capacity with
 * outreach against the top of the funnel.
 *
 * Nothing here invents a task — every task is traceable to a concrete
 * opportunity, risk signal, or quota gap.
 */

import type { Opportunity, QuotaPlan, RiskSignal } from '@quotapilot/contracts';

import { scoreOpportunity } from './priority';
import { assessRisk } from './risk';

/** Severity ordering — higher number = more urgent. */
const SEVERITY_RANK: Record<RiskSignal['severity'], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/** How many tasks the planner will produce per day. */
const DAILY_TASK_CAP = 5;

export interface PlanInput {
  opportunities: Opportunity[];
  plan: QuotaPlan;
  today?: Date;
}

export interface PlannedTask {
  title: string;
  kind: 'call' | 'demo' | 'prep' | 'review' | 'outreach';
  opportunityId: string | null;
  reason: string;
}

/** Produce a bounded, ranked daily action plan for a specific day. */
export function buildDailyPlan(input: PlanInput): PlannedTask[] {
  const { opportunities, plan, today = new Date() } = input;
  const tasks: PlannedTask[] = [];

  // 1. Highest-scoring live deals get a touch. Won/lost are closed — skip.
  const ranked = opportunities
    .filter((op) => op.stage !== 'won' && op.stage !== 'lost')
    .map((op) => ({ op, result: scoreOpportunity({ opportunity: op, plan, today }) }))
    .sort((a, b) => b.result.score - a.result.score);

  for (const { op, result } of ranked) {
    if (tasks.length >= DAILY_TASK_CAP) break;
    const daysToClose = result.daysToClose;
    let kind: PlannedTask['kind'];
    let title: string;
    if (op.stage === 'negotiation' || op.stage === 'proposal') {
      kind = 'call';
      title = `Call on "${op.name}" — ${op.stage}, closes ${op.closeDate}`;
    } else if (op.stage === 'qualified') {
      kind = 'demo';
      title = `Demo for "${op.name}" — qualified deal, closes ${op.closeDate}`;
    } else {
      kind = 'outreach';
      title = `Reach out to "${op.name}" — ${op.stage}, closes ${op.closeDate}`;
    }
    tasks.push({
      title,
      kind,
      opportunityId: op.id,
      reason: `Priority score ${result.score.toFixed(0)} (weighted ${result.weightedAmount}, ${daysToClose >= 0 ? `${daysToClose}d to close` : `${Math.abs(daysToClose)}d past due`}).`,
    });
  }

  // 2. Risk signals — one task per critical/high signal, in severity order.
  const signals = assessRisk({ opportunities, plan, today });
  for (const signal of signals
    .filter((s) => SEVERITY_RANK[s.severity] >= 3)
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity])) {
    if (tasks.length >= DAILY_TASK_CAP) break;
    tasks.push({
      title: `Address risk: ${signal.message}`,
      kind: 'review',
      opportunityId: signal.opportunityId ?? null,
      reason: `${signal.severity} ${signal.kind} signal.`,
    });
  }

  // 3. Fill remaining capacity with top-of-funnel outreach.
  const top = ranked.filter((r) => r.op.stage === 'prospecting').slice(0, 3);
  for (const { op } of top) {
    if (tasks.length >= DAILY_TASK_CAP) break;
    tasks.push({
      title: `Outreach: "${op.name}"`,
      kind: 'outreach',
      opportunityId: op.id,
      reason: 'Top-of-funnel prospecting — keep the funnel fed.',
    });
  }

  return tasks.slice(0, DAILY_TASK_CAP);
}

/** Produce a ranked action plan for a date range (inclusive). */
export function schedulePlan(
  input: PlanInput,
  startDate: Date,
  numDays: number,
): { date: string; tasks: PlannedTask[] }[] {
  const { opportunities, plan } = input;
  const days: { date: string; tasks: PlannedTask[] }[] = [];

  for (let i = 0; i < numDays; i++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + i);
    const dayInput: PlanInput = { opportunities, plan, today: currentDate };
    const tasks = buildDailyPlan(dayInput);
    const dateString = currentDate.toISOString().slice(0, 10); // YYYY-MM-DD
    days.push({ date: dateString, tasks });
  }

  return days;
}
