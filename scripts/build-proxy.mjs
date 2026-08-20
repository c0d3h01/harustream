// Bundle the standalone media proxy into a single self-contained Node ESM
// file. The artifact needs only Node.js — no node_modules, no Next.js — so it
// can run on a small VPS / home server with a residential (non-blocked) IP.
//
//   node scripts/build-proxy.mjs   ->   dist/proxy-server.mjs
//

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

await build({
  entryPoints: [resolve(root, 'server/proxy.ts')],
  outfile: resolve(root, 'dist/proxy-server.cjs'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  // Resolve the app's `@/` alias so the shared proxy module can be reused
  // verbatim outside of Next.js.
  alias: { '@': resolve(root, 'src') },
  logLevel: 'info',
  sourcemap: true,
});

// biome-ignore lint/suspicious/noConsole: build script output is the point of the script.
console.log('Built dist/proxy-server.cjs');
