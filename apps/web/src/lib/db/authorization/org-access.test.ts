/**
 * Unit tests for the Organization access boundary (Adjustment 1).
 * Pure — no DB. Runs in the normal suite (`pnpm test`).
 */
import { describe, expect, it } from 'vitest';

import type { TenantContext } from '../client';
import { authorizeOrganization, type OrgMembershipView } from './org-access';

const ctx = (organizationId: string, role: TenantContext['role'] = 'member'): TenantContext => ({
  organizationId,
  role,
});

// ℹ️ The caller is a member of org_B; every unauthorized-org case tries to hit
// org_A — the "unrelated organization ID" this adjustment is about.
const MEMBER_OF_B = (status: OrgMembershipView['status'] = 'active'): OrgMembershipView[] => [
  { organizationId: 'org_B', role: 'owner', status },
];

describe('unrelated organization ID (authx must fail closed)', () => {
  it('blocks read when the caller is not a member of the requested org', () => {
    const result = authorizeOrganization(ctx('org_A'), MEMBER_OF_B(), 'read');
    expect(result).toEqual({ allowed: false, reason: 'not-a-member' });
  });

  it('blocks update when the caller is not a member of the requested org (even owner of another org)', () => {
    const result = authorizeOrganization(ctx('org_A'), MEMBER_OF_B(), 'update');
    expect(result).toEqual({ allowed: false, reason: 'not-a-member' });
  });

  it('blocks every action when the caller has no memberships at all', () => {
    for (const action of ['read', 'update'] as const) {
      expect(authorizeOrganization(ctx('org_A'), [], action)).toEqual({
        allowed: false,
        reason: 'not-a-member',
      });
    }
  });
});

describe('read access (active membership required)', () => {
  const memberOf = (role: OrgMembershipView['role']): OrgMembershipView[] => [
    { organizationId: 'org_A', role, status: 'active' },
  ];

  it('allows read for owner / admin / member', () => {
    for (const role of ['owner', 'admin', 'member'] as const) {
      expect(authorizeOrganization(ctx('org_A', role), memberOf(role), 'read').allowed).toBe(true);
    }
  });

  it('denies read for a deactivated or invited membership', () => {
    for (const status of ['invited', 'deactivated'] as const) {
      expect(authorizeOrganization(ctx('org_A'), [{ organizationId: 'org_A', role: 'member', status }], 'read')).toEqual({
        allowed: false,
        reason: 'membership-inactive',
      });
    }
  });
});

describe('update access (owner/admin only)', () => {
  const memberOf = (role: OrgMembershipView['role']): OrgMembershipView[] => [
    { organizationId: 'org_A', role, status: 'active' },
  ];

  it('allows update for owner and admin only', () => {
    expect(authorizeOrganization(ctx('org_A', 'owner'), memberOf('owner'), 'update').allowed).toBe(true);
    expect(authorizeOrganization(ctx('org_A', 'admin'), memberOf('admin'), 'update').allowed).toBe(true);
  });

  it('denies update for a plain member even on their own org', () => {
    expect(authorizeOrganization(ctx('org_A', 'member'), memberOf('member'), 'update')).toEqual({
      allowed: false,
      reason: 'role-insufficient',
    });
  });
});