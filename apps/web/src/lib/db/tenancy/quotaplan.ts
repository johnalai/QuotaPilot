import 'server-only';

import type { QuotaPlan } from '@quotapilot/contracts';
import type { PrismaClient } from '@prisma/client';

import { withTenant } from './tenant-ctx';

export interface QuotaPlanRow {
  id: string;
  organizationId: string;
  quotaAmount: number;
  avgDealValue: number;
  winRate: number;
  opportunityConversionRate: number;
  discoveryConversionRate: number;
  firstMeetingConversionRate: number;
  pipelineCoverageTarget: number;
  salesCycleMonths: number;
  currency: string;
}

type QuotaPlanPrisma = {
  id: string;
  organizationId: string;
  quotaAmount: number;
  avgDealValue: number;
  winRate: number;
  opportunityConversionRate: number;
  discoveryConversionRate: number;
  firstMeetingConversionRate: number;
  pipelineCoverageTarget: number;
  salesCycleMonths: number;
  quotaCurrency: string;
};

function toRow(r: QuotaPlanPrisma): QuotaPlanRow {
  return {
    id: r.id,
    organizationId: r.organizationId,
    quotaAmount: r.quotaAmount,
    avgDealValue: r.avgDealValue,
    winRate: r.winRate,
    opportunityConversionRate: r.opportunityConversionRate,
    discoveryConversionRate: r.discoveryConversionRate,
    firstMeetingConversionRate: r.firstMeetingConversionRate,
    pipelineCoverageTarget: r.pipelineCoverageTarget,
    salesCycleMonths: r.salesCycleMonths,
    currency: r.quotaCurrency,
  };
}

export class QuotaPlanRepo {
  constructor(private readonly prisma: PrismaClient) {}

  /** One quota plan per org — read under the caller's tenant context. */
  async findByOrg(ctx: { organizationId: string }): Promise<QuotaPlanRow | null> {
    return withTenant(ctx, async (tx) => {
      const row = await tx.quotaPlan.findUnique({ where: { organizationId: ctx.organizationId } });
      return row ? toRow(row) : null;
    });
  }

  /** Upsert the plan. Only the owner/admin may call this (service-layer gate). */
  async upsert(
    ctx: { organizationId: string },
    input: Omit<QuotaPlan, 'organizationId'>,
  ): Promise<QuotaPlanRow> {
    return withTenant(ctx, async (tx) => {
      const row = await tx.quotaPlan.upsert({
        where: { organizationId: ctx.organizationId },
        update: {
          quotaAmount: input.quotaAmount,
          avgDealValue: input.avgDealValue,
          winRate: input.winRate,
          opportunityConversionRate: input.opportunityConversionRate,
          discoveryConversionRate: input.discoveryConversionRate,
          firstMeetingConversionRate: input.firstMeetingConversionRate,
          pipelineCoverageTarget: input.pipelineCoverageTarget,
          salesCycleMonths: input.salesCycleMonths,
          quotaCurrency: input.currency as 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD',
        },
        create: {
          organizationId: ctx.organizationId,
          quotaAmount: input.quotaAmount,
          avgDealValue: input.avgDealValue,
          winRate: input.winRate,
          opportunityConversionRate: input.opportunityConversionRate,
          discoveryConversionRate: input.discoveryConversionRate,
          firstMeetingConversionRate: input.firstMeetingConversionRate,
          pipelineCoverageTarget: input.pipelineCoverageTarget,
          salesCycleMonths: input.salesCycleMonths,
          quotaCurrency: input.currency as 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD',
        },
      });
      return toRow(row);
    });
  }
}
