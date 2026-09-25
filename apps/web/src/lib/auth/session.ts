import 'server-only';

import { auth, type SessionUser } from './index';
import type { TenantContext } from '@/lib/db/client';

/**
 * The non-sensitive projection the client bootstraps from (route-map §4).
 * Deliberately excludes the role — authorization is server-only.
 */
export interface SessionProjection {
  authenticated: boolean;
  userId: string | null;
  organizationId: string | null;
  onboarded: boolean;
}

/**
 * Resolve the server session and turn it into a TenantContext.
 *
 * This is the single seam the route layer uses to get an org scope. It never
 * trusts a query-string org id: the org comes from the session, and the
 * session's org comes from the JWT token (set in authorize() callback).
 */
export async function getSessionServer(): Promise<TenantContext | null> {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!user?.id || !user.organizationId) return null;
  return {
    organizationId: user.organizationId,
    role: (user.role as TenantContext['role']) ?? 'member',
  };
}

export async function getSessionProjection(): Promise<SessionProjection> {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!user?.id || !user.organizationId) {
    return { authenticated: false, userId: null, organizationId: null, onboarded: false };
  }

  const { prisma } = await import('@/lib/db/client');
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { onboardedAt: true },
  });
  return {
    authenticated: true,
    userId: user.id,
    organizationId: user.organizationId,
    onboarded: Boolean(row?.onboardedAt),
  };
}
