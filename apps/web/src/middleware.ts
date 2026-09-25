import 'server-only';

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { auth } from '@/lib/auth';
import { getSessionProjection } from '@/lib/auth/session';

/**
 * Auth.js v5 middleware (route-map §1).
 *
 * Wraps `auth` so the session is resolved per request and the non-sensitive
 * projection is attached as a header the server layer can read without a
 * second session round-trip. Public routes (auth pages, health) are left
 * alone; everything else requires an authenticated, onboarded session.
 *
 * Must run on Node.js runtime because it uses argon2 (node:crypto) via auth.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health|api/auth).*)'],
};

export const runtime = 'nodejs';

export default auth(async (req: NextRequest) => {
  const session = await auth();
  const projection = session
    ? await getSessionProjection()
    : { authenticated: false, userId: null, organizationId: null, onboarded: false };

  const res = NextResponse.next();
  res.headers.set('x-session-authenticated', String(projection.authenticated));
  res.headers.set('x-session-org', projection.organizationId ?? '');
  res.headers.set('x-session-onboarded', String(projection.onboarded));

  const { pathname } = req.nextUrl;

  // Auth pages are only meaningful when the user is not yet signed in.
  if (pathname.startsWith('/login') || pathname.startsWith('/register')) {
    if (projection.authenticated) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    return res;
  }

  // Everything else requires an authenticated, onboarded session.
  if (!projection.authenticated) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
  if (!projection.onboarded) {
    return NextResponse.redirect(new URL('/ramp', req.url));
  }

  return res;
});
