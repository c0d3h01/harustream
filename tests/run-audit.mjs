import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vitest = resolve(root, 'node_modules/vitest/vitest.mjs');

// App-flow order: foundations first, user-facing last.
const groups = [
  ['server', 'tests/server'],
  ['utils', 'tests/utils'],
  ['validation', 'tests/validation'],
  ['catalog', 'tests/catalog'],
  ['search', 'tests/search'],
  ['playback', 'tests/playback'],
  ['image', 'tests/image'],
  ['library', 'tests/library'],
  ['ui', 'tests/ui'],
];

const results = [];
for (const [name, dir] of groups) {
  const start = Date.now();
  const r = spawnSync(process.execPath, [vitest, 'run', dir], {
    cwd: root,
    stdio: 'inherit',
  });
  const ms = Date.now() - start;
  const pass = r.status === 0;
  results.push({ name, dir, pass, ms });
  console.log(`\n[audit] ${name}: ${pass ? 'PASS' : 'FAIL'} (${ms}ms)`);
}

console.log('\n=== test audit ===');
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(10)} ${r.dir}  ${r.ms}ms`);
}
const failed = results.filter((r) => !r.pass);
console.log(
  `\n${results.length - failed.length}/${results.length} groups passed${failed.length ? ` — failed: ${failed.map((r) => r.name).join(', ')}` : ''}`,
);
process.exit(failed.length ? 1 : 0);
