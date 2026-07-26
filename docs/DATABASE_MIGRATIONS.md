# Database migration process

Suqnaa database changes are controlled by an immutable migration manifest and a checksum ledger stored inside PostgreSQL.

## Source of truth

- SQL files live in `infra/db/migrations/`.
- `infra/db/migration-manifest.json` defines the only valid order.
- Each manifest entry has a unique migration identifier independent of the historical filename prefix.
- `suqnaa_schema_migrations` records the identifier, manifest position, filename, SHA-256 checksum, and application time.
- The full filename remains immutable even where older files share the same numeric prefix.

The historical duplicate `008`, `009`, and `011` prefixes are therefore unambiguous: every file has its own unique manifest identifier and position.

## Applying migrations

Set `DATABASE_URL` to the target PostgreSQL database and run:

```bash
pnpm db:migrate
```

The runner:

1. validates that the manifest lists every SQL migration exactly once;
2. calculates the checksum of every file;
3. obtains a transaction-scoped PostgreSQL advisory lock;
4. creates the ledger when needed;
5. rejects any applied migration whose position, filename, or checksum differs;
6. applies pending migrations in manifest order;
7. records each migration in the same transaction; and
8. verifies that the final ledger matches the complete manifest.

Running the command repeatedly is safe. Already-applied entries are verified and skipped.

## Adding a migration

1. Add one new SQL file using the next unused filename prefix, currently `012_...sql`.
2. Append one new entry to the end of `migration-manifest.json` using the next unique manifest identifier.
3. Never edit, reorder, rename, or delete an existing SQL file or manifest entry.
4. Run the complete migration validation against both a fresh database and an upgrade database.
5. Commit the SQL file and manifest update together.

Pull-request validation rejects altered historical SQL files and altered historical manifest entries.

## Adopting an existing database

Databases created before the ledger was introduced must be adopted once. Adoption does not execute historical migrations again.

Use a maintenance window and complete these steps:

1. Back up the existing database.
2. Create an empty temporary reference database using the same PostgreSQL/PostGIS versions and role settings.
3. Apply the current manifest to the reference database:

```bash
DATABASE_URL="$REFERENCE_DATABASE_URL" pnpm db:migrate
```

4. Compare the existing database with the verified reference and seed the ledger only when their public schemas match exactly:

```bash
DATABASE_URL="$EXISTING_DATABASE_URL" \
MIGRATION_REFERENCE_DATABASE_URL="$REFERENCE_DATABASE_URL" \
pnpm db:migrate:adopt
```

5. Verify the adopted database through the normal runner:

```bash
DATABASE_URL="$EXISTING_DATABASE_URL" pnpm db:migrate
```

6. Run the marketplace smoke checks, then remove the temporary reference database.

The adoption command excludes only the ledger table from schema comparison. It refuses adoption when the existing schema differs, when the reference URL is the same database, or when the ledger already contains entries.

## Deployment rule

A deployment must run `pnpm db:migrate` as a dedicated migration job before starting the new API version. Only one migration job should be scheduled, although the advisory lock protects against accidental concurrency. Application containers must not mount SQL files into PostgreSQL startup directories.

## Validation

The quality gate exercises:

- a fresh manifest-managed installation;
- a second idempotent run;
- verified adoption of the previous filename-managed schema;
- an upgrade from the base commit;
- a second idempotent upgrade run; and
- final schema equivalence between fresh and upgraded databases.
