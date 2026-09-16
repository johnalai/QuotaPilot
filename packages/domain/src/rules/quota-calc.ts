/**
 * calculateQuotaPlan — pure funnel math for the quota calculator.
 *
 * Rule module (domain-model §3): no I/O, no DB, and — explicitly for this
 * feature — no AI. The funnel runs backward from the quota:
 *
 *   attempts ─first-mtg·conv▶ first meetings ─discovery·conv▶
 *   discovery meetings ─opp·conv▶ qualified opportunities ─win·rate▶ won
 *
 * Conventions:
 * - Counts always round UP (⌈x⌉): a plan must produce *at least* this many.
 * - Pipeline value = ⌈max(quota × coverage, qualifiedOpps × avgDeal)⌉ — the
 *   coverage multiple is a floor, never less than the funnel implies.
 * - Money stays integer minor units (architecture §10); the ISO currency on
 *   the input is carried through for display only and never affects math.
 *
 * Input is validated against the contracts schema; invalid calls throw
 * `QuotaCalcError` with the repo's `VALIDATION` error code.
 */

import {
  quotaCalcInputSchema,
  type QuotaCalcInput,
  type QuotaCalcOutput,
  type QuotaCalcTargets,
} from '@quotapilot/contracts';

import { formatMinorUnits } from '../lib/money';

/** Average weeks per month used for weekly pacing (365.25 / 7 / 12 ≈ 4.345). */
export const WEEKS_PER_MONTH = 4.345;

/** Raised for malformed input or when a derived value exceeds the safe range. */
export class QuotaCalcError extends Error {
  readonly code = 'VALIDATION' as const;

  constructor(message: string) {
    super(message);
    this.name = 'QuotaCalcError';
  }
}

function assertSafeInt(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new QuotaCalcError(`${label} exceeds the safe integer range (${value})`);
  }
  return value;
}

/** ⌈count ÷ rate⌉ — the upstream stage needed to feed a downstream stage. */
function ceilDiv(count: number, rate: number): number {
  return assertSafeInt(Math.ceil(count / rate), 'stage requirement');
}

export function calculateQuotaPlan(input: QuotaCalcInput): QuotaCalcOutput {
  const parsed = quotaCalcInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new QuotaCalcError(
      `invalid quota-calculator input: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`,
    );
  }
  const i = parsed.data;

  // Backward funnel — each stage needs the next stage's count ÷ its rate.
  const requiredWins = assertSafeInt(Math.ceil(i.quotaAmount / i.avgDealValue), 'requiredWins');
  const requiredQualifiedOpportunities = ceilDiv(requiredWins, i.winRate);
  const requiredDiscoveryMeetings = ceilDiv(requiredQualifiedOpportunities, i.opportunityConversionRate);
  const requiredFirstMeetings = ceilDiv(requiredDiscoveryMeetings, i.discoveryConversionRate);
  const requiredAttempts = ceilDiv(requiredFirstMeetings, i.firstMeetingConversionRate);

  // Pipeline value: funnel value (qualified opps × deal size) vs coverage floor
  // (quota × coverage multiple) — take the more demanding of the two.
  const funnelPipeline = assertSafeInt(
    requiredQualifiedOpportunities * i.avgDealValue,
    'funnel pipeline value',
  );
  const coveragePipeline = Math.ceil(i.quotaAmount * i.pipelineCoverageTarget);
  const requiredPipelineValue = assertSafeInt(
    Math.max(funnelPipeline, coveragePipeline),
    'requiredPipelineValue',
  );
  const actualPipelineCoverage = requiredPipelineValue / i.quotaAmount;

  const targets: QuotaCalcTargets = {
    requiredWins,
    requiredQualifiedOpportunities,
    requiredDiscoveryMeetings,
    requiredFirstMeetings,
    requiredAttempts,
    requiredPipelineValue,
    actualPipelineCoverage,
  };

  const monthly = paceTargets(targets, i.salesCycleMonths, 1);
  const weekly = paceTargets(targets, i.salesCycleMonths, WEEKS_PER_MONTH);

  return {
    input: i,
    targets,
    monthly,
    weekly,
    assumptions: buildAssumptions(i, targets, monthly, weekly),
  };
}

