import 'server-only';

import { authorize } from '@/lib/permissions/abilities';
import { forbidden, validationError } from '@/lib/errors';
import type { TenantContext } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenancy/tenant-ctx';

import {
  buildForecast,
  totalPipeline,
  totalWeightedForecast,
  type ForecastLineResult,
} from '@quotapilot/domain/rules/forecast';
import type { Opportunity } from '@quotapilot/contracts';

import { currentQuarter, monthsOfQuarter, quarterOf } from './quarters';

export interface ForecastServiceData {
  forecastLines: ForecastLineResult[];
  pipelineTotal: number;
  weightedTotal: number;
  opportunityCount: number;
  quarterTotals: {
    committed: number;
    bestCase: number;
    pipeline: number;
  };
}

/**
 * Forecast service for retrieving and computing forecast data.
 *
 * Every read goes through `withTenant`, so it runs on the transaction-bound
 * client with the request's org claim set transaction-scoped (architecture
 * §7.2). The numbers are *computed* by the pure rule modules from committed
 * pipeline — nothing here trusts a seller-entered figure, and no financial
 * field is written by AI.
 *
 * Explicit seller-entered figures live in `ForecastOverride` (one row per
 * org+month) and are read/written separately — see `saveForecastValues`.
 */
export async function getForecastData(ctx: TenantContext): Promise<ForecastServiceData> {
  if (!authorize(ctx, 'view')) {
    throw forbidden('You do not have permission to view this organization');
  }

  const opportunities = await withTenant(ctx, async (tx) => {
    const rows = await tx.dealOpportunity.findMany({
      where: { organizationId: ctx.organizationId },
      select: {
        id: true,
        organizationId: true,
        accountId: true,
        ownerId: true,
        name: true,
        stage: true,
        amount: true,
        closeDate: true,
      },
    });

    return rows.map((op): Opportunity => ({
      id: op.id,
      organizationId: op.organizationId,
      accountId: op.accountId,
      ownerId: op.ownerId,
      name: op.name,
      stage: op.stage,
      amount: op.amount,
      closeDate: op.closeDate.toISOString().slice(0, 10),
    }));
  });

  const openOpportunities = opportunities.filter((op) => op.stage !== 'lost');
  const quarterMonths = monthsOfQuarter(currentQuarter(new Date())) ?? [];
  const quarterOpportunities = openOpportunities.filter((op) =>
    quarterMonths.includes(op.closeDate.slice(0, 7)),
  );

  const quarterCommitted = totalPipeline(quarterOpportunities);

  return {
    forecastLines: buildForecast(opportunities),
    pipelineTotal: totalPipeline(opportunities),
    weightedTotal: totalWeightedForecast(opportunities),
    opportunityCount: openOpportunities.length,
    quarterTotals: {
      committed: quarterCommitted,
      // NOTE: best-case is *not* a weighted figure — the weighted number is
      // already exposed as `weightedTotal`. Explicit best-case values are
      // seller-entered overrides (`ForecastOverride.bestCase`); this computed
      // slot is retained only so existing consumers keep their shape.
      bestCase: totalWeightedForecast(quarterOpportunities),
      pipeline: quarterCommitted,
    },
  };
}

/**
 * Persist explicit committed / best-case / pipeline overrides, one row per
 * month (route-map §5 `SET_FORECAST_VALUES`).
 *
 * Enforces the same invariant as the PATCH route — `committed ≤ bestCase ≤
 * pipeline` in minor units — and writes inside a single tenant-scoped
 * transaction. This previously returned `{ success: true }` without persisting
 * anything and without checking authorization.
 */
export async function saveForecastValues(
  ctx: TenantContext,
  values: Record<string, { committed: number; bestCase: number; pipeline: number }>,
): Promise<{ success: boolean }> {
  if (!authorize(ctx, 'mutate')) {
    throw forbidden('You do not have permission to edit forecast values');
  }

  const months = Object.keys(values);
  if (months.length === 0) return { success: true };

  for (const month of months) {
    const value = values[month];

    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw validationError(`Month must be in YYYY-MM format: ${month}`);
    }

    for (const [field, amount] of Object.entries(value)) {
      if (!Number.isInteger(amount) || amount < 0) {
        throw validationError(`${field} for ${month} must be a non-negative integer (minor units)`);
      }
    }

    if (value.committed > value.bestCase) {
      throw validationError(`Committed cannot exceed best case for ${month}`);
    }
    if (value.bestCase > value.pipeline) {
      throw validationError(`Best case cannot exceed pipeline for ${month}`);
    }
  }

  await withTenant(ctx, async (tx) => {
    for (const month of months) {
      const value = values[month];

      await tx.forecastOverride.upsert({
        where: {
          organizationId_month: { organizationId: ctx.organizationId, month },
        },
        create: {
          organizationId: ctx.organizationId,
          month,
          committed: value.committed,
          bestCase: value.bestCase,
          pipeline: value.pipeline,
        },
        update: {
          committed: value.committed,
          bestCase: value.bestCase,
          pipeline: value.pipeline,
        },
      });
    }
  });

  return { success: true };
}

