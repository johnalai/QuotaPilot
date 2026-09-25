import 'server-only';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { getServerSession } from '@/lib/auth';
import { getSessionProjection } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenancy/tenant-ctx';
import { authorize } from '@/lib/permissions/abilities';

/**
 * Route Handler for deleting forecast override values.
 *
 * DELETE /api/forecast/overrides/[id]
 *
 * Requires session and organization.
 * Only admin and owner can delete forecast overrides.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

  // Authorization: only admin and owner can delete forecast values
  const { authorize: authResult } = await authorize(ctx, 'edit');
  if (!authResult) {
    return NextResponse.json(
      { ok: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } },
      { status: 403 }
    );
  }

  const { id } = params;

  if (!id) {
    return NextResponse.json(
      { ok: false, error: { code: 'VALIDATION', message: 'Override ID is required' } },
      { status: 400 }
    );
  }

  try {
    await withTenant(
      ctx,
      async (tx) => {
        // First check if the override exists and belongs to the organization
        const existing = await tx.forecastOverride.findFirst({
          where: { id, organizationId: ctx.organizationId },
        });

        if (!existing) {
          return NextResponse.json(
            { ok: false, error: { code: 'NOT_FOUND', message: 'Forecast override not found' } },
            { status: 404 }
          );
        }

        // Delete the forecast override
        await tx.forecastOverride.delete({
          where: { id },
        });

        return NextResponse.json({ ok: true });
      }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting forecast override:', error);
    return NextResponse.json(
      { ok: false, error: { code: 'AI_QUOTA', message: 'Failed to delete forecast override' } },
      { status: 500 }
    );
  }
}