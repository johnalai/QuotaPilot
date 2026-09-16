import { defineConfig } from 'vitest/config';

// Central test runner for the whole workspace.
// Pure rule modules + schemas are the current unit surface (node env);
// component tests get a per-project config later when the UI needs one.
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/web/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