/**
 * Recompute forecast based on current opportunities.
 * For now this is the same as reading it — the derived figures have no cache.
 */
export async function recomputeForecast(ctx: TenantContext): Promise<ForecastServiceData> {
  return getForecastData(ctx);
}

// ---------------------------------------------------------------------------
// Overview — everything the `/forecast` landing page renders
// ---------------------------------------------------------------------------

export interface ForecastOverviewMonth {
  month: string;
  computedAmount: number;
  computedWeighted: number;
  confidence: number;
  opportunityCount: number;
  /** Explicit seller override for this month, or null when unset. */
  override: { id: string; committed: number; bestCase: number; pipeline: number } | null;
}

export interface ForecastOverview {
  quarter: string;
  months: ForecastOverviewMonth[];
  totals: {
    pipelineTotal: number;
    weightedTotal: number;
    opportunityCount: number;
    quarterCommitted: number;
    quarterWeighted: number;
    quarterOpportunities: number;
  };
  /** Quarters present in open pipeline, newest first — the drill-down links. */
  quarters: Array<{ quarter: string; committed: number; opportunityCount: number }>;
}

/**
 * One tenant-scoped read producing the whole `/forecast` page.
 *
 * `getForecastData` stays as-is for the API route; this is the page-shaped view
 * (current quarter only, with the overrides joined in and the list of quarters
 * that actually have pipeline). Computed figures come from the pure rule
 * modules; the override columns are the seller's explicit numbers and are never
 * conflated with them.
 */
export async function getForecastOverview(ctx: TenantContext): Promise<ForecastOverview> {
  if (!authorize(ctx, 'view')) {
    throw forbidden('You do not have permission to view this organization');
  }

  const { opportunities, overrides } = await withTenant(ctx, async (tx) => {
    const opportunityRows = await tx.dealOpportunity.findMany({
      where: { organizationId: ctx.organizationId },
      select: {
        id: true,
        organizationId: true,
        accountId: true,
        ownerId: true,
        name: true,
        stage: true,
        amount: true,
        closeDate: true,
      },
    });

    const overrideRows = await tx.forecastOverride.findMany({
      where: { organizationId: ctx.organizationId },
      select: { id: true, month: true, committed: true, bestCase: true, pipeline: true },
    });

    const mapped = opportunityRows.map((op): Opportunity => ({
      id: op.id,
      organizationId: op.organizationId,
      accountId: op.accountId,
      ownerId: op.ownerId,
      name: op.name,
      stage: op.stage,
      amount: op.amount,
      closeDate: op.closeDate.toISOString().slice(0, 10),
    }));

    return { opportunities: mapped, overrides: overrideRows };
  });

  const open = opportunities.filter((op) => op.stage !== 'lost');
  const lineByMonth = new Map(buildForecast(opportunities).map((line) => [line.month, line]));
  const overrideByMonth = new Map(overrides.map((row) => [row.month, row]));

  const quarter = currentQuarter(new Date());
  const quarterMonths = monthsOfQuarter(quarter) ?? [];

  const months: ForecastOverviewMonth[] = quarterMonths.map((month) => {
    const line = lineByMonth.get(month);
    const override = overrideByMonth.get(month);

    return {
      month,
      computedAmount: line?.amount ?? 0,
      computedWeighted: line?.weightedAmount ?? 0,
      confidence: line?.confidence ?? 0,
      opportunityCount: line?.opportunityCount ?? 0,
      override: override
        ? {
            id: override.id,
            committed: override.committed,
            bestCase: override.bestCase,
            pipeline: override.pipeline,
          }
        : null,
    };
  });

  const quarterOpportunities = open.filter((op) =>
    quarterMonths.includes(op.closeDate.slice(0, 7)),
  );

  const byQuarter = new Map<string, { committed: number; opportunityCount: number }>();
  for (const op of open) {
    const key = quarterOf(op.closeDate.slice(0, 7));
    if (!key) continue;

    const entry = byQuarter.get(key) ?? { committed: 0, opportunityCount: 0 };
    entry.committed += op.amount;
    entry.opportunityCount += 1;
    byQuarter.set(key, entry);
  }

  const quarters = [...byQuarter.entries()]
    .map(([key, value]) => ({ quarter: key, ...value }))
    .sort((a, b) => b.quarter.localeCompare(a.quarter));

  return {
    quarter,
    months,
    totals: {
      pipelineTotal: totalPipeline(opportunities),
      weightedTotal: totalWeightedForecast(opportunities),
      opportunityCount: open.length,
      quarterCommitted: totalPipeline(quarterOpportunities),
      quarterWeighted: totalWeightedForecast(quarterOpportunities),
      quarterOpportunities: quarterOpportunities.length,
    },
    quarters,
  };
}
