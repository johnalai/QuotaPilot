import 'server-only';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { getServerSession } from '@/lib/auth';
import { getSessionProjection } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenancy/tenant-ctx';

/**
 * Route Handler for recomputing forecast.
 *
 * POST /api/forecast/recompute
 *
 * Requires session and organization.
 * Triggers a recompute of the forecast data (in this case, just returns fresh data).
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession();
  const projection = await getSessionProjection();

  if (!session || !projection.authenticated || !projection.organizationId) {
    return NextResponse.json(
      { ok: false, error: { code: 'FORBIDDEN', message: 'Unauthenticated' } },
      { status: 401 }
    );
  }

  const ctx = {
    organizationId: projection.organizationId,
    userId: projection.userId,
  };

  // Ensure the tenant context is set for the Prisma transaction
  const forecastData = await withTenant(
    ctx,
    async (tx) => {
      // Fetch all opportunities for the organization using the transaction-bound client
      const opportunities = await tx.dealOpportunity.findMany({
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

      // We'll use the same functions from the domain/rules/forecast
      const { buildForecast, totalPipeline, totalWeightedForecast } = await import('@quotapilot/domain/rules/forecast');
      const forecastLines = buildForecast(domainOpportunities);
      const pipelineTotal = totalPipeline(domainOpportunities);
      const weightedTotal = totalWeightedForecast(domainOpportunities);
      const opportunityCount = domainOpportunities.filter(op => op.stage !== 'lost').length;

      // Calculate quarter totals (simplified)
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
      const quarterPipeline = quarterCommitted;

      return {
        forecastLines,
        pipelineTotal,
        weightedTotal,
        opportunityCount,
        quarterTotals: {
          committed: quarterCommitted,
          bestCase: quarterWeighted,
          pipeline: quarterPipeline,
        }
      };
    }
  );

  return NextResponse.json({ ok: true, data: forecastData });
}