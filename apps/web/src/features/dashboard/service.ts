import 'server-only';

import { authorize } from '@/lib/permissions/abilities';
import { forbidden } from '@/lib/errors';
import type { TenantContext } from '@/lib/db/client';
import { CatalogRepo, type DealRow } from '@/lib/db/tenancy/catalog';
import { QuotaPlanRepo } from '@/lib/db/tenancy/quotaplan';
import { prisma } from '@/lib/db/client';

import { buildDailyPlan, schedulePlan, type PlannedTask } from '@quotapilot/domain/rules';
import { buildForecast, totalPipeline, totalWeightedForecast } from '@quotapilot/domain/rules';
import { rankOpportunities } from '@quotapilot/domain/rules';
import type { Opportunity } from '@quotapilot/contracts';

export interface DashboardData {
  quota: {
    quotaAmount: number;
    pipeline: number;
    weightedPipeline: number;
    coverage: number;
    currency: string;
    attainment: number;
  } | null;
  forecast: Array<{ month: string; amount: number; weightedAmount: number; confidence: number }>;
  pipelineTotal: number;
  weightedTotal: number;
  openDeals: number;
  topDeals: Array<{ id: string; name: string; stage: string; amount: number; score: number }>;
  riskCount: { low: number; medium: number; high: number; critical: number };
  todayPlan: PlannedTask[];
  multiDayPlan: Array<{ date: string; tasks: PlannedTask[] }>;
}

/**
 * Read-only dashboard aggregation (route-map §2.3).
 *
 * Every read runs under the caller's tenant context via the repository layer,
 * which sets the transaction-scoped RLS claim. The numbers are *computed* by
 * the pure rule modules from committed pipeline — nothing here trusts a
 * seller-entered figure, and no financial field is written by AI.
 */
export async function getDashboardData(ctx: TenantContext): Promise<DashboardData> {
  if (!authorize(ctx, 'view')) {
    throw forbidden('You do not have permission to view this organization');
  }

  const repos = {
    catalog: new CatalogRepo(prisma),
    quota: new QuotaPlanRepo(prisma),
  };

  const [plan, deals, , riskRows] = await Promise.all([
    repos.quota.findByOrg(ctx),
    repos.catalog.listDeals(ctx),
    repos.catalog.listForecast(ctx),
    repos.catalog.listRiskSignals(ctx),
  ]);

  // Narrow DealRow.stage to the OpportunityStage union for rule modules
  const toOpportunity = (d: DealRow): Opportunity => ({
    id: d.id,
    organizationId: d.organizationId,
    accountId: d.accountId,
    name: d.name,
    stage: d.stage as Opportunity['stage'],
    amount: d.amount,
    closeDate: d.closeDate,
    ownerId: d.ownerId,
  });

  const openDeals = deals.filter((d) => d.stage !== 'won' && d.stage !== 'lost').map(toOpportunity);
  const pipelineTotal = totalPipeline(openDeals);
  const weightedTotal = totalWeightedForecast(openDeals);

  const forecast = buildForecast(openDeals);

  const topDeals = plan
    ? rankOpportunities(openDeals, toQuotaPlan(plan))
        .slice(0, 5)
        .map((r) => ({
          id: r.opportunity.id,
          name: r.opportunity.name,
          stage: r.opportunity.stage,
          amount: r.opportunity.amount,
          score: Math.round(r.score),
        }))
    : [];

  const riskCount = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const r of riskRows) {
    riskCount[r.severity as keyof typeof riskCount] += 1;
  }

  const todayPlan = plan
    ? buildDailyPlan({ opportunities: openDeals, plan: toQuotaPlan(plan) })
    : [];

  // Generate 7-day action plan for the multi-day view
  const multiDayPlan = plan
    ? schedulePlan(
        { opportunities: openDeals, plan: toQuotaPlan(plan) },
        new Date(), // start from today
        7, // 7-day plan
      )
    : [];

  const quota = plan
    ? {
        quotaAmount: plan.quotaAmount,
        pipeline: pipelineTotal,
        weightedPipeline: weightedTotal,
        coverage: plan.quotaAmount > 0 ? pipelineTotal / plan.quotaAmount : 0,
        currency: plan.currency,
        attainment: plan.quotaAmount > 0 ? weightedTotal / plan.quotaAmount : 0,
      }
    : null;

  return {
    quota,
    forecast,
    pipelineTotal,
    weightedTotal,
    openDeals: openDeals.length,
    topDeals,
    riskCount,
    todayPlan,
    multiDayPlan,
  };
}

function toQuotaPlan(r: {
  quotaAmount: number;
  avgDealValue: number;
  winRate: number;
  opportunityConversionRate: number;
  discoveryConversionRate: number;
  firstMeetingConversionRate: number;
  pipelineCoverageTarget: number;
  salesCycleMonths: number;
  currency: string;
  organizationId: string;
}) {
  return {
    quotaAmount: r.quotaAmount,
    avgDealValue: r.avgDealValue,
    winRate: r.winRate,
    opportunityConversionRate: r.opportunityConversionRate,
    discoveryConversionRate: r.discoveryConversionRate,
    firstMeetingConversionRate: r.firstMeetingConversionRate,
    pipelineCoverageTarget: r.pipelineCoverageTarget,
    salesCycleMonths: r.salesCycleMonths,
    currency: r.currency,
    organizationId: r.organizationId,
  };
}
