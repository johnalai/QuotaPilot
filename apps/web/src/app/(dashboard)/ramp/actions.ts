'use server';

import { redirect } from 'next/navigation';

import { completeOnboarding, skipOnboarding } from '@/features/onboarding/service';
import { getSessionServer } from '@/lib/auth/session';

/**
 * Server Actions for the onboarding wizard (route-map §7).
 *
 * The route layer owns the session read; the service owns the mutation. Both
 * actions hard-redirect so their return type stays `void`.
 */
export async function completeOnboardingAction(): Promise<void> {
  const ctx = await getSessionServer();
  if (!ctx) redirect('/login');

  await completeOnboarding(ctx);
  redirect('/dashboard');
}

export async function skipOnboardingAction(): Promise<void> {
  const ctx = await getSessionServer();
  if (!ctx) redirect('/login');

  await skipOnboarding(ctx);
  redirect('/dashboard');
}
