import { describe, expect, test, beforeEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { CatalogRepo } from './catalog';

// Mock server-only to prevent errors in test environment.
// The factory must RETURN the module shape — `() => {}` returns void, which
// does not satisfy vitest's MockFactory type.
vi.mock('server-only', () => ({}));

// Mock withTenant.
// `vi.mock` factories are hoisted above every top-level declaration, so the mock
// must be created with `vi.hoisted` — referencing a plain top-level `const` in
// the factory throws "Cannot access '...' before initialization" at collect time.
const { mockWithTenant } = vi.hoisted(() => ({ mockWithTenant: vi.fn() }));
vi.mock('./tenant-ctx', () => ({
  withTenant: mockWithTenant,
}));

// Mock PrismaClient
const mockPrisma = {
  customerAccount: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  dealOpportunity: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  forecastLine: {
    findMany: vi.fn(),
  },
  riskSignal: {
    findMany: vi.fn(),
  },
  actionTask: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  forecastOverride: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

describe('CatalogRepo - Tenancy Isolation', () => {
  let repo: CatalogRepo;
  const testOrgId = 'test-org-id';
  const testCtx = { organizationId: testOrgId };

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new CatalogRepo(mockPrisma as unknown as PrismaClient);

    // Give the mocked `withTenant` an implementation: invoke the callback with
    // the fake prisma client so repository queries reach the mocks. Without
    // this, every repo method resolves to `undefined`.
    mockWithTenant.mockImplementation(async (_ctx: unknown, callback: unknown) => {
      const run = callback as (tx: PrismaClient) => Promise<unknown>;
      return run(mockPrisma as unknown as PrismaClient);
    });
  });

  test('listCustomers filters by organizationId', async () => {
    const mockCustomers = [
      {
        id: '1',
        organizationId: testOrgId,
        name: 'Customer 1',
        industry: null,
        segment: null,
        stage: 'new',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '2',
        organizationId: testOrgId,
        name: 'Customer 2',
        industry: null,
        segment: null,
        stage: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    mockPrisma.customerAccount.findMany.mockResolvedValue(mockCustomers);

    const result = await repo.listCustomers(testCtx);

    expect(mockPrisma.customerAccount.findMany).toHaveBeenCalledWith({
      where: { organizationId: testOrgId },
      orderBy: { name: 'asc' },
    });
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.organizationId === testOrgId)).toBe(true);
  });

  test('getCustomer filters by organizationId', async () => {
    const mockCustomer = {
      id: '1',
      organizationId: testOrgId,
      name: 'Customer 1',
      industry: null,
      segment: null,
      stage: 'new',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPrisma.customerAccount.findFirst.mockResolvedValue(mockCustomer);

    const result = await repo.getCustomer(testCtx, '1');

    expect(mockPrisma.customerAccount.findFirst).toHaveBeenCalledWith({
      where: { id: '1', organizationId: testOrgId },
    });
    expect(result?.organizationId).toBe(testOrgId);
  });

  test('listForecastOverrides filters by organizationId', async () => {
    const mockOverrides = [
      {
        id: '1',
        organizationId: testOrgId,
        month: '2026-01',
        committed: 1000,
        bestCase: 2000,
        pipeline: 3000,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '2',
        organizationId: testOrgId,
        month: '2026-02',
        committed: 1500,
        bestCase: 2500,
        pipeline: 3500,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    mockPrisma.forecastOverride.findMany.mockResolvedValue(mockOverrides);

    const result = await repo.listForecastOverrides(testCtx);

    expect(mockPrisma.forecastOverride.findMany).toHaveBeenCalledWith({
      where: { organizationId: testOrgId },
      orderBy: { month: 'asc' },
    });
    expect(result).toHaveLength(2);
    expect(result.every((o) => o.organizationId === testOrgId)).toBe(true);
  });

  test('getForecastOverride filters by organizationId and month', async () => {
    const mockOverride = {
      id: '1',
      organizationId: testOrgId,
      month: '2026-01',
      committed: 1000,
      bestCase: 2000,
      pipeline: 3000,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockPrisma.forecastOverride.findFirst.mockResolvedValue(mockOverride);

    const result = await repo.getForecastOverride(testCtx, '2026-01');

    expect(mockPrisma.forecastOverride.findFirst).toHaveBeenCalledWith({
      where: { organizationId: testOrgId, month: '2026-01' },
    });
    expect(result?.organizationId).toBe(testOrgId);
    expect(result?.month).toBe('2026-01');
  });

  test('upsertForecastOverride filters by organizationId', async () => {
    const mockExisting = {
      id: '1',
      organizationId: testOrgId,
      month: '2026-01',
      committed: 1000,
      bestCase: 2000,
      pipeline: 3000,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const mockUpdated = {
      ...mockExisting,
      committed: 2000,
      bestCase: 3000,
      pipeline: 4000,
      updatedAt: new Date(),
    };

    mockPrisma.forecastOverride.findFirst.mockResolvedValue(mockExisting);
    mockPrisma.forecastOverride.update.mockResolvedValue(mockUpdated);

    const result = await repo.upsertForecastOverride(testCtx, {
      month: '2026-01',
      committed: 2000,
      bestCase: 3000,
      pipeline: 4000,
    });

    expect(mockPrisma.forecastOverride.findFirst).toHaveBeenCalledWith({
      where: { organizationId: testOrgId, month: '2026-01' },
    });
    expect(mockPrisma.forecastOverride.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: {
        committed: 2000,
        bestCase: 3000,
        pipeline: 4000,
        updatedAt: expect.any(Date),
      },
    });
    expect(result.organizationId).toBe(testOrgId);
  });

  // Cross-tenancy test: the repository must scope every query to the caller's
  // org. A mocked prisma client has no database to apply the WHERE clause, so it
  // applies it here — this asserts the repo passes the org filter through. (The
  // live suite under lib/db/live/ is what proves the DB-level RLS backstop.)
  test('does not return data from other organizations', async () => {
    const otherOrgId = 'other-org-id';
    const mockCustomers = [
      {
        id: '1',
        organizationId: testOrgId,
        name: 'Customer 1',
        industry: null,
        segment: null,
        stage: 'new',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '2',
        organizationId: otherOrgId,
        name: 'Customer 2',
        industry: null,
        segment: null,
        stage: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      }, // Different org
    ];

    mockPrisma.customerAccount.findMany.mockImplementation(
      async (args: { where?: { organizationId?: string } }) =>
        mockCustomers.filter((c) => c.organizationId === args?.where?.organizationId),
    );

    const result = await repo.listCustomers(testCtx);

    // Should only return customers from testOrgId
    expect(result).toHaveLength(1);
    expect(result[0].organizationId).toBe(testOrgId);
    expect(result[0].name).toBe('Customer 1');
  });

  // Test that withTenant is properly called
  test('uses withTenant for all repository operations', async () => {
    const mockCustomers = [
      {
        id: '1',
        organizationId: testOrgId,
        name: 'Customer 1',
        industry: null,
        segment: null,
        stage: 'new',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    mockPrisma.customerAccount.findMany.mockResolvedValue(mockCustomers);

    // withTenant is already mocked at module scope (mockWithTenant) — no need to
    // spy via a `require()`-style import, which ESLint forbids.
    mockWithTenant.mockImplementation(async (_ctx: unknown, callback: unknown) => {
      const run = callback as (tx: PrismaClient) => Promise<unknown>;
      return run(mockPrisma as unknown as PrismaClient);
    });

    await repo.listCustomers(testCtx);

    expect(mockWithTenant).toHaveBeenCalledWith(testCtx, expect.any(Function));
  });
});
