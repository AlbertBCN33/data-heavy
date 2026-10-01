/// <reference types='vitest' />
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/screener/data-access',
  plugins: [angular()],
  resolve: { tsconfigPaths: true },
  test: {
    name: 'data-access',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default'],
    coverage: {
      enabled: true,
      reportsDirectory: '../../../coverage/libs/screener/data-access',
      provider: 'v8' as const,
      include: ['src/lib/**/*.ts'],
      // Worker entry files only wire the tested handler to the worker scope.
      exclude: ['src/**/*.spec.ts', 'src/**/*.worker.ts'],
      reporter: ['text-summary', 'lcov'],
      // Adapters are the boundary to "the backend": failure paths must be tested.
      thresholds: { lines: 95, functions: 95, branches: 90, statements: 95 },
    },
  },
}));
