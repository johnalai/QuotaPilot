import 'server-only';

import { opportunitySchema, type Opportunity } from '@quotapilot/contracts';

import { prisma, type TenantContext } from '@/lib/db/client';
import { CatalogRepo, type DealRow } from '@/lib/db/tenancy/catalog';
import { forbidden, notFound, validationError } from '@/lib/errors';
import { authorize } from '@/lib/permissions/abilities';

/**
 * Opportunities service (route-map §3.4).
 *
 * Layering: route → service → repository → Postgres. Every query runs through
 * `CatalogRepo`, which wraps it in `withTenant` — the org comes from the
 * session and the transaction-scoped RLS claim is set on the same connection.
 */

/**
 * The form shape. `organizationId` is never accepted from input, and `ownerId`
 * is supplied by the route layer from the session — the browser sends neither.
 */
const createOpportunityInputSchema = opportunitySchema.omit({ organizationId: true, id: true });

export type CreateOpportunityInput = {
  accountId: string;
  name: string;
  stage: Opportunity['stage'];
  /** Integer minor units — money is never a float (CLAUDE.md §3). */
  amount: number;
  /** `YYYY-MM-DD`. */
  closeDate: string;
  /** Injected by the route layer from the session; never from the form. */
  ownerId: string;
};

export async function listOpportunities(ctx: TenantContext): Promise<DealRow[]> {
  if (!authorize(ctx, 'view')) {
    throw forbidden('You do not have permission to view this organization');
  }

  return new CatalogRepo(prisma).listDeals(ctx);
}

export async function getOpportunity(ctx: TenantContext, opportunityId: string): Promise<DealRow> {
  if (!authorize(ctx, 'view')) {
    throw forbidden('You do not have permission to view this organization');
  }

  const opportunity = await new CatalogRepo(prisma).getDeal(ctx, opportunityId);
  if (!opportunity) {
    // Scoped lookup: another org's id is indistinguishable from a missing one.
    throw notFound('Opportunity not found');
  }

  return opportunity;
}

/**
 * Create an opportunity in the caller's org.
 *
 * The account is re-resolved **through the scoped repository** before the
 * insert, and a miss is a validation error. This matters because neither layer
 * below us enforces it: `deal.account_id` is a plain foreign key with no
 * tenant component, and the RLS policy only checks `organization_id` — so
 * without this guard an opportunity could be attached to *another org's*
 * account and leak that relationship.
 */
export async function createOpportunity(ctx: TenantContext, input: unknown): Promise<DealRow> {
  if (!authorize(ctx, 'mutate')) {
    throw forbidden('You do not have permission to edit opportunities');
  }

  const parsed = createOpportunityInputSchema.safeParse(input);
  if (!parsed.success) {
    throw validationError('Invalid opportunity input', parsed.error.flatten().fieldErrors);
  }

  const repo = new CatalogRepo(prisma);

  const account = await repo.getCustomer(ctx, parsed.data.accountId);
  if (!account) {
    throw validationError('Account not found in this organization', {
      accountId: ['Account not found in this organization'],
    });
  }

  return repo.createDeal(ctx, parsed.data);
}
