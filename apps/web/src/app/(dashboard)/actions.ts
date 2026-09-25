'use server';

import { signOut } from '@/lib/auth';

/**
 * Server Action: sign out (closes the Phase 1 auth loop: register → org →
 * login → **logout**).
 *
 * Uses the server-side `signOut` from the Auth.js config, so it runs in a
 * Server Action with no client JavaScript: the shell renders a plain
 * `<form action={logout}>`. Cookie mutation is permitted in Server Actions,
 * which is what this relies on.
 *
 * Hard-redirects to `/login` so the action's return type stays `void` — the
 * caller never renders a success state.
 */
export async function logout(): Promise<void> {
  await signOut({ redirectTo: '/login' });
}
