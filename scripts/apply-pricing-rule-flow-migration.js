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
  const migration = path.resolve(__dirname, '../database/migrations/017_pricing_rule_flows.sql');
  const verification = path.resolve(__dirname, '../database/migrations/017_pricing_rule_flows.verify.sql');
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
    await client.query(fs.readFileSync(migration, 'utf8'));
    const verificationResult = await client.query(fs.readFileSync(verification, 'utf8'));
    const result = Array.isArray(verificationResult)
      ? verificationResult[verificationResult.length - 1]
      : verificationResult;
    console.log(result?.rows?.[0]?.result || 'Pricing rule flow migration applied and verified.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
