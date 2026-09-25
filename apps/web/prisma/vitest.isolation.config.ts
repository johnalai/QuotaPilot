import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * Vitest config for the Phase 1 Slice 2 LIVE-DATABASE suites:
 * the RLS isolation release gate and the referential-integrity suite.
 *
 * NEVER part of `pnpm test` / CI — the root vitest.config.ts excludes
 * `src/lib/db/live/**`. Run explicitly against the local dev DB:
 *
 *   pnpm --filter @quotapilot/web test:isolation
 *
 * Prereqs: the `quotapilot-db` container is up, the Slice 2 migration is
 * applied, and the `.env.local` / `.env.migration` files exist (see
 * docs/phase-1-slice-2.md). Env is loaded by dotenv-cli in the npm script;
 * tests read APP_DATABASE_URL (app role, NOBYPASSRLS) and
 * MIGRATION_DATABASE_URL (owner role) explicitly and never trust DATABASE_URL.
 */
export default defineConfig({
  resolve: {
    // The suites import the real services, which use the app's `@/` path alias.
    // The app resolves that via tsconfig; vitest needs it declared explicitly,
    // otherwise a service-level live test fails to resolve its own imports.
    alias: {
      '@': fileURLToPath(new URL('../src', import.meta.url)),
    },
  },
  test: {
    include: ['src/lib/db/live/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
