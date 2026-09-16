import { describe, expect, it } from 'vitest';
import { quotaCalcInputSchema } from './quota-calc';

const validInput = {
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

describe('quotaCalcInputSchema', () => {
  it('parses a valid input', () => {
    expect(quotaCalcInputSchema.safeParse(validInput).success).toBe(true);
  });

  it('rejects zero and negative money (minor units)', () => {
    for (const field of ['quotaAmount', 'avgDealValue']) {
      expect(quotaCalcInputSchema.safeParse({ ...validInput, [field]: 0 }).success).toBe(false);
      expect(quotaCalcInputSchema.safeParse({ ...validInput, [field]: -500 }).success).toBe(false);
    }
  });

  it('rejects non-integer money', () => {
    expect(quotaCalcInputSchema.safeParse({ ...validInput, quotaAmount: 25_000.5 }).success).toBe(false);
  });

  it('rejects zero and >1 conversion rates, accepts 1', () => {
    const rateFields = [
      'winRate',
      'opportunityConversionRate',
      'discoveryConversionRate',
      'firstMeetingConversionRate',
    ] as const;
    for (const field of rateFields) {
      expect(quotaCalcInputSchema.safeParse({ ...validInput, [field]: 0 }).success).toBe(false);
      expect(quotaCalcInputSchema.safeParse({ ...validInput, [field]: 1.01 }).success).toBe(false);
      expect(quotaCalcInputSchema.safeParse({ ...validInput, [field]: 1 }).success).toBe(true);
    }
  });

  it('rejects NaN and non-finite rates', () => {
    expect(
      quotaCalcInputSchema.safeParse({ ...validInput, winRate: Number.NaN }).success,
    ).toBe(false);
    expect(
      quotaCalcInputSchema.safeParse({ ...validInput, winRate: Number.POSITIVE_INFINITY }).success,
    ).toBe(false);
    expect(
      quotaCalcInputSchema.safeParse({ ...validInput, winRate: Number.NEGATIVE_INFINITY }).success,
    ).toBe(false);
  });

  it('rejects non-positive pipeline coverage targets', () => {
    expect(quotaCalcInputSchema.safeParse({ ...validInput, pipelineCoverageTarget: 0 }).success).toBe(false);
    expect(quotaCalcInputSchema.safeParse({ ...validInput, pipelineCoverageTarget: -1 }).success).toBe(false);
  });

  it('rejects invalid sales-cycle lengths', () => {
    expect(quotaCalcInputSchema.safeParse({ ...validInput, salesCycleMonths: 0 }).success).toBe(false);
    expect(quotaCalcInputSchema.safeParse({ ...validInput, salesCycleMonths: -3 }).success).toBe(false);
    expect(quotaCalcInputSchema.safeParse({ ...validInput, salesCycleMonths: 2.5 }).success).toBe(false);
  });

  it('rejects malformed currency codes', () => {
    for (const currency of ['usd', 'US', 'US12', 'SEK2']) {
      expect(quotaCalcInputSchema.safeParse({ ...validInput, currency }).success).toBe(false);
    }
  });

  it('rejects input whose quota × coverage overflows the safe integer range', () => {
    expect(
      quotaCalcInputSchema.safeParse({
        ...validInput,
        quotaAmount: 1_000_000_000_000,
        pipelineCoverageTarget: 10_000_000,
      }).success,
    ).toBe(false);
  });

  it('rejects missing required fields', () => {
    const { pipelineCoverageTarget, ...rest } = validInput;
    expect(quotaCalcInputSchema.safeParse(rest).success).toBe(false);
  });
});