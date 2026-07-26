import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(scriptsDirectory, '..');
export const migrationsDirectory = join(repositoryRoot, 'infra', 'db', 'migrations');
export const manifestPath = join(repositoryRoot, 'infra', 'db', 'migration-manifest.json');

function fail(message) {
  throw new Error(message);
}

function checksum(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function loadMigrationManifest() {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.migrations)) {
    fail('Unsupported migration manifest format');
  }

  const identifiers = new Set();
  const filenames = new Set();
  const migrations = manifest.migrations.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      fail(`Invalid migration manifest entry at position ${index + 1}`);
    }

    const id = String(entry.id ?? '');
    const file = String(entry.file ?? '');
    if (!/^[0-9]{4}_[a-z0-9_]+$/.test(id)) {
      fail(`Invalid migration identifier: ${id}`);
    }
    if (!/^[0-9]{3}_[a-z0-9_]+\.sql$/.test(file)) {
      fail(`Invalid migration filename: ${file}`);
    }
    if (identifiers.has(id)) {
      fail(`Duplicate migration identifier: ${id}`);
    }
    if (filenames.has(file)) {
      fail(`Duplicate migration filename: ${file}`);
    }

    identifiers.add(id);
    filenames.add(file);
    const filePath = join(migrationsDirectory, file);

    return {
      id,
      file,
      filePath,
      position: index + 1,
      checksum: checksum(filePath)
    };
  });

  const diskFiles = readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  const manifestFiles = [...filenames].sort();
  if (JSON.stringify(diskFiles) !== JSON.stringify(manifestFiles)) {
    const missing = diskFiles.filter((file) => !filenames.has(file));
    const absent = manifestFiles.filter((file) => !diskFiles.includes(file));
    fail(
      `Migration manifest mismatch. Unlisted: ${missing.join(', ') || 'none'}; missing files: ${absent.join(', ') || 'none'}`
    );
  }

  return migrations;
}

export function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: 'utf8',
    env: options.env ?? process.env,
    input: options.input,
    maxBuffer: 32 * 1024 * 1024
  });

  if (result.status !== 0) {
    const details = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    fail(`${command} failed${details ? `:\n${details}` : ''}`);
  }

  return result.stdout;
}

export function dumpPublicSchema(databaseUrl) {
  return runCommand('pg_dump', [
    databaseUrl,
    '--schema-only',
    '--no-owner',
    '--no-privileges',
    '--schema=public',
    '--exclude-table=public.suqnaa_schema_migrations'
  ]);
}

export function normalizeSchemaDump(value) {
  return value
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed
        && !trimmed.startsWith('--')
        && !trimmed.startsWith('\\restrict')
        && !trimmed.startsWith('\\unrestrict');
    })
    .join('\n')
    .trim();
}

export function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
