import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { LiveReporter } from './tests/live/reporter';

// Live provider API smoke runs: pretty custom reporter + only the live suite.
// Use via `pnpm test:providers` (sets RUN_LIVE=1).
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/live/providers.test.ts'],
    reporters: [new LiveReporter()],
  },
});
