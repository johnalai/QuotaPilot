import 'server-only';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { getSessionServer } from '@/lib/auth/session';
import { withTenant } from '@/lib/db/tenancy/tenant-ctx';
import { authorize } from '@/lib/permissions/abilities';

/**
 * Route Handler for deleting a forecast override.
 *
 * DELETE /api/forecast/overrides/[id]
 *
 * Requires session and organization. Editing forecast values is org *data*,
 * which members may edit (CLAUDE.md §4 role matrix) — not an admin-only
 * settings operation.
 */
export async function DELETE(
  _request: NextRequest,
  // Next 16: dynamic params are a Promise and must be awaited.
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ctx = await getSessionServer();

  if (!ctx) {
    return NextResponse.json(
      { ok: false, error: { code: 'FORBIDDEN', message: 'Unauthenticated' } },
      { status: 401 },
    );
  }

  // `authorize(ctx, ability)` returns a boolean and needs ctx.role. This route
  // previously destructured it as `{ authorize }`, which yielded `undefined` and
  // rejected every request with 403.
  if (!authorize(ctx, 'mutate')) {
    return NextResponse.json(
      { ok: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } },
      { status: 403 },
    );
  }

  if (!id) {
    return NextResponse.json(
      { ok: false, error: { code: 'VALIDATION', message: 'Override ID is required' } },
      { status: 400 },
    );
  }

  try {
    // Scoped inside the tenant transaction: the lookup carries the org filter,
    // so an id belonging to another org is a NOT_FOUND — never a delete. (The
    // previous version returned its response *from inside* the callback, where
    // it was discarded, so a missing row still answered 200.)
    const deleted = await withTenant(ctx, async (tx) => {
      const existing = await tx.forecastOverride.findFirst({
        where: { id, organizationId: ctx.organizationId },
        select: { id: true },
      });

      if (!existing) return false;

      await tx.forecastOverride.delete({ where: { id } });
      return true;
    });

    if (!deleted) {
      return NextResponse.json(
        { ok: false, error: { code: 'NOT_FOUND', message: 'Forecast override not found' } },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting forecast override:', error);
    return NextResponse.json(
      { ok: false, error: { code: 'AI_QUOTA', message: 'Failed to delete forecast override' } },
      { status: 500 },
    );
  }
}
