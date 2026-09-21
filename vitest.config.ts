import { defineConfig } from 'vitest/config';

// Central test runner for the whole workspace.
// Pure rule modules + schemas are the current unit surface (node env);
// component tests get a per-project config later when the UI needs one.
//
// Live-DB integration suites live under apps/web/src/lib/db/live/ and run ONLY
// via `pnpm --filter @quotapilot/web test:isolation` (real Postgres + the
// NOBYPASSRLS app role). They are excluded here so `pnpm test`/CI never hits a
// database.
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/web/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/src/lib/db/live/**'],
    environment: 'node',
  },
});
