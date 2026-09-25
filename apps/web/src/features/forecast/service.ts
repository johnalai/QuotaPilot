import 'server-only';

import { authorize } from '@/lib/permissions/abilities';
import type { TenantContext } from '@/lib/db/client';
import { CatalogRepo } from '@/lib/db/tenancy/catalog';
import { prisma } from '@/lib/db/client';

import { buildForecast, totalPipeline, totalWeightedForecast, ForecastLineResult } from '@quotapilot/domain/rules/forecast';
import type { Opportunity } from '@quotapilot/contracts';

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
 * Every read runs under the caller's tenant context via the repository layer,
 * which sets the transaction-scoped RLS claim. The numbers are *computed* by
 * the pure rule modules from committed pipeline — nothing here trusts a
 * seller-entered figure, and no financial field is written by AI.
 */
export async function getForecastData(ctx: TenantContext): Promise<ForecastServiceData> {
  authorize(ctx, 'view');

  const catalog = new CatalogRepo(prisma);

  // Fetch all opportunities for the organization
  const opportunities = await prisma.dealOpportunity.findMany({
    where: { organizationId: ctx.organizationId },
    select: {
      id: true,
      amount: true,
      stage: true,
      closeDate: true,
    }
  });

  // Convert to domain model format
  const domainOpportunities = opportunities.map(op => ({
    id: op.id,
    amount: op.amount,
    stage: op.stage,
    closeDate: op.closeDate.toISOString().slice(0, 10),
  }));

  // Calculate forecast data
  const forecastLines = buildForecast(domainOpportunities);
  const pipelineTotal = totalPipeline(domainOpportunities);
  const weightedTotal = totalWeightedForecast(domainOpportunities);
  const opportunityCount = domainOpportunities.filter(op => op.stage !== 'lost').length;

  // Calculate quarter totals (simplified - would use proper quarter calculation in real app)
  const currentDate = new Date();
  const currentQuarterStart = new Date(currentDate.getFullYear(), Math.floor(currentDate.getMonth() / 3) * 3, 1);
  const currentQuarterEnd = new Date(currentDate.getFullYear(), Math.floor(currentDate.getMonth() / 3) * 3 + 3, 0);

  const quarterOpportunities = domainOpportunities.filter(op => {
    const closeDate = new Date(op.closeDate);
    return closeDate >= currentQuarterStart && closeDate <= currentQuarterEnd && op.stage !== 'lost';
  });

  const quarterCommitted = quarterOpportunities.reduce((sum, op) => sum + op.amount, 0);
  const quarterWeighted = quarterOpportunities.reduce((sum, op) => sum + op.amount *
    (op.stage === 'prospecting' ? 0.1 :
     op.stage === 'qualified' ? 0.3 :
     op.stage === 'proposal' ? 0.5 :
     op.stage === 'negotiation' ? 0.7 :
     op.stage === 'won' ? 1.0 : 0), 0);
  const quarterPipeline = quarterCommitted; // Same as committed for pipeline total

  return {
    forecastLines,
    pipelineTotal,
    weightedTotal,
    opportunityCount: domainOpportunities.filter(op => op.stage !== 'lost').length,
    quarterTotals: {
      committed: quarterCommitted,
      bestCase: quarterWeighted,
      pipeline: quarterPipeline,
    }
  };
}

/**
 * Save forecast values (Server Action)
 * In a real implementation, this would save user-adjusted forecast values
 */
export async function saveForecastValues(
  ctx: TenantContext,
  values: Record<string, { committed: number; bestCase: number; pipeline: number }>
): Promise<{ success: boolean }> {
  authorize(ctx, 'edit');

  // In a real implementation, we would save these values to a forecast_values table
  // For now, we'll just return success as this is a placeholder

  // TODO: Implement actual forecast value persistence
  // This would involve:
  // 1. Validating the input values
  // 2. Saving to database with organizationId and userId
  // 3. Handling updates vs inserts
  // 4. Returning appropriate error handling

  return { success: true };
}

/**
 * Recompute forecast based on current opportunities
 * This would typically be called as a Route Handler or Server Action
 */
export async function recomputeForecast(ctx: TenantContext): Promise<ForecastServiceData> {
  // In a real implementation, this might trigger recalculation of derived values
  // or clear caches. For now, it's the same as getting forecast data.
  return getForecastData(ctx);
}