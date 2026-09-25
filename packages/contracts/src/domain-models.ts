/**
 * Domain-model contracts (single source of truth, §10).
 *
 * Six tenant-scoped models that power the MVP dashboard. Rules and
 * validation live here; the pure arithmetic lives in `packages/domain/rules/*`.
 *
 * Money conventions (architecture §10, never negotiable):
 *   - amounts are integer minor units + an ISO-4217 currency on the plan.
 *   - `weightedAmount` is *computed* by the rules layer from amount ×
 *     stage-probability — it is never user-entered, and never present in an
 *     input schema. AI output never writes financial fields.
 *   - risk scores are likewise computed, never entered.
 *
 * Computed fields are deliberately absent from these input schemas. The
 * output shapes that carry them live alongside the rules that produce them.
 */

import { z } from 'zod';

import { iso4217Schema, minorUnitsSchema, rateSchema } from './quota-calc';

/** Shared identifiers. */
export const uuidSchema = z.string().uuid('must be a valid uuid');
export const tenantIdSchema = uuidSchema;
export const userIdSchema = uuidSchema;

/** ISO-8601 date (YYYY-MM-DD), used for close dates and task due dates. */
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

/** Account lifecycle stage — the coarse bucket the seller cares about. */
export const accountStageSchema = z.enum(['new', 'active', 'at_risk', 'churned']);
export type AccountStage = z.output<typeof accountStageSchema>;

/** Opportunity lifecycle stage, in order. */
export const opportunityStageSchema = z.enum([
  'prospecting',
  'qualified',
  'proposal',
  'negotiation',
  'won',
  'lost',
]);
export type OpportunityStage = z.output<typeof opportunityStageSchema>;

/** Forecast bucket — which month a deal is expected to close in. */
export const forecastMonthSchema = z.string().regex(/^\d{4}-\d{2}$/, 'must be YYYY-MM');
export type ForecastMonth = z.output<typeof forecastMonthSchema>;

/** Severity of a risk signal, ordered low → critical. */
export const riskSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type RiskSeverity = z.output<typeof riskSeveritySchema>;

/** Catalog of risk-signal kinds the rules layer can raise. */
export const riskSignalKindSchema = z.enum([
  'stale_opportunity',
  'pipeline_gap',
  'single_customer_concentration',
  'forecast_slippage',
  'deal_size_outlier',
  'win_rate_decline',
]);
export type RiskSignalKind = z.output<typeof riskSignalKindSchema>;

/** Action-task kinds — what the daily plan can schedule. */
export const actionTaskKindSchema = z.enum(['call', 'demo', 'prep', 'review', 'outreach']);
export type ActionTaskKind = z.output<typeof actionTaskKindSchema>;

export const actionTaskStatusSchema = z.enum(['open', 'done', 'dismissed']);
export type ActionTaskStatus = z.output<typeof actionTaskStatusSchema>;

/** One quota plan per org (§2a plan). */
export const quotaPlanSchema = z.object({
  organizationId: tenantIdSchema,
  quotaAmount: minorUnitsSchema,
  avgDealValue: minorUnitsSchema,
  winRate: rateSchema,
  opportunityConversionRate: rateSchema,
  discoveryConversionRate: rateSchema,
  firstMeetingConversionRate: rateSchema,
  pipelineCoverageTarget: z.number().finite().gt(0),
  salesCycleMonths: z.number().int().min(1).max(1200),
  currency: iso4217Schema,
});
export type QuotaPlan = z.output<typeof quotaPlanSchema>;

/** A customer account the seller owns. */
export const accountSchema = z.object({
  organizationId: tenantIdSchema,
  name: z.string().trim().min(1, 'account name is required').max(200),
  industry: z.string().trim().max(120).optional(),
  segment: z.string().trim().max(80).optional(),
  stage: accountStageSchema.default('new'),
});
export type Account = z.output<typeof accountSchema>;

/** A deal in the pipeline. Amount is the *committed* value the seller entered. */
export const opportunitySchema = z.object({
  organizationId: tenantIdSchema,
  id: uuidSchema,
  accountId: uuidSchema,
  name: z.string().trim().min(1, 'opportunity name is required').max(200),
  stage: opportunityStageSchema,
  amount: minorUnitsSchema,
  closeDate: dateSchema,
  ownerId: userIdSchema,
});
export type Opportunity = z.output<typeof opportunitySchema>;

/** Forecast line: expected close amount for an opportunity in a given month. */
export const forecastLineSchema = z.object({
  organizationId: tenantIdSchema,
  opportunityId: uuidSchema,
  month: forecastMonthSchema,
  amount: minorUnitsSchema,
  confidence: rateSchema,
});
export type ForecastLine = z.output<typeof forecastLineSchema>;

/** A risk signal raised by the rules layer about an opportunity. */
export const riskSignalSchema = z.object({
  organizationId: tenantIdSchema,
  opportunityId: uuidSchema.nullable().optional(),
  kind: riskSignalKindSchema,
  severity: riskSeveritySchema,
  message: z.string().trim().min(1).max(500),
});
export type RiskSignal = z.output<typeof riskSignalSchema>;

/** An action task produced by the daily planner. */
export const actionTaskSchema = z.object({
  organizationId: tenantIdSchema,
  title: z.string().trim().min(1, 'task title is required').max(200),
  kind: actionTaskKindSchema,
  opportunityId: uuidSchema.optional(),
  dueDate: dateSchema,
  status: actionTaskStatusSchema.default('open'),
});
export type ActionTask = z.output<typeof actionTaskSchema>;
