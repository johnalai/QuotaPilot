import 'server-only';

import type { SessionContext } from '@/lib/auth/session';
import { markUserOnboarded } from '@/lib/db/users';
import { forbidden } from '@/lib/errors';
import { authorize } from '@/lib/permissions/abilities';

/**
 * Onboarding service (route-map §7).
 *
 * Plain module, deliberately NOT a `'use server'` file: marking this module
 * 'use server' exposes every export as a public Server Action with its own id,
 * callable straight from the browser and bypassing the route layer. The action
 * module (`app/(dashboard)/ramp/actions.ts`) is the action layer.
 *
 * The session is resolved by the route layer and passed in, so this service has
 * no request-context dependency — which is what makes it testable against a live
 * database.
 */

/** Complete onboarding for the acting user. Idempotent. */
export async function completeOnboarding(ctx: SessionContext): Promise<void> {
  if (!authorize(ctx, 'mutate')) {
    throw forbidden('You do not have permission to complete onboarding');
  }

  await markUserOnboarded(ctx.userId);
}

/**
 * Skip the wizard. Same effect as completing it (route-map §7: "skip" marks
 * onboarded and surfaces a slim empty state) — a user must never be trapped on
 * the wizard.
 */
export async function skipOnboarding(ctx: SessionContext): Promise<void> {
  await completeOnboarding(ctx);
}
