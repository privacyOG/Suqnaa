import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  dumpPublicSchema,
  loadMigrationManifest,
  normalizeSchemaDump,
  runCommand,
  sqlLiteral
} from './migration-lib.mjs';

const databaseUrl = process.env.DATABASE_URL?.trim();
const referenceDatabaseUrl = process.env.MIGRATION_REFERENCE_DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}
if (!referenceDatabaseUrl) {
  throw new Error('MIGRATION_REFERENCE_DATABASE_URL is required');
}
if (databaseUrl === referenceDatabaseUrl) {
  throw new Error('The existing and reference database URLs must be different');
}

const migrations = loadMigrationManifest();
const ledgerRelation = runCommand('psql', [
  databaseUrl,
  '--tuples-only',
  '--no-align',
  '--set',
  'ON_ERROR_STOP=1',
  '--command',
  "SELECT COALESCE(to_regclass('public.suqnaa_schema_migrations')::text, '');"
]).trim();

if (ledgerRelation) {
  const ledgerCount = Number.parseInt(runCommand('psql', [
    databaseUrl,
    '--tuples-only',
    '--no-align',
    '--set',
    'ON_ERROR_STOP=1',
    '--command',
    'SELECT count(*) FROM suqnaa_schema_migrations;'
  ]).trim(), 10);

  if (!Number.isFinite(ledgerCount) || ledgerCount !== 0) {
    throw new Error('Migration adoption requires an absent or empty ledger');
  }
}

const existingSchema = normalizeSchemaDump(dumpPublicSchema(databaseUrl));
const referenceSchema = normalizeSchemaDump(dumpPublicSchema(referenceDatabaseUrl));
if (existingSchema !== referenceSchema) {
  throw new Error('Existing database schema does not match the verified reference schema');
}

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'suqnaa-adoption-'));
const adoptionScript = join(temporaryDirectory, 'adopt.sql');
const values = migrations.map((migration) => `(
  ${sqlLiteral(migration.id)},
  ${migration.position},
  ${sqlLiteral(migration.file)},
  ${sqlLiteral(migration.checksum)}
)`).join(',\n');

writeFileSync(adoptionScript, `\\set ON_ERROR_STOP on
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('suqnaa_schema_migrations', 0));
CREATE TABLE IF NOT EXISTS suqnaa_schema_migrations (
  migration_id text PRIMARY KEY,
  position integer NOT NULL UNIQUE CHECK (position > 0),
  filename text NOT NULL UNIQUE,
  checksum_sha256 char(64) NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
DO $ledger_empty$
BEGIN
  IF EXISTS (SELECT 1 FROM suqnaa_schema_migrations) THEN
    RAISE EXCEPTION 'Migration ledger is not empty';
  END IF;
END
$ledger_empty$;
INSERT INTO suqnaa_schema_migrations (
  migration_id,
  position,
  filename,
  checksum_sha256
) VALUES
${values};
COMMIT;
`);

try {
  runCommand('psql', [
    databaseUrl,
    '--set',
    'ON_ERROR_STOP=1',
    '--file',
    adoptionScript
  ]);
  console.log(`Adopted ${migrations.length} verified migrations into the ledger.`);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
