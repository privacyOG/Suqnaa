import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const routesDirectory = fileURLToPath(new URL('../routes/', import.meta.url));
const entries = await readdir(routesDirectory, { withFileTypes: true });
const offenders: string[] = [];

for (const entry of entries) {
  if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
  const path = join(routesDirectory, entry.name);
  const source = await readFile(path, 'utf8');
  if (source.includes("../security/rate-limit.js")) {
    offenders.push(basename(path));
  }
}

assert.deepEqual(
  offenders.sort(),
  [],
  `Production routes must use checkSharedRateLimit; direct process-local limiter imports remain in: ${offenders.sort().join(', ')}`
);

console.log('shared rate-limit route boundary ok');
