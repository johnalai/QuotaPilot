import 'server-only';

/**
 * Auth.js v5 route handler. Re-exports the GET/POST produced by NextAuth()
 * in lib/auth/index.ts — the single place the auth config is instantiated.
 *
 * This is the endpoint the login Server Action POSTs to (see
 * app/(auth)/login/actions.ts) and that the client calls for session refresh.
 */
import { handlers } from '@/lib/auth';
export const { GET, POST } = handlers;
export const runtime = 'nodejs';
