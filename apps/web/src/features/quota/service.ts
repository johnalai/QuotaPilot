import 'server-only';

import { quotaPlanSchema } from '@quotapilot/contracts';

import { prisma, type TenantContext } from '@/lib/db/client';
import { QuotaPlanRepo, type QuotaPlanRow } from '@/lib/db/tenancy/quotaplan';
import { forbidden, validationError } from '@/lib/errors';
import { authorize } from '@/lib/permissions/abilities';

/**
 * Quota plan service (route-map §3.2).
 *
 * Layering: route → service → repository → Postgres. Every read/write goes
 * through `QuotaPlanRepo`, which runs it inside `withTenant` — so the org comes
 * from the session (never the request) and the transaction-scoped RLS claim is
 * set on the same connection that runs the query.
 *
 * A quota plan is one row per org, and editing it is an org-settings operation:
 * the ability is `manage_settings` (owner/admin), not `mutate`.
 */

/** The accepted input shape: `organizationId` is deliberately NOT from input. */
const quotaPlanInputSchema = quotaPlanSchema.omit({ organizationId: true });

/** Read the caller's quota plan, or null when the org has none yet. */
export async function getQuotaPlan(ctx: TenantContext): Promise<QuotaPlanRow | null> {
  if (!authorize(ctx, 'view')) {
    throw forbidden('You do not have permission to view this organization');
  }

  return new QuotaPlanRepo(prisma).findByOrg(ctx);
}

/**
 * Create or replace the caller's quota plan.
 *
 * `organizationId` comes from the TenantContext, never from input, and the
 * numbers are validated against the shared contract — money stays in integer
 * minor units, rates stay decimals.
 */
export async function saveQuotaPlan(ctx: TenantContext, input: unknown): Promise<QuotaPlanRow> {
  if (!authorize(ctx, 'manage_settings')) {
    throw forbidden("You do not have permission to manage this organization's settings");
  }

  const parsed = quotaPlanInputSchema.safeParse(input);
  if (!parsed.success) {
    throw validationError('Invalid quota plan input', parsed.error.flatten().fieldErrors);
  }

  return new QuotaPlanRepo(prisma).upsert(ctx, parsed.data);
}
