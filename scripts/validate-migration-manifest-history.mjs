import { readFileSync } from 'node:fs';

const [baseManifestPath, currentManifestPath] = process.argv.slice(2);
if (!baseManifestPath || !currentManifestPath) {
  throw new Error('Base and current migration manifest paths are required');
}

const baseManifest = JSON.parse(readFileSync(baseManifestPath, 'utf8'));
const currentManifest = JSON.parse(readFileSync(currentManifestPath, 'utf8'));
if (baseManifest.version !== 1 || currentManifest.version !== 1) {
  throw new Error('Unsupported migration manifest version');
}
if (!Array.isArray(baseManifest.migrations) || !Array.isArray(currentManifest.migrations)) {
  throw new Error('Invalid migration manifest');
}
if (currentManifest.migrations.length < baseManifest.migrations.length) {
  throw new Error('Migration manifest history cannot be shortened');
}

for (let index = 0; index < baseManifest.migrations.length; index += 1) {
  const before = JSON.stringify(baseManifest.migrations[index]);
  const after = JSON.stringify(currentManifest.migrations[index]);
  if (before !== after) {
    throw new Error(`Migration manifest history changed at position ${index + 1}`);
  }
}

console.log('Migration manifest history is append-only.');
