'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import type { ApiErrorShape } from '@/lib/errors';

/**
 * Server Action: Credentials sign-in (route-map §2.2).
 *
 * Auth.js v5 has no server-side `signIn` — that symbol lives in
 * `next-auth/react` for client use only. The server-side path is to POST the
 * credentials to the provider callback route and let the route handler run
 * authorize() + set the session cookie. We then read the resulting cookie
 * back out to distinguish "invalid credentials" from "success".
 *
 * We never return a success payload — on success the action hard-redirects,
 * keeping the redirect out of the action's return type so the client island
 * only ever renders an error state.
 */
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('A valid email is required'),
  password: z.string().min(1, 'Password is required'),
  callbackUrl: z.string().optional(),
});

export async function loginAction(
  _prev: ApiErrorShape | null,
  formData: FormData,
): Promise<ApiErrorShape | null> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    callbackUrl: formData.get('callbackUrl'),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION',
        message: parsed.error.flatten().fieldErrors.email?.[0] ?? 'Invalid input',
      },
    };
  }

  // Forward the existing session cookie (if any) so the route handler can
  // link the new session to the same visitor.
  const cookieStore = await cookies();
  const existing = cookieStore.get('next-auth.session-token');
  const cookieHeader = existing
    ? `next-auth.session-token=${existing.value}`
    : undefined;

  const headersList = await headers();
  const origin = headersList.get('origin') ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
  const callbackUrl = parsed.data.callbackUrl ?? '/dashboard';

  const res = await fetch(`${origin}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: new URLSearchParams({
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: 'false',
    }),
  });

  // A 302 with Location: /login?error=... is the "invalid credentials" signal.
  if (res.status === 302) {
    const location = res.headers.get('location') ?? '';
    if (location.includes('error=CredentialsSignin') || location.includes('/login')) {
      return {
        ok: false,
        error: { code: 'VALIDATION', message: 'Invalid email or password' },
      };
    }
  }

  if (!res.ok) {
    return {
      ok: false,
      error: { code: 'VALIDATION', message: 'Sign-in failed' },
    };
  }

  // Success: the route handler set the session cookie. Redirect to the
  // post-login destination (the middleware/onboarding gate decides where).
  redirect(callbackUrl);
}