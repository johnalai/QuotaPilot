import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

/**
 * QuotaPilot · Phase 2a — demo seed (owner role).
 *
 *   pnpm db:seed   (run as the migration owner, never from app code)
 *
 * Creates one demo org with a quota plan, a handful of accounts/opportunities,
 * forecast lines, and action tasks so the MVP dashboard shows real computed
 * numbers instead of placeholders. Idempotent: re-running upserts the same
 * rows by their deterministic ids.
 *
 * Money is integer minor units. Nothing here writes a computed field —
 * weightedAmount, risk scores, and priority scores are produced by the rule
 * modules on read.
 */

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

const DEMO = {
  orgId: 'seed-demo-org-001',
  orgName: 'Acme Sales',
  slug: 'acme-sales',
  owner: { id: 'seed-owner-001', email: 'owner@acme.invalid', name: 'Acme Owner' },
  plan: {
    quotaAmount: 2_000_000, // $20,000.00
    avgDealValue: 20_000, // $200.00
    winRate: 0.3,
    opportunityConversionRate: 0.4,
    discoveryConversionRate: 0.5,
    firstMeetingConversionRate: 0.6,
    pipelineCoverageTarget: 3,
    salesCycleMonths: 6,
    quotaCurrency: 'USD',
  },
};

const ACCOUNTS = [
  {
    id: 'seed-ac-001',
    name: 'Globex Corp',
    industry: 'Manufacturing',
    segment: 'enterprise',
    stage: 'active' as const,
  },
  {
    id: 'seed-ac-002',
    name: 'Initech LLC',
    industry: 'Technology',
    segment: 'smb',
    stage: 'active' as const,
  },
  {
    id: 'seed-ac-003',
    name: 'Umbrella Group',
    industry: 'Healthcare',
    segment: 'enterprise',
    stage: 'at_risk' as const,
  },
  {
    id: 'seed-ac-004',
    name: 'Stark Industries',
    industry: 'Technology',
    segment: 'enterprise',
    stage: 'new' as const,
  },
];

const DEALS = [
  // id, accountId, name, stage, amount, closeDate
  {
    id: 'seed-dl-001',
    accountId: 'seed-ac-001',
    name: 'Globex renewal',
    stage: 'negotiation' as const,
    amount: 450_000,
    closeDate: '2026-09-28',
  },
  {
    id: 'seed-dl-002',
    accountId: 'seed-ac-002',
    name: 'Initech platform upgrade',
    stage: 'proposal' as const,
    amount: 300_000,
    closeDate: '2026-10-12',
  },
  {
    id: 'seed-dl-003',
    accountId: 'seed-ac-003',
    name: 'Umbrella contract',
    stage: 'qualified' as const,
    amount: 600_000,
    closeDate: '2026-09-20',
  },
  {
    id: 'seed-dl-004',
    accountId: 'seed-ac-004',
    name: 'Stark pilot',
    stage: 'prospecting' as const,
    amount: 150_000,
    closeDate: '2026-11-01',
  },
  {
    id: 'seed-dl-005',
    accountId: 'seed-ac-001',
    name: 'Globex add-on',
    stage: 'prospecting' as const,
    amount: 100_000,
    closeDate: '2026-11-15',
  },
];

const FORECAST = [
  { opportunityId: 'seed-dl-001', month: '2026-09', amount: 450_000, confidence: 0.7 },
  { opportunityId: 'seed-dl-002', month: '2026-10', amount: 300_000, confidence: 0.5 },
  { opportunityId: 'seed-dl-003', month: '2026-09', amount: 600_000, confidence: 0.3 },
  { opportunityId: 'seed-dl-004', month: '2026-11', amount: 150_000, confidence: 0.1 },
  { opportunityId: 'seed-dl-005', month: '2026-11', amount: 100_000, confidence: 0.1 },
];

const TASKS = [
  {
    title: 'Call Globex on renewal terms',
    kind: 'call' as const,
    opportunityId: 'seed-dl-001',
    dueDate: '2026-09-22',
  },
  {
    title: 'Demo for Initech platform upgrade',
    kind: 'demo' as const,
    opportunityId: 'seed-dl-002',
    dueDate: '2026-09-24',
  },
  {
    title: 'Review Umbrella risk flags',
    kind: 'review' as const,
    opportunityId: 'seed-dl-003',
    dueDate: '2026-09-21',
  },
  {
    title: 'Outreach: Stark pilot',
    kind: 'outreach' as const,
    opportunityId: 'seed-dl-004',
    dueDate: '2026-09-23',
  },
];

async function main() {
  const passwordHash = await hashPassword('Password123!');

  await prisma.user.upsert({
    where: { id: DEMO.owner.id },
    update: {},
    create: { ...DEMO.owner, passwordHash },
  });

  await prisma.organization.upsert({
    where: { slug: DEMO.slug },
    update: {},
    create: {
      id: DEMO.orgId,
      name: DEMO.orgName,
      slug: DEMO.slug,
      quotaCurrency: DEMO.plan.quotaCurrency,
      memberships: {
        create: { userId: DEMO.owner.id, role: 'owner', status: 'active' },
      },
    },
  });

  await prisma.quotaPlan.upsert({
    where: { organizationId: DEMO.orgId },
    update: {},
    create: {
      organizationId: DEMO.orgId,
      quotaAmount: DEMO.plan.quotaAmount,
      avgDealValue: DEMO.plan.avgDealValue,
      winRate: DEMO.plan.winRate,
      opportunityConversionRate: DEMO.plan.opportunityConversionRate,
      discoveryConversionRate: DEMO.plan.discoveryConversionRate,
      firstMeetingConversionRate: DEMO.plan.firstMeetingConversionRate,
      pipelineCoverageTarget: DEMO.plan.pipelineCoverageTarget,
      salesCycleMonths: DEMO.plan.salesCycleMonths,
      quotaCurrency: DEMO.plan.quotaCurrency as 'USD',
    },
  });

  for (const a of ACCOUNTS) {
    await prisma.customerAccount.upsert({
      where: { id: a.id },
      update: {},
      create: { organizationId: DEMO.orgId, ...a },
    });
  }

  for (const d of DEALS) {
    await prisma.dealOpportunity.upsert({
      where: { id: d.id },
      update: {},
      create: {
        organizationId: DEMO.orgId,
        ownerId: DEMO.owner.id,
        ...d,
        closeDate: new Date(d.closeDate),
      },
    });
  }

  for (const f of FORECAST) {
    await prisma.forecastLine.upsert({
      where: {
        organizationId_opportunityId_month: {
          organizationId: DEMO.orgId,
          opportunityId: f.opportunityId,
          month: f.month,
        },
      },
      update: {},
      create: {
        organizationId: DEMO.orgId,
        opportunityId: f.opportunityId,
        month: f.month,
        amount: f.amount,
        confidence: f.confidence,
      },
    });
  }

  for (const t of TASKS) {
    await prisma.actionTask.upsert({
      where: { id: `seed-task-${t.opportunityId}` },
      update: {},
      create: {
        organizationId: DEMO.orgId,
        ...t,
        id: `seed-task-${t.opportunityId}`,
        dueDate: new Date(t.dueDate),
      },
    });
  }

  console.log(
    'Seed complete: demo org',
    DEMO.orgId,
    'with',
    DEALS.length,
    'deals,',
    TASKS.length,
    'tasks.',
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
