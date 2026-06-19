import pg from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import { env } from '../config/env.js';
import type { Database } from './types.js';

const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool })
});

export async function closeDb(): Promise<void> {
  await db.destroy();
}
