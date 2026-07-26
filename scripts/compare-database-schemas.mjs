import {
  dumpPublicSchema,
  normalizeSchemaDump
} from './migration-lib.mjs';

const leftDatabaseUrl = process.env.MIGRATION_LEFT_DATABASE_URL?.trim();
const rightDatabaseUrl = process.env.MIGRATION_RIGHT_DATABASE_URL?.trim();
if (!leftDatabaseUrl || !rightDatabaseUrl) {
  throw new Error('Both migration schema comparison URLs are required');
}

const leftSchema = normalizeSchemaDump(dumpPublicSchema(leftDatabaseUrl));
const rightSchema = normalizeSchemaDump(dumpPublicSchema(rightDatabaseUrl));
if (leftSchema !== rightSchema) {
  throw new Error('Database schemas do not match');
}

console.log('Database schemas match.');
