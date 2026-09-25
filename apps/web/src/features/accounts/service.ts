import 'server-only';

import { accountSchema, type AccountStage } from '@quotapilot/contracts';

import { CatalogRepo, type CustomerRow } from '@/lib/db/tenancy/catalog';
import { prisma, type TenantContext } from '@/lib/db/client';
import { forbidden, notFound, validationError } from '@/lib/errors';
import { authorize } from '@/lib/permissions/abilities';

/**
 * Accounts service (route-map §3.3).
 *
 * Layering: route → service → repository → Postgres. Every read/write goes
 * through `CatalogRepo`, which runs it inside `withTenant` — so the org comes
 * from the session (never the request) and the transaction-scoped RLS claim is
 * set on the same connection that runs the query.
 */

/** The form shape: `organizationId` is deliberately NOT accepted from input. */
const createAccountInputSchema = accountSchema.omit({ organizationId: true });

/** The shape the form/action supplies: no org id, stage optional. */
export type CreateAccountInput = {
  name: string;
  industry?: string;
  segment?: string;
  stage?: AccountStage;
};

export async function listAccounts(ctx: TenantContext): Promise<CustomerRow[]> {
  if (!authorize(ctx, 'view')) {
    throw forbidden('You do not have permission to view this organization');
  }

  return new CatalogRepo(prisma).listCustomers(ctx);
}

export async function getAccount(ctx: TenantContext, accountId: string): Promise<CustomerRow> {
  if (!authorize(ctx, 'view')) {
    throw forbidden('You do not have permission to view this organization');
  }

  const account = await new CatalogRepo(prisma).getCustomer(ctx, accountId);
  if (!account) {
    // Scoped lookup: an id from another org is indistinguishable from a
    // non-existent one, which is the point.
    throw notFound('Account not found');
  }

  return account;
}

/**
 * Create an account in the caller's org.
 *
 * `organizationId` is taken from the TenantContext, and zod validates the rest
 * against the shared contract — so the browser can never choose the org, and the
 * same schema governs the form and the service.
 */
export async function createAccount(ctx: TenantContext, input: unknown): Promise<CustomerRow> {
  if (!authorize(ctx, 'mutate')) {
    throw forbidden('You do not have permission to edit accounts');
  }

  const parsed = createAccountInputSchema.safeParse(input);
  if (!parsed.success) {
    throw validationError('Invalid account input', parsed.error.flatten().fieldErrors);
  }

  return new CatalogRepo(prisma).createCustomer(ctx, parsed.data);
}
