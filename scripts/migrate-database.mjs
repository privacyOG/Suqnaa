import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadMigrationManifest,
  runCommand,
  sqlLiteral
} from './migration-lib.mjs';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const migrations = loadMigrationManifest();
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'suqnaa-migrations-'));
const migrationScript = join(temporaryDirectory, 'apply.sql');

function includePath(filePath) {
  return `'${filePath.replaceAll("'", "''")}'`;
}

const lines = [
  '\\set ON_ERROR_STOP on',
  'BEGIN;',
  "SELECT pg_advisory_xact_lock(hashtextextended('suqnaa_schema_migrations', 0));",
  `CREATE TABLE IF NOT EXISTS suqnaa_schema_migrations (
    migration_id text PRIMARY KEY,
    position integer NOT NULL UNIQUE CHECK (position > 0),
    filename text NOT NULL UNIQUE,
    checksum_sha256 char(64) NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
  );`
];

for (const migration of migrations) {
  const prefix = `migration_${migration.position}`;
  lines.push(
    `SELECT
      EXISTS (
        SELECT 1
        FROM suqnaa_schema_migrations
        WHERE migration_id = ${sqlLiteral(migration.id)}
      ) AS ${prefix}_present,
      COALESCE((
        SELECT
          position = ${migration.position}
          AND filename = ${sqlLiteral(migration.file)}
          AND checksum_sha256 = ${sqlLiteral(migration.checksum)}
        FROM suqnaa_schema_migrations
        WHERE migration_id = ${sqlLiteral(migration.id)}
      ), false) AS ${prefix}_matches`,
    '\\gset',
    `\\if :${prefix}_present`,
    `  \\if :${prefix}_matches`,
    `    \\echo Already applied: ${migration.id}`,
    '  \\else',
    `    \\echo Migration ledger mismatch: ${migration.id}`,
    '    SELECT 1 / 0;',
    '  \\endif',
    '\\else',
    `  \\echo Applying: ${migration.id}`,
    `  \\i ${includePath(migration.filePath)}`,
    `  INSERT INTO suqnaa_schema_migrations (
        migration_id,
        position,
        filename,
        checksum_sha256
      ) VALUES (
        ${sqlLiteral(migration.id)},
        ${migration.position},
        ${sqlLiteral(migration.file)},
        ${sqlLiteral(migration.checksum)}
      );`,
    '\\endif'
  );
}

lines.push(
  `DO $migration_count$
  BEGIN
    IF (SELECT count(*) FROM suqnaa_schema_migrations) <> ${migrations.length} THEN
      RAISE EXCEPTION 'Migration ledger count does not match the manifest';
    END IF;
  END
  $migration_count$;`,
  'COMMIT;'
);

writeFileSync(migrationScript, `${lines.join('\n')}\n`);

try {
  runCommand('psql', [
    databaseUrl,
    '--set',
    'ON_ERROR_STOP=1',
    '--file',
    migrationScript
  ]);
  console.log(`Database migration ledger is current at ${migrations.length} entries.`);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
