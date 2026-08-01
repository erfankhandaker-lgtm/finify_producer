const fs = require('node:fs');
const path = require('node:path');
const { createDecipheriv } = require('node:crypto');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const legacyKey = '3zTvzr3p67VC61jmV54rIYu1545x4TlY';
const legacyIv = '60iP0h6vJoEa';

function credential(value) {
  if (!value || process.env.IS_CRD_PLAIN === 'true') return value;
  const encrypted = JSON.parse(value);
  const decipher = createDecipheriv(
    'aes-256-gcm',
    process.env.CREDENTIAL_ENCRYPTION_KEY || legacyKey,
    process.env.CREDENTIAL_ENCRYPTION_IV || legacyIv,
  );
  decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'));
  return decipher.update(encrypted.content, 'hex', 'utf8') + decipher.final('utf8');
}

async function main() {
  const migrationPath = path.resolve(__dirname, '../database/migrations/016_admin_operations.sql');
  const verification = `
    SELECT
      to_regclass('public.customer_profile_operation_audit') IS NOT NULL AS profile_audit,
      to_regclass('public.aml_cases') IS NOT NULL AS aml_cases,
      (SELECT count(*) FROM public.admin_permissions
       WHERE code IN ('customers.manage','charges.read','commissions.read','accounting.read','aml.read')) AS permissions
  `;
  const client = new Client({
    host: credential(process.env.DB_HOST),
    port: Number(credential(process.env.DB_PORT) || 5432),
    user: credential(process.env.DB_USER),
    password: credential(process.env.DB_PASS),
    database: credential(process.env.DB_NAME || process.env.DB_NAME_DEVELOPMENT),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    await client.query(fs.readFileSync(migrationPath, 'utf8'));
    const { rows } = await client.query(verification);
    if (!rows[0]?.profile_audit || !rows[0]?.aml_cases || Number(rows[0]?.permissions) !== 5) {
      throw new Error('Admin operations migration verification failed');
    }
    console.log('Admin operations migration applied and verified.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
