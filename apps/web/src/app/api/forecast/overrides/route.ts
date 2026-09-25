import 'server-only';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { getServerSession } from '@/lib/auth';
import { getSessionProjection } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenancy/tenant-ctx';

/**
 * Route Handler for getting forecast override values.
 *
 * GET /api/forecast/overrides
 *
 * Requires session and organization.
 * Returns the forecast overrides for the organization.
 */
export async function GET(request: NextRequest) {
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
  const forecastOverrides = await withTenant(
    ctx,
    async (tx) => {
      const overrides = await tx.forecastOverride.findMany({
        where: { organizationId: ctx.organizationId },
        orderBy: { month: 'asc' },
      });

      // Convert to the format expected by the frontend
      return overrides.map(override => ({
        id: override.id,
        organizationId: override.organizationId,
        month: override.month,
        committed: override.committed,
        bestCase: override.bestCase,
        pipeline: override.pipeline,
        createdAt: override.createdAt,
        updatedAt: override.updatedAt,
      }));
    }
  );

  return NextResponse.json({ ok: true, data: forecastOverrides });
}