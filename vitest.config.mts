import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Maps `@/` to src/.
    alias: {
      '@': resolve(root, 'src'),
      // `server-only` is a marker package: its default export throws, and only the
      // `react-server` condition resolves to empty.js. Vitest runs without that
      // condition, so point the bare specifier at the marker's own empty entry.
      'server-only': resolve(root, 'node_modules/server-only/empty.js'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30_000,
    // Serial files — parallel runs wedge intermittently.
    fileParallelism: false,
  },
});
