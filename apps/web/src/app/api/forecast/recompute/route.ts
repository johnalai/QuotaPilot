import 'server-only';

import { NextResponse } from 'next/server';

import { recomputeForecast } from '@/features/forecast/service';
import { getSessionServer } from '@/lib/auth/session';
import { ApiError, errorResponse } from '@/lib/errors';

/**
 * `POST /api/forecast/recompute` — backs the RECOMPUTE action on `/forecast`.
 *
 * Delegates to the forecast service instead of re-implementing the computation
 * inline (this route used to duplicate the opportunity read, the rule calls and
 * the quarter maths). The figures are derived on read, so "recompute" is
 * exactly "re-read under the caller's tenant scope" — there is no cache to
 * invalidate.
 */
export async function POST() {
  const ctx = await getSessionServer();

  if (!ctx) {
    return NextResponse.json(
      { ok: false, error: { code: 'FORBIDDEN', message: 'Unauthenticated' } },
      { status: 401 },
    );
  }

  try {
    const data = await recomputeForecast(ctx);
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    const status = error instanceof ApiError && error.code === 'FORBIDDEN' ? 403 : 500;
    return errorResponse(error, status);
  }
}
