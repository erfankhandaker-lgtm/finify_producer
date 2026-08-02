'use strict';

require('dotenv').config();
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const migrationsDirectory = path.resolve(__dirname, '../database/migrations');
const migrationPattern = /^([0-9]{3})_[^.]+\.sql$/;
const baselineArgument = process.argv.find((value) => value.startsWith('--baseline-through='));
const baselineThrough = baselineArgument ? baselineArgument.split('=')[1] : null;

function connectionConfig() {
  if (process.env.MIGRATION_DATABASE_URL) {
    return { connectionString: process.env.MIGRATION_DATABASE_URL, ssl: process.env.DB_SSL === 'true' };
  }
  if (process.env.IS_CRD_PLAIN !== 'true') {
    throw new Error('MIGRATION_DATABASE_URL is required when database credentials are encrypted');
  }
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME || process.env.DB_NAME_DEVELOPMENT,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  };
}

function files() {
  return fs.readdirSync(migrationsDirectory)
    .filter((name) => migrationPattern.test(name))
    .sort()
    .map((name) => {
      const sql = fs.readFileSync(path.join(migrationsDirectory, name), 'utf8');
      return {
        version: name.match(migrationPattern)[1],
        name,
        sql,
        checksum: crypto.createHash('sha256').update(sql).digest('hex'),
      };
    });
}

function transactionalSql(migration) {
  const withoutBegin = migration.sql.replace(/^\uFEFF?\s*BEGIN;\s*/i, '');
  const withoutCommit = withoutBegin.replace(/\s*COMMIT;\s*$/i, '');
  if (withoutBegin === migration.sql || withoutCommit === withoutBegin) {
    throw new Error(`${migration.name} must have one outer BEGIN/COMMIT transaction`);
  }
  return withoutCommit;
}

async function assertBaselineEligible(client, through, available) {
  if (!/^\d{3}$/.test(through || '')) {
    throw new Error('Use --baseline-through=NNN with the exact verified migration version');
  }
  if (!available.some((migration) => migration.version === through)) {
    throw new Error(`Baseline migration ${through} does not exist`);
  }
  const result = await client.query(`SELECT
    to_regclass('public.admin_users') IS NOT NULL AS admin_auth,
    to_regclass('public.sw_tbl_accounting_entry') IS NOT NULL AS accounting,
    to_regclass('kyc.cases') IS NOT NULL AS kyc,
    to_regclass('public.sw_tbl_eod_schedule') IS NOT NULL AS eod,
    to_regclass('public.mr_finify_interactions') IS NOT NULL AS assistant`);
  if (!Object.values(result.rows[0]).every(Boolean)) {
    throw new Error('Database does not contain every verified baseline marker; baseline was refused');
  }
}

async function main() {
  const client = new Client(connectionConfig());
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock(2026080201)');
    await client.query(`CREATE TABLE IF NOT EXISTS public.finify_schema_migrations (
      version varchar(3) PRIMARY KEY,
      name text NOT NULL UNIQUE,
      checksum_sha256 char(64) NULL,
      applied_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      applied_by text NOT NULL DEFAULT CURRENT_USER
    )`);
    const available = files();
    const existing = await client.query(
      'SELECT version,name,checksum_sha256 FROM public.finify_schema_migrations ORDER BY version',
    );

    if (!existing.rowCount && baselineThrough) {
      await assertBaselineEligible(client, baselineThrough, available);
      await client.query('BEGIN');
      try {
        for (const migration of available.filter((item) => item.version <= baselineThrough)) {
          await client.query(
            `INSERT INTO public.finify_schema_migrations(version,name,checksum_sha256)
             VALUES($1,$2,$3)`,
            [migration.version, migration.name, migration.checksum],
          );
          console.log(`BASELINED ${migration.name}`);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    } else if (!existing.rowCount) {
      const marker = await client.query("SELECT to_regclass('public.admin_users') AS migrated");
      if (marker.rows[0].migrated) {
        throw new Error('Existing migrated database has no ledger; verify it and use --baseline-through=NNN');
      }
    }

    const applied = new Map((await client.query(
      'SELECT version,name,checksum_sha256 FROM public.finify_schema_migrations',
    )).rows.map((row) => [row.version, row]));

    for (const migration of available) {
      const recorded = applied.get(migration.version);
      if (recorded) {
        if (recorded.name !== migration.name) throw new Error(`Migration ${migration.version} name changed`);
        if (recorded.checksum_sha256 && recorded.checksum_sha256.trim() !== migration.checksum) {
          throw new Error(`Applied migration ${migration.name} was modified`);
        }
        if (!recorded.checksum_sha256) {
          await client.query(
            'UPDATE public.finify_schema_migrations SET checksum_sha256=$2 WHERE version=$1',
            [migration.version, migration.checksum],
          );
        }
        console.log(`SKIP ${migration.name}`);
        continue;
      }
      try {
        await client.query('BEGIN');
        await client.query(transactionalSql(migration));
        await client.query(
          `INSERT INTO public.finify_schema_migrations(version,name,checksum_sha256)
           VALUES($1,$2,$3)`,
          [migration.version, migration.name, migration.checksum],
        );
        await client.query('COMMIT');
        console.log(`APPLIED ${migration.name}`);
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw new Error(`Migration ${migration.name} failed: ${error.message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(2026080201)').catch(() => undefined);
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
