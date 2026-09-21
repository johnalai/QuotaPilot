/**
 * QuotaPilot · Phase 1 Slice 2 — Organization access boundary.
 *
 * Slice 2 Adjustment 1: `organization` deliberately does NOT carry org-claim
 * RLS (it is the tenant root; see architecture §7.2 / docs/phase-1-slice-2.md).
 * It is protected instead by service-layer authorization against the caller's
 * membership, with least-privilege role grants as the DB-level backstop. This
 * module is the pure authorization core that the organization service layer
 * (Phase 2 registration / org settings) binds to.
 *
 * The boundary it enforces:
 *   - There is NO generic "list organizations" operation.
 *   - There is NO lookup of an Organization by an arbitrary id. The caller may
 *     only reach an organization through a context that names the org, and that
 *     access is gated on an ACTIVE membership of the caller in that exact org.
 *   - read  → caller must hold an active membership for ctx.organizationId.
 *   - update → caller must be owner OR admin of ctx.organizationId.
 *   - Members/invited/deactivated membership is denied for update; invited and
 *     deactivated memberships are denied for read too.
 *
 * Pass the caller's memberships (fetched via the repository under the session
 * tenant context); never pass an id from a query string/body unchecked.
 */
import type { TenantContext, TenantRole } from '../client';

export type OrgRole = TenantRole;
export type MembershipStatus = 'active' | 'invited' | 'deactivated';

export interface OrgMembershipView {
  organizationId: string;
  role: OrgRole;
  status: MembershipStatus;
}

export type OrgAction = 'read' | 'update';

export type OrgAuthzResult =
  | { allowed: true }
  | { allowed: false; reason: 'not-a-member' | 'membership-inactive' | 'role-insufficient' };

/**
 * Decide whether `ctx` may perform `action` on the organization named by
 * `ctx.organizationId`, based on `memberships` (the caller's memberships).
 *
 * `memberships` is intentionally the ONLY source of truth — a caller with
 * memberships for org_B cannot read/update org_A, no matter what they supply in
 * `ctx`, because no membership entry for org_A exists.
 */
export function authorizeOrganization(
  ctx: TenantContext,
  memberships: OrgMembershipView[],
  action: OrgAction,
): OrgAuthzResult {
  const membership = memberships.find((m) => m.organizationId === ctx.organizationId);
  if (!membership) return { allowed: false, reason: 'not-a-member' };
  if (membership.status !== 'active') return { allowed: false, reason: 'membership-inactive' };
  if (action === 'update' && membership.role !== 'owner' && membership.role !== 'admin') {
    return { allowed: false, reason: 'role-insufficient' };
  }
  return { allowed: true };
}