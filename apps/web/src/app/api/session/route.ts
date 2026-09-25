import 'server-only';

import { NextResponse } from 'next/server';

import { getSessionProjection } from '@/lib/auth/session';

/**
 * Public session projection (route-map §4).
 *
 * Deliberately excludes the role — authorization is server-only. The client
 * bootstraps from this to decide where to navigate without ever touching
 * tenancy or authz fields.
 */
export async function GET() {
  const projection = await getSessionProjection();
  return NextResponse.json(projection);
}