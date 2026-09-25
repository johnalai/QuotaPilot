import 'server-only';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { getSessionServer } from '@/lib/auth/session';
import { prisma } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenancy/tenant-ctx';
import { authorize } from '@/lib/permissions/abilities';

/**
 * Route Handler for setting forecast override values.
 *
 * PATCH /api/forecast/values
 *
 * Requires session and organization.
 * Enforces the invariant: committed ≤ bestCase ≤ pipeline
 * where all values are in minor units (cents).
 */
export async function PATCH(request: NextRequest) {
  const ctx = await getSessionServer();

  if (!ctx) {
    return NextResponse.json(
      { ok: false, error: { code: 'FORBIDDEN', message: 'Unauthenticated' } },
      { status: 401 },
    );
  }

  // Authorization is service-layer and never trusted from the UI.
  // `authorize(ctx, ability)` returns a boolean and needs ctx.role, so it is
  // called directly — destructuring it (as this route previously did) always
  // produced `undefined` and rejected every request with 403.
  // Ability: editing forecast values is org *data*, which members may edit
  // (CLAUDE.md §4 role matrix) — not a settings/org operation.
  if (!authorize(ctx, 'mutate')) {
    return NextResponse.json(
      { ok: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } },
      { status: 403 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: { code: 'VALIDATION', message: 'Invalid JSON body' } },
      { status: 400 },
    );
  }

  const { month, committed, bestCase, pipeline } = body;

  // Validate required fields
  if (!month || typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json(
      { ok: false, error: { code: 'VALIDATION', message: 'Month must be in YYYY-MM format' } },
      { status: 400 },
    );
  }

  if (typeof committed !== 'number' || committed < 0 || !Number.isInteger(committed)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'VALIDATION',
          message: 'Committed must be a non-negative integer (minor units)',
        },
      },
      { status: 400 },
    );
  }

  if (typeof bestCase !== 'number' || bestCase < 0 || !Number.isInteger(bestCase)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'VALIDATION',
          message: 'BestCase must be a non-negative integer (minor units)',
        },
      },
      { status: 400 },
    );
  }

  if (typeof pipeline !== 'number' || pipeline < 0 || !Number.isInteger(pipeline)) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'VALIDATION',
          message: 'Pipeline must be a non-negative integer (minor units)',
        },
      },
      { status: 400 },
    );
  }

  // Enforce the invariant: committed ≤ bestCase ≤ pipeline
  if (committed > bestCase) {
    return NextResponse.json(
      { ok: false, error: { code: 'VALIDATION', message: 'Committed cannot exceed bestCase' } },
      { status: 400 },
    );
  }

  if (bestCase > pipeline) {
    return NextResponse.json(
      { ok: false, error: { code: 'VALIDATION', message: 'BestCase cannot exceed pipeline' } },
      { status: 400 },
    );
  }

  try {
    const forecastOverride = await withTenant(ctx, async (tx) => {
      const existing = await tx.forecastOverride.findFirst({
        where: { organizationId: ctx.organizationId, month },
      });

      if (existing) {
        return await tx.forecastOverride.update({
          where: { id: existing.id },
          data: {
            committed,
            bestCase,
            pipeline,
            updatedAt: new Date(),
          },
        });
      }

      return await tx.forecastOverride.create({
        data: {
          organizationId: ctx.organizationId,
          month,
          committed,
          bestCase,
          pipeline,
        },
      });
    });

    return NextResponse.json({ ok: true, data: forecastOverride });
  } catch (error) {
    console.error('Error setting forecast values:', error);
    return NextResponse.json(
      { ok: false, error: { code: 'AI_QUOTA', message: 'Failed to set forecast values' } },
      { status: 500 },
    );
  }
}
