import 'server-only';

import { PrismaAdapter } from '@auth/prisma-adapter';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import { prisma } from '@/lib/db/client';
import { verifyPassword } from '@/lib/password';

/**
 * Auth.js v5 configuration (architecture §9.1, route-map §1).
 *
 * Decisions recorded in docs/phase-1-slice-1.md:
 *   - Credentials provider (no third-party auth-managed bids).
 *   - JWT sessions for credentials provider (required by Auth.js v5).
 *   - argon2id password hashing (single seam in lib/password.ts).
 *   - Adapter still used for session persistence/revocation.
 *
 * Exports:
 *   - `auth` — the request-scoped session resolver used by middleware and the
 *     route layer (replaces getServerSession).
 *   - `handlers` — GET/POST for the `/api/auth/[...nextauth]` route.
 *
 * The session payload carries { userId, organizationId, role } so the route
 * layer can build a TenantContext without a second DB round-trip. The client
 * never sees the role — only the non-sensitive projection served by
 * /api/session (route-map §4).
 *
 * NOTE on the v5 session callback: with JWT strategy the `user` argument is
 * the object returned by authorize(). We attach org/role in the jwt callback
 * and read them back in the session callback.
 */

// Extend the User type to include our custom fields from authorize()
type ExtendedUser = {
  id: string;
  email: string;
  name?: string | null;
  organizationId?: string | null;
  role?: string | null;
};

export const { handlers, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials): Promise<ExtendedUser | null> {
        const email = String(credentials?.email ?? '').toLowerCase().trim();
        const password = String(credentials?.password ?? '');
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        // Fetch membership to attach org/role to the token
        const membership = await prisma.membership.findFirst({
          where: { userId: user.id, status: 'active' },
          orderBy: { createdAt: 'asc' },
        });

        // Return the bare identity row; org/role are attached in the jwt callback
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? undefined,
          organizationId: membership?.organizationId ?? null,
          role: membership?.role ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as ExtendedUser;
        token.organizationId = u.organizationId ?? undefined;
        token.role = u.role ?? undefined;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.organizationId) {
        session.user = session.user ?? {};
        session.user.id = token.sub!;
        session.user.organizationId = token.organizationId as string;
        session.user.role = token.role as string;
      }
      // DEBUG: ensure we always have organizationId for demo
      if (!session.user?.organizationId && token.organizationId) {
        session.user = session.user ?? {};
        session.user.organizationId = token.organizationId as string;
        session.user.role = (token.role as string) ?? 'member';
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
});

/** The server-side session, typed with the tenancy fields we attach. */
export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  organizationId?: string;
  role?: string;
};