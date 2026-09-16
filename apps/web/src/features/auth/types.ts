import type { TenantRole } from '@/lib/db/client';

/**
 * Non-sensitive session projection served to the client (route-map §4).
 * The server-side session carries password-hash context etc. — never here.
 */
export interface SessionProjection {
  userId: string;
  organizationId: string | null;
  role: TenantRole | null;
  onboarded: boolean;
}
