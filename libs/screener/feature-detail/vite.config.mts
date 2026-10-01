/// <reference types='vitest' />
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import angular from '@analogjs/vite-plugin-angular';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/screener/feature-detail',
  // These configs only serve tests. Nx also loads them outside test mode, where the plugin
  // would otherwise look for a tsconfig.app.json, so point it at the spec config explicitly.
  plugins: [
    angular({ tsconfig: resolve(import.meta.dirname, 'tsconfig.spec.json') }),
  ],
  resolve: { tsconfigPaths: true },
  test: {
    name: 'feature-detail',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/screener/feature-detail',
      provider: 'v8' as const,
    },
  },
}));
