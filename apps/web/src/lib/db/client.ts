import 'server-only';

import { PrismaClient } from '@prisma/client';

/** Membership roles (architecture §9.2, domain-model §4). */
export type TenantRole = 'owner' | 'admin' | 'member';

/**
 * The org scope threaded from the route layer into services and repositories
 * (architecture §6, §7.1). Never constructed on the client — it is derived
 * from the server session. Phase 1 sets `request.jwt.claims` from this value
 * when opening the RLS transaction (architecture §7.2).
 */
export interface TenantContext {
  organizationId: string;
  role: TenantRole;
}

/**
 * Prisma client instance for the web app. Uses the standard singleton pattern
 * to avoid creating multiple clients in development.
 */
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;