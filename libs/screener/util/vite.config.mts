/// <reference types='vitest' />
import { defineConfig } from 'vite';

// util is framework-free TypeScript: tests run in plain Node, without the Angular compiler.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/screener/util',
  resolve: { tsconfigPaths: true },
  test: {
    name: 'util',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    reporters: ['default'],
    coverage: {
      enabled: true,
      reportsDirectory: '../../../coverage/libs/screener/util',
      provider: 'v8' as const,
      include: ['src/lib/**/*.ts'],
      exclude: ['src/**/*.spec.ts'],
      reporter: ['text-summary', 'lcov'],
      // Pure logic is the cheapest place to test thoroughly; keep it that way.
      thresholds: { lines: 95, functions: 95, branches: 90, statements: 95 },
    },
  },
}));