/** Scale whole-cycle targets down to a per-period pacing target, rounded up. */
function paceTargets(targets: QuotaCalcTargets, cycleMonths: number, weeksPerMonth: number): QuotaCalcTargets {
  const periods = cycleMonths * weeksPerMonth;
  return {
    requiredWins: assertSafeInt(Math.ceil(targets.requiredWins / periods), 'paced requiredWins'),
    requiredQualifiedOpportunities: assertSafeInt(
      Math.ceil(targets.requiredQualifiedOpportunities / periods),
      'paced requiredQualifiedOpportunities',
    ),
    requiredDiscoveryMeetings: assertSafeInt(
      Math.ceil(targets.requiredDiscoveryMeetings / periods),
      'paced requiredDiscoveryMeetings',
    ),
    requiredFirstMeetings: assertSafeInt(
      Math.ceil(targets.requiredFirstMeetings / periods),
      'paced requiredFirstMeetings',
    ),
    requiredAttempts: assertSafeInt(Math.ceil(targets.requiredAttempts / periods), 'paced requiredAttempts'),
    requiredPipelineValue: assertSafeInt(
      Math.ceil(targets.requiredPipelineValue / periods),
      'paced requiredPipelineValue',
    ),
    actualPipelineCoverage: targets.actualPipelineCoverage, // a ratio — unchanged by pacing
  };
}

/** Plain-language "assumption beside every output" notes (requirement). */
function buildAssumptions(
  input: QuotaCalcInput,
  targets: QuotaCalcTargets,
  monthly: QuotaCalcTargets,
  weekly: QuotaCalcTargets,
): Record<string, string> {
  const money = (minorUnits: number) => formatMinorUnits(minorUnits, input.currency);
  const {
    quotaAmount,
    avgDealValue,
    winRate,
    opportunityConversionRate,
    discoveryConversionRate,
    firstMeetingConversionRate,
    pipelineCoverageTarget,
    salesCycleMonths,
  } = input;
  const funnelPipeline = targets.requiredQualifiedOpportunities * avgDealValue;

  return {
    requiredWins:
      `${targets.requiredWins} = ⌈${quotaAmount} quota ÷ ${avgDealValue} average deal value⌉ ` +
      `(minor units) — the closed deals needed to land the quota, rounded up.`,
    requiredQualifiedOpportunities:
      `${targets.requiredQualifiedOpportunities} = ⌈${targets.requiredWins} wins ÷ ${winRate} win rate⌉ — ` +
      `the qualified opportunities the pipeline must hold; win rate is the share of them you close.`,
    requiredDiscoveryMeetings:
      `${targets.requiredDiscoveryMeetings} = ⌈${targets.requiredQualifiedOpportunities} qualified ÷ ` +
      `${opportunityConversionRate} opportunity conversion⌉ — the discovery meetings that must reach qualification.`,
    requiredFirstMeetings:
      `${targets.requiredFirstMeetings} = ⌈${targets.requiredDiscoveryMeetings} discovery ÷ ` +
      `${discoveryConversionRate} discovery conversion⌉ — the first meetings that must become discovery meetings.`,
    requiredAttempts:
      `${targets.requiredAttempts} = ⌈${targets.requiredFirstMeetings} first meetings ÷ ` +
      `${firstMeetingConversionRate} first-meeting conversion⌉ — the outreach attempts needed to book those first meetings.`,
    requiredPipelineValue:
      `${money(targets.requiredPipelineValue)} = ⌈max(${money(quotaAmount * pipelineCoverageTarget)} ` +
      `quota × coverage, ${money(funnelPipeline)} qualified opps × avg deal)⌉ — the coverage multiple is a ` +
      `floor, so the pipeline is never smaller than the funnel implies. Integer minor units (${input.currency}).`,
    actualPipelineCoverage:
      `${targets.actualPipelineCoverage.toFixed(2)}× = pipeline value ÷ quota — the coverage your funnel ` +
      `actually produces, vs the target of ${pipelineCoverageTarget}.`,
    monthly:
      `Per-month pacing: whole-cycle targets ÷ ${salesCycleMonths} months, rounded up ` +
      `(e.g. ${monthly.requiredPipelineValue} minor units of pipeline / month).`,
    weekly:
      `Per-week pacing: whole-cycle targets ÷ ${salesCycleMonths} months × ${WEEKS_PER_MONTH} weeks/month, ` +
      `rounded up (e.g. ${weekly.requiredPipelineValue} minor units of pipeline / week).`,
  };
}