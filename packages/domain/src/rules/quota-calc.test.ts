import { describe, expect, it } from 'vitest';
import { quotaCalcOutputSchema } from '@quotapilot/contracts';
import { calculateQuotaPlan, QuotaCalcError, WEEKS_PER_MONTH } from './quota-calc';

// Realistic seller: $250k quota, $25k average deal, a 3-month cycle.
const realistic = {
  quotaAmount: 25_000_000,
  avgDealValue: 2_500_000,
  winRate: 0.3,
  opportunityConversionRate: 0.5,
  discoveryConversionRate: 0.5,
  firstMeetingConversionRate: 0.6,
  pipelineCoverageTarget: 3,
  salesCycleMonths: 3,
  currency: 'USD',
};

describe('calculateQuotaPlan', () => {
  it('computes the backward funnel for a realistic seller', () => {
    const out = calculateQuotaPlan(realistic);
    expect(out.targets).toMatchObject({
      requiredWins: 10,
      requiredQualifiedOpportunities: 34,
      requiredDiscoveryMeetings: 68,
      requiredFirstMeetings: 136,
      requiredAttempts: 227,
      requiredPipelineValue: 85_000_000,
      actualPipelineCoverage: 3.4,
    });
  });

  it('prices monthly pacing from the sales cycle (whole ÷ months, rounded up)', () => {
    const out = calculateQuotaPlan(realistic);
    expect(out.monthly).toMatchObject({
      requiredWins: 4,
      requiredQualifiedOpportunities: 12,
      requiredDiscoveryMeetings: 23,
      requiredFirstMeetings: 46,
      requiredAttempts: 76,
      requiredPipelineValue: 28_333_334,
    });
  });

  it('prices weekly pacing at whole ÷ (months × weeks/month), rounded up', () => {
    const out = calculateQuotaPlan(realistic);
    const divisor = realistic.salesCycleMonths * WEEKS_PER_MONTH;
    // Each weekly target is a whole number that covers the required fraction.
    for (const key of [
      'requiredWins',
      'requiredQualifiedOpportunities',
      'requiredDiscoveryMeetings',
      'requiredFirstMeetings',
      'requiredAttempts',
      'requiredPipelineValue',
    ] as const) {
      const paced = out.weekly[key];
      const needed = out.targets[key] / divisor;
      expect(paced).toBe(Math.ceil(needed));
      expect(Number.isInteger(paced)).toBe(true);
    }
  });

  it('collapses the funnel when every rate is 100%', () => {
    const out = calculateQuotaPlan({
      quotaAmount: 10_000,
      avgDealValue: 5_000,
      winRate: 1,
      opportunityConversionRate: 1,
      discoveryConversionRate: 1,
      firstMeetingConversionRate: 1,
      pipelineCoverageTarget: 2,
      salesCycleMonths: 6,
      currency: 'USD',
    });
    expect(out.targets.requiredWins).toBe(2);
    expect(out.targets.requiredQualifiedOpportunities).toBe(2);
    expect(out.targets.requiredDiscoveryMeetings).toBe(2);
    expect(out.targets.requiredFirstMeetings).toBe(2);
    expect(out.targets.requiredAttempts).toBe(2);
  });

  it('lets a high coverage multiple drive pipeline above the funnel floor', () => {
    const out = calculateQuotaPlan({
      quotaAmount: 10_000,
      avgDealValue: 10_000,
      winRate: 1,
      opportunityConversionRate: 1,
      discoveryConversionRate: 1,
      firstMeetingConversionRate: 1,
      pipelineCoverageTarget: 3,
      salesCycleMonths: 3,
      currency: 'USD',
    });
    expect(out.targets.requiredPipelineValue).toBe(30_000);
    expect(out.targets.actualPipelineCoverage).toBe(3);
  });

  it('keeps pipeline at the funnel value when it beats the coverage floor', () => {
    // Funnel pipeline (34 × $25k = $850k) exceeds quota × 3 ($750k).
    const out = calculateQuotaPlan(realistic);
    expect(out.targets.requiredPipelineValue).toBe(
      out.targets.requiredQualifiedOpportunities * realistic.avgDealValue,
    );
  });

  it('backs out more qualified opportunities than wins when win rate < 1', () => {
    const out = calculateQuotaPlan({
      quotaAmount: 5_000,
      avgDealValue: 10_000,
      winRate: 0.5,
      opportunityConversionRate: 1,
      discoveryConversionRate: 1,
      firstMeetingConversionRate: 1,
      pipelineCoverageTarget: 2,
      salesCycleMonths: 3,
      currency: 'USD',
    });
    expect(out.targets.requiredWins).toBe(1);
    expect(out.targets.requiredQualifiedOpportunities).toBe(2);
    expect(out.targets.requiredPipelineValue).toBe(20_000);
  });

  it('rounds required wins up for a non-divisible quota', () => {
    const out = calculateQuotaPlan({
      ...realistic,
      quotaAmount: 7_500,
      avgDealValue: 2_000,
      winRate: 1,
      opportunityConversionRate: 1,
      discoveryConversionRate: 1,
      firstMeetingConversionRate: 1,
    });
    expect(out.targets.requiredWins).toBe(4);
  });

  it('keeps pipeline as integer minor units under a fractional coverage target', () => {
    const out = calculateQuotaPlan({
      quotaAmount: 1_000,
      avgDealValue: 400,
      winRate: 1,
      opportunityConversionRate: 1,
      discoveryConversionRate: 1,
      firstMeetingConversionRate: 1,
      pipelineCoverageTarget: 2.5,
      salesCycleMonths: 3,
      currency: 'USD',
    });
    expect(out.targets.requiredPipelineValue).toBe(2_500);
    expect(Number.isInteger(out.targets.requiredPipelineValue)).toBe(true);
    expect(out.targets.actualPipelineCoverage).toBe(2.5);
  });

  it('explains an assumption beside every output key', () => {
    const out = calculateQuotaPlan(realistic);
    for (const key of [
      'requiredWins',
      'requiredQualifiedOpportunities',
      'requiredDiscoveryMeetings',
      'requiredFirstMeetings',
      'requiredAttempts',
      'requiredPipelineValue',
      'actualPipelineCoverage',
      'monthly',
      'weekly',
    ] as const) {
      const note = out.assumptions[key];
      expect(note).toBeTypeOf('string');
      expect((note ?? '').length).toBeGreaterThan(20);
    }
    expect(out.assumptions.requiredWins).toContain('10');
    expect(out.assumptions.requiredPipelineValue).toContain('$850,000.00');
    expect(out.assumptions.weekly).toContain(`${WEEKS_PER_MONTH} weeks/month`);
  });

  it('validates its own output against the contracts schema', () => {
    const out = calculateQuotaPlan(realistic);
    expect(quotaCalcOutputSchema.safeParse(out).success).toBe(true);
  });

  it('throws QuotaCalcError (VALIDATION) on invalid input', () => {
    expect(() => calculateQuotaPlan({ ...realistic, winRate: 0 })).toThrow(QuotaCalcError);
    expect(() => calculateQuotaPlan({ ...realistic, quotaAmount: 0 })).toThrow(QuotaCalcError);
    expect(() => calculateQuotaPlan({ ...realistic, currency: 'usd' })).toThrow(QuotaCalcError);
  });

  it('throws QuotaCalcError when derived counts overflow the safe integer range', () => {
    // winRate small enough that qualified-opp count leaves the safe range.
    expect(() => calculateQuotaPlan({ ...realistic, avgDealValue: 1, winRate: 1e-12 })).toThrow(
      QuotaCalcError,
    );
  });
});