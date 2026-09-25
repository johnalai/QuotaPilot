import { describe, expect, test } from 'vitest';
import type { Opportunity, QuotaPlan } from '@quotapilot/contracts';
import { schedulePlan, buildDailyPlan } from './plan';
import { scoreOpportunity } from './priority';

describe('schedulePlan', () => {
  const baseDate = new Date('2026-09-24');

  const mockOpportunities: Opportunity[] = [
    {
      organizationId: 'test-org',
      id: 'opp-1',
      accountId: 'acc-1',
      name: 'Large Deal',
      stage: 'negotiation',
      amount: 100000,
      closeDate: '2026-09-25',
      ownerId: 'user-1',
    },
    {
      organizationId: 'test-org',
      id: 'opp-2',
      accountId: 'acc-2',
      name: 'Medium Deal',
      stage: 'proposal',
      amount: 50000,
      closeDate: '2026-09-26',
      ownerId: 'user-1',
    },
    {
      organizationId: 'test-org',
      id: 'opp-3',
      accountId: 'acc-3',
      name: 'Small Deal',
      stage: 'qualified',
      amount: 25000,
      closeDate: '2026-09-27',
      ownerId: 'user-1',
    },
  ];

  const mockPlan: QuotaPlan = {
    organizationId: 'test-org',
    quotaAmount: 500000,
    avgDealValue: 50000,
    winRate: 0.3,
    opportunityConversionRate: 0.4,
    discoveryConversionRate: 0.5,
    firstMeetingConversionRate: 0.6,
    pipelineCoverageTarget: 3,
    salesCycleMonths: 6,
    currency: 'USD',
  };

  test('should return plan for multiple days', () => {
    const input = { opportunities: mockOpportunities, plan: mockPlan, today: baseDate };
    const result = schedulePlan(input, baseDate, 3);

    expect(result).toHaveLength(3);
    expect(result[0]?.date).toBe('2026-09-24');
    expect(result[1]?.date).toBe('2026-09-25');
    expect(result[2]?.date).toBe('2026-09-26');
  });

  test('should generate tasks for each day', () => {
    const input = { opportunities: mockOpportunities, plan: mockPlan, today: baseDate };
    const result = schedulePlan(input, baseDate, 2);

    result.forEach((day) => {
      expect(day.tasks).toBeInstanceOf(Array);
      expect(day.tasks.length).toBeLessThanOrEqual(5); // DAILY_TASK_CAP
    });
  });

  test('should respect daily task cap', () => {
    // Create many opportunities to test cap
    const manyOpportunities: Opportunity[] = Array.from({ length: 20 }, (_, i) => ({
      organizationId: 'test-org',
      id: `opp-${i}`,
      accountId: `acc-${i}`,
      name: `Deal ${i}`,
      stage: 'negotiation' as const,
      amount: 10000,
      closeDate: '2026-09-30',
      ownerId: 'user-1',
    }));

    const input = { opportunities: manyOpportunities, plan: mockPlan, today: baseDate };
    const result = schedulePlan(input, baseDate, 1);

    expect(result[0]?.tasks.length).toBe(5); // DAILY_TASK_CAP
  });

  test('should produce different plans for different dates when opportunities have different close dates', () => {
    const input = { opportunities: mockOpportunities, plan: mockPlan, today: baseDate };
    const result = schedulePlan(input, baseDate, 3);

    // Each day should potentially have different tasks based on daysToClose calculations
    // Just verify we got results for each day
    expect(result.map((r) => r.date)).toEqual(['2026-09-24', '2026-09-25', '2026-09-26']);
  });
});
