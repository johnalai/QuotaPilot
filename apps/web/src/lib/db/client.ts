import 'server-only';

/** Membership roles (architecture §9.2, domain-model §4). */
export type TenantRole = 'owner' | 'admin' | 'member';

/**
 * The org scope threaded from the route layer into services and repositories
 * (architecture §6, §7.1). Never constructed on the client — it is derived
 * from the server session. Phase 1 sets `request.jwt.claims` from this value
 * when opening the RLS transaction (architecture §7.2).
 */
export interface TenantContext {
  organizationId: string;
  role: TenantRole;
}
