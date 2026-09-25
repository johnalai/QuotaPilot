import 'server-only';

import type { TenantContext } from '@/lib/db/client';

/**
 * Ability vocabulary over the role matrix (architecture §9.2).
 *
 * Enforced in the service layer via `authorize(ctx, ability)` — never trusted
 * from buttons or query params. The UI only ever renders what the service
 * layer told it a caller may do.
 *
 * | Action                               | Owner | Admin | Member |
 * | ------------------------------------ | ----- | ----- | ------ |
 * | view own org data                    | ✓     | ✓     | ✓      |
 * | create/edit accounts & opportunities | ✓     | ✓     | ✓      |
 * | run prep/objection practice          | ✓     | ✓     | ✓      |
 * | manage members/invites               | ✓     | ✓     | ✗      |
 * | edit org settings, quotas, plan      | ✓     | ✓     | ✗      |
 * | change roles / delete org            | ✓     | ✗     | ✗      |
 */
export type Ability =
  | 'view'
  | 'mutate'
  | 'manage_members'
  | 'manage_settings'
  | 'manage_org';

const MATRIX: Record<Ability, ReadonlyArray<TenantContext['role']>> = {
  view: ['owner', 'admin', 'member'],
  mutate: ['owner', 'admin', 'member'],
  manage_members: ['owner', 'admin'],
  manage_settings: ['owner', 'admin'],
  manage_org: ['owner'],
};

/** Decide whether `ctx.role` may perform `ability`. */
export function authorize(ctx: TenantContext, ability: Ability): boolean {
  return MATRIX[ability].includes(ctx.role);
}