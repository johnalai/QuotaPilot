import 'server-only';

import type { PrismaClient } from '@prisma/client';

import { withTenant } from './tenant-ctx';

export interface CustomerRow {
  id: string;
  organizationId: string;
  name: string;
  industry: string | null;
  segment: string | null;
  stage: string;
}

export interface DealRow {
  id: string;
  organizationId: string;
  accountId: string;
  name: string;
  stage: string;
  amount: number;
  closeDate: string;
  ownerId: string;
}

export interface ForecastLineRow {
  id: string;
  organizationId: string;
  opportunityId: string;
  month: string;
  amount: number;
  confidence: number;
}

export interface RiskSignalRow {
  id: string;
  organizationId: string;
  opportunityId: string | null;
  kind: string;
  severity: string;
  message: string;
}

export interface ActionTaskRow {
  id: string;
  organizationId: string;
  title: string;
  kind: string;
  opportunityId: string | null;
  dueDate: string;
  status: string;
}

export interface ForecastOverrideRow {
  id: string;
  organizationId: string;
  month: string; // YYYY-MM
  committed: number; // in minor units
  bestCase: number; // in minor units
  pipeline: number; // in minor units
}

type CustomerAccountPrisma = {
  id: string;
  organizationId: string;
  name: string;
  industry: string | null;
  segment: string | null;
  stage: string;
  createdAt: Date;
  updatedAt: Date;
};

type DealOpportunityPrisma = {
  id: string;
  organizationId: string;
  accountId: string;
  name: string;
  stage: string;
  amount: number;
  closeDate: Date;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
};

type ForecastLinePrisma = {
  id: string;
  organizationId: string;
  opportunityId: string;
  month: string;
  amount: number;
  confidence: number;
  createdAt: Date;
};

type RiskSignalPrisma = {
  id: string;
  organizationId: string;
  opportunityId: string | null;
  kind: string;
  severity: string;
  message: string;
  createdAt: Date;
};

