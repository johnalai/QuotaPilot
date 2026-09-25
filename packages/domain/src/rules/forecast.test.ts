import { describe, expect, test } from 'vitest';

import type { Opportunity } from '@quotapilot/contracts';

import { buildForecast, totalPipeline, totalWeightedForecast } from './forecast';

/**
 * Build a fully-typed Opportunity fixture. Forecast rules only read
 * `amount`, `stage`, and `closeDate`, but the contract requires the tenancy and
 * ownership fields too — so they get inert defaults here instead of being
 * omitted (which is what broke this suite's types).
 */
function opp(
  overrides: Pick<Opportunity, 'id' | 'amount' | 'closeDate' | 'stage'> & Partial<Opportunity>,
): Opportunity {
  return {
    organizationId: 'org-test',
    accountId: 'acct-test',
    ownerId: 'user-test',
    name: `Opportunity ${overrides.id}`,
    ...overrides,
  };
}

describe('forecast rules', () => {
  describe('buildForecast', () => {
    test('creates forecast with correct calculations', () => {
      const opportunities: Opportunity[] = [
        opp({ id: 'opp1', amount: 100000, closeDate: '2026-12-31', stage: 'proposal' }), // $1,000.00 in cents
        opp({ id: 'opp2', amount: 50000, closeDate: '2026-11-30', stage: 'negotiation' }), // $500.00 in cents
      ];

      const result = buildForecast(opportunities);

      // Check that we have forecasts for each month
      expect(result).toHaveLength(2); // Nov, Dec

      // November forecast (from opp2)
      const novForecast = result.find((f) => f.month === '2026-11');
      expect(novForecast).toBeDefined();
      expect(novForecast?.amount).toBe(50000); // From opp2
      expect(novForecast?.weightedAmount).toBe(35000); // 50000 * 0.7
      expect(novForecast?.confidence).toBeCloseTo(0.7);
      expect(novForecast?.opportunityCount).toBe(1);

      // December forecast (from opp1)
      const decForecast = result.find((f) => f.month === '2026-12');
      expect(decForecast).toBeDefined();
      expect(decForecast?.amount).toBe(100000); // From opp1
      expect(decForecast?.weightedAmount).toBe(50000); // 100000 * 0.5
      expect(decForecast?.confidence).toBeCloseTo(0.5);
      expect(decForecast?.opportunityCount).toBe(1);
    });

    test('handles empty opportunities', () => {
      const opportunities: Opportunity[] = [];

      const result = buildForecast(opportunities);
      expect(result).toHaveLength(0);
    });

    test('filters out lost opportunities', () => {
      const opportunities: Opportunity[] = [
        opp({ id: 'opp1', amount: 100000, closeDate: '2026-12-31', stage: 'lost' }), // Should be filtered out
        opp({ id: 'opp2', amount: 50000, closeDate: '2026-11-30', stage: 'negotiation' }),
      ];

      const result = buildForecast(opportunities);
      expect(result).toHaveLength(1); // Only nov from opp2
      expect(result[0]?.month).toBe('2026-11');
      expect(result[0]?.amount).toBe(50000);
    });
  });

  describe('totalPipeline', () => {
    test('sums pipeline amounts correctly', () => {
      const opportunities: Opportunity[] = [
        opp({ id: 'opp1', amount: 50000, closeDate: '2026-10-31', stage: 'prospecting' }),
        opp({ id: 'opp2', amount: 30000, closeDate: '2026-11-30', stage: 'qualified' }),
        opp({ id: 'opp3', amount: 20000, closeDate: '2026-12-31', stage: 'won' }),
        opp({ id: 'opp4', amount: 10000, closeDate: '2027-01-31', stage: 'lost' }), // Should be filtered out
      ];

      const result = totalPipeline(opportunities);
      expect(result).toBe(100000); // 50000 + 30000 + 20000 (lost excluded)
    });

    test('returns 0 for empty array', () => {
      const result = totalPipeline([]);
      expect(result).toBe(0);
    });
  });

  describe('totalWeightedForecast', () => {
    test('sums weighted amounts correctly', () => {
      const opportunities: Opportunity[] = [
        opp({ id: 'opp1', amount: 100000, closeDate: '2026-10-31', stage: 'prospecting' }), // 0.1 prob
        opp({ id: 'opp2', amount: 50000, closeDate: '2026-11-30', stage: 'negotiation' }), // 0.7 prob
        opp({ id: 'opp3', amount: 0, closeDate: '2026-12-31', stage: 'lost' }), // 0.0 prob, 0 amount
      ];

      const result = totalWeightedForecast(opportunities);
      // (100000 * 0.1) + (50000 * 0.7) + (0 * 0.0) = 10000 + 35000 + 0 = 45000
      expect(result).toBe(45000);
    });

    test('returns 0 for empty array', () => {
      const result = totalWeightedForecast([]);
      expect(result).toBe(0);
    });
  });
});
