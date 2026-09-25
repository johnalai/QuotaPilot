/**
 * Quota calculator — input/output contracts (single source of truth, §10).
 *
 * The funnel has four hops and is computed backward from the quota:
 *
 *   attempts ─first-meeting conv▶ first meetings ─discovery conv▶
 *   discovery meetings ─opportunity conv▶ qualified opportunities ─win rate▶ won
 *
 * The pure arithmetic lives in `packages/domain/rules/quota-calc.ts`; this
 * package owns the shapes, validation rules, and the error vocabulary that
 * forms, Server Actions, and Route Handlers share.
 */

import { z } from 'zod';

/** ISO-4217 uppercase code, the currency attached to every money value (§0). */
export const iso4217Schema = z
  .string()
  .regex(/^[A-Z]{3}$/, 'must be an ISO-4217 code like USD or EUR');

/** Money as integer minor units — never floats (architecture §10). */
export const minorUnitsSchema = z
  .number()
  .int('money must be integer minor units')
  .positive('money must be greater than zero')
  .max(Number.MAX_SAFE_INTEGER, 'money exceeds the safe integer range');

/** Conversion rates are strictly positive and can never exceed 100%. */
export const rateSchema = z
  .number()
  .finite()
  .gt(0, 'a conversion rate must be greater than 0')
  .lte(1, 'a conversion rate cannot exceed 1');

/** Pipeline coverage is a positive multiple of the quota (typically ≥ 1). */
export const coverageSchema = z.number().finite().gt(0, 'pipeline coverage must be greater than 0');

export const quotaCalcInputSchema = z
  .object({
    quotaAmount: minorUnitsSchema,
    avgDealValue: minorUnitsSchema,
    winRate: rateSchema,
    opportunityConversionRate: rateSchema,
    discoveryConversionRate: rateSchema,
    firstMeetingConversionRate: rateSchema,
    pipelineCoverageTarget: coverageSchema,
    salesCycleMonths: z
      .number()
      .int('sales-cycle length must be whole months')
      .min(1, 'sales-cycle length must be at least 1 month')
      .max(1200),
    currency: iso4217Schema,
  })
  .superRefine((input, ctx) => {
    // Keep every derived money value inside the safe-integer range. The funnel
    // product (qualifiedOpportunities × avgDealValue) is bounded by the same
    // constraint because qualifiedOpportunities ≥ wins = ⌈quota ÷ avgDeal⌉.
    if (input.quotaAmount * input.pipelineCoverageTarget > Number.MAX_SAFE_INTEGER) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pipelineCoverageTarget'],
        message: 'quotaAmount × pipelineCoverageTarget must stay within the safe integer range',
      });
    }
  });

export type QuotaCalcInput = z.output<typeof quotaCalcInputSchema>;

export const quotaCalcTargetsSchema = z.object({
  requiredWins: z.number().int().nonnegative(),
  requiredQualifiedOpportunities: z.number().int().nonnegative(),
  requiredDiscoveryMeetings: z.number().int().nonnegative(),
  requiredFirstMeetings: z.number().int().nonnegative(),
  requiredAttempts: z.number().int().nonnegative(),
  requiredPipelineValue: z.number().int().nonnegative(),
  /** requiredPipelineValue ÷ quotaAmount — how much coverage the funnel produces. */
  actualPipelineCoverage: z.number().nonnegative(),
});

export type QuotaCalcTargets = z.output<typeof quotaCalcTargetsSchema>;

export const quotaCalcOutputSchema = z.object({
  /** The validated input echoed back (currency normalized to the ISO code). */
  input: quotaCalcInputSchema,
  /** Whole-cycle requirements — counts and required pipeline. */
  targets: quotaCalcTargetsSchema,
  /** Same shape, paced over the sales cycle (⌈whole ÷ months⌉). */
  monthly: quotaCalcTargetsSchema,
  /** Same shape, paced over months × 4.345 weeks/month (⌈whole ÷ weeks⌉). */
  weekly: quotaCalcTargetsSchema,
  /** One plain-language assumption note per output key. */
  assumptions: z.record(z.string(), z.string()),
});

export type QuotaCalcOutput = z.output<typeof quotaCalcOutputSchema>;