type ActionTaskPrisma = {
  id: string;
  organizationId: string;
  title: string;
  kind: string;
  opportunityId: string | null;
  dueDate: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type ForecastOverridePrisma = {
  id: string;
  organizationId: string;
  month: string;
  committed: number;
  bestCase: number;
  pipeline: number;
  createdAt: Date;
  updatedAt: Date;
};

function toCustomer(r: CustomerAccountPrisma): CustomerRow {
  return {
    id: r.id,
    organizationId: r.organizationId,
    name: r.name,
    industry: r.industry ?? null,
    segment: r.segment ?? null,
    stage: r.stage,
  };
}

function toDeal(r: DealOpportunityPrisma): DealRow {
  return {
    id: r.id,
    organizationId: r.organizationId,
    accountId: r.accountId,
    name: r.name,
    stage: r.stage,
    amount: r.amount,
    closeDate: r.closeDate.toISOString().slice(0, 10),
    ownerId: r.ownerId,
  };
}

function toForecast(r: ForecastLinePrisma): ForecastLineRow {
  return {
    id: r.id,
    organizationId: r.organizationId,
    opportunityId: r.opportunityId,
    month: r.month,
    amount: r.amount,
    confidence: r.confidence,
  };
}

function toRisk(r: RiskSignalPrisma): RiskSignalRow {
  return {
    id: r.id,
    organizationId: r.organizationId,
    opportunityId: r.opportunityId ?? null,
    kind: r.kind,
    severity: r.severity,
    message: r.message,
  };
}

function toTask(r: ActionTaskPrisma): ActionTaskRow {
  return {
    id: r.id,
    organizationId: r.organizationId,
    title: r.title,
    kind: r.kind,
    opportunityId: r.opportunityId ?? null,
    dueDate: r.dueDate.toISOString().slice(0, 10),
    status: r.status,
  };
}

function toForecastOverride(r: ForecastOverridePrisma): ForecastOverrideRow {
  return {
    id: r.id,
    organizationId: r.organizationId,
    month: r.month,
    committed: r.committed,
    bestCase: r.bestCase,
    pipeline: r.pipeline,
  };
}

export class CatalogRepo {
  constructor(private readonly prisma: PrismaClient) {}

  async listCustomers(ctx: { organizationId: string }): Promise<CustomerRow[]> {
    return withTenant(ctx, async (tx) =>
      (
        await tx.customerAccount.findMany({
          where: { organizationId: ctx.organizationId },
          orderBy: { name: 'asc' },
        })
      ).map(toCustomer),
    );
  }

  async getCustomer(ctx: { organizationId: string }, id: string): Promise<CustomerRow | null> {
    return withTenant(ctx, async (tx) => {
      const r = await tx.customerAccount.findFirst({
        where: { id, organizationId: ctx.organizationId },
      });
      return r ? toCustomer(r) : null;
    });
  }

  async createCustomer(
    ctx: { organizationId: string },
    input: { name: string; industry?: string; segment?: string; stage?: string },
  ): Promise<CustomerRow> {
    return withTenant(ctx, async (tx) =>
      toCustomer(
        await tx.customerAccount.create({
          data: {
            organizationId: ctx.organizationId,
            name: input.name,
            industry: input.industry,
            segment: input.segment,
            stage: (input.stage as 'new' | 'active' | 'at_risk' | 'churned') ?? 'new',
          },
        }),
      ),
    );
  }

  async listDeals(ctx: { organizationId: string }): Promise<DealRow[]> {
    return withTenant(ctx, async (tx) =>
      (
        await tx.dealOpportunity.findMany({
          where: { organizationId: ctx.organizationId },
          orderBy: { closeDate: 'asc' },
        })
      ).map(toDeal),
    );
  }

  async getDeal(ctx: { organizationId: string }, id: string): Promise<DealRow | null> {
    return withTenant(ctx, async (tx) => {
      const r = await tx.dealOpportunity.findFirst({
        where: { id, organizationId: ctx.organizationId },
      });
      return r ? toDeal(r) : null;
    });
  }

  async createDeal(
    ctx: { organizationId: string },
    input: {
      accountId: string;
      name: string;
      stage: string;
      amount: number;
      closeDate: string;
      ownerId: string;
    },
  ): Promise<DealRow> {
    return withTenant(ctx, async (tx) =>
      toDeal(
        await tx.dealOpportunity.create({
          data: {
            organizationId: ctx.organizationId,
            accountId: input.accountId,
            name: input.name,
            stage: input.stage as
              'prospecting' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost',
            amount: input.amount,
            closeDate: new Date(input.closeDate),
            ownerId: input.ownerId,
          },
        }),
      ),
    );
  }

  async listForecast(ctx: { organizationId: string }): Promise<ForecastLineRow[]> {
    return withTenant(ctx, async (tx) =>
      (
        await tx.forecastLine.findMany({
          where: { organizationId: ctx.organizationId },
          orderBy: { month: 'asc' },
        })
      ).map(toForecast),
    );
  }

  async listRiskSignals(ctx: { organizationId: string }): Promise<RiskSignalRow[]> {
    return withTenant(ctx, async (tx) =>
      (
        await tx.riskSignal.findMany({
          where: { organizationId: ctx.organizationId },
          orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        })
      ).map(toRisk),
    );
  }

  async listActionTasks(ctx: { organizationId: string }): Promise<ActionTaskRow[]> {
    return withTenant(ctx, async (tx) =>
      (
        await tx.actionTask.findMany({
          where: { organizationId: ctx.organizationId },
          orderBy: { dueDate: 'asc' },
        })
      ).map(toTask),
    );
  }

  async upsertActionTask(
    ctx: { organizationId: string },
    input: {
      id?: string;
      title: string;
      kind: string;
      opportunityId?: string | null;
      dueDate: string;
      status?: string;
    },
  ): Promise<ActionTaskRow> {
    return withTenant(ctx, async (tx) => {
      if (input.id) {
        const existing = await tx.actionTask.findFirst({
          where: { id: input.id, organizationId: ctx.organizationId },
        });
        if (existing) {
          return toTask(
            await tx.actionTask.update({
              where: { id: input.id },
              data: {
                title: input.title,
                kind: input.kind as 'call' | 'demo' | 'prep' | 'review' | 'outreach',
                opportunityId: input.opportunityId ?? null,
                dueDate: new Date(input.dueDate),
                status: (input.status as 'open' | 'done' | 'dismissed') ?? existing.status,
              },
            }),
          );
        }
      }
      return toTask(
        await tx.actionTask.create({
          data: {
            organizationId: ctx.organizationId,
            title: input.title,
            kind: input.kind as 'call' | 'demo' | 'prep' | 'review' | 'outreach',
            opportunityId: input.opportunityId ?? null,
            dueDate: new Date(input.dueDate),
            status: (input.status as 'open' | 'done' | 'dismissed') ?? 'open',
          },
        }),
      );
    });
  }

  async listForecastOverrides(ctx: { organizationId: string }): Promise<ForecastOverrideRow[]> {
    return withTenant(ctx, async (tx) =>
      (
        await tx.forecastOverride.findMany({
          where: { organizationId: ctx.organizationId },
          orderBy: { month: 'asc' },
        })
      ).map(toForecastOverride),
    );
  }

  async getForecastOverride(
    ctx: { organizationId: string },
    month: string,
  ): Promise<ForecastOverrideRow | null> {
    return withTenant(ctx, async (tx) => {
      const r = await tx.forecastOverride.findFirst({
        where: { organizationId: ctx.organizationId, month },
      });
      return r ? toForecastOverride(r) : null;
    });
  }

  async upsertForecastOverride(
    ctx: { organizationId: string },
    input: {
      month: string;
      committed: number;
      bestCase: number;
      pipeline: number;
    },
  ): Promise<ForecastOverrideRow> {
    return withTenant(ctx, async (tx) => {
      const existing = await tx.forecastOverride.findFirst({
        where: { organizationId: ctx.organizationId, month: input.month },
      });
      if (existing) {
        return toForecastOverride(
          await tx.forecastOverride.update({
            where: { id: existing.id },
            data: {
              committed: input.committed,
              bestCase: input.bestCase,
              pipeline: input.pipeline,
              updatedAt: new Date(),
            },
          }),
        );
      }
      return toForecastOverride(
        await tx.forecastOverride.create({
          data: {
            organizationId: ctx.organizationId,
            month: input.month,
            committed: input.committed,
            bestCase: input.bestCase,
            pipeline: input.pipeline,
          },
        }),
      );
    });
  }
}
