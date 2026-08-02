'use strict';

require('dotenv').config();
const { Client } = require('pg');

const execute = process.argv.includes('--execute');
const batchArgument = process.argv.find((value) => value.startsWith('--batch-size='));
const countryArgument = process.argv.find((value) => value.startsWith('--country='));
const documentArgument = process.argv.find((value) => value.startsWith('--document-type='));
const batchSize = Math.max(1, Math.min(Number(batchArgument?.split('=')[1] || 1000), 10_000));
const country = String(countryArgument?.split('=')[1] || 'UGA').toUpperCase();
const documentType = String(documentArgument?.split('=')[1] || 'UGANDA_NATIONAL_ID').toUpperCase();

if (!/^[A-Z]{3}$/.test(country)) throw new Error('Use --country=AAA');
if (!['UGANDA_NATIONAL_ID', 'PASSPORT'].includes(documentType)) {
  throw new Error('Supported document types are UGANDA_NATIONAL_ID and PASSPORT');
}

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

async function countCandidates(client) {
  const result = await client.query(
    `SELECT count(DISTINCT wallet.owner_msisdn)::int AS count
     FROM public."SW_TBL_WALLET" wallet
     JOIN public."SW_TBL_WALLET_TYPE" type ON type."Wallet_ID"=wallet."Wallet_Code"
     JOIN public."SW_TBL_PROFILE_CUST" profile ON profile."MSISDN"=wallet.owner_msisdn
     WHERE wallet.owner_type='CUSTOMER' AND wallet."Status"<>6
       AND type."Is_Kyc_Needed"
       AND NOT EXISTS (
         SELECT 1 FROM kyc.cases cases WHERE cases.customer_msisdn=wallet.owner_msisdn
       )`,
  );
  return Number(result.rows[0]?.count || 0);
}

async function processBatch(client) {
  const result = await client.query(
    `WITH candidates AS MATERIALIZED (
       SELECT DISTINCT wallet.owner_msisdn
       FROM public."SW_TBL_WALLET" wallet
       JOIN public."SW_TBL_WALLET_TYPE" type ON type."Wallet_ID"=wallet."Wallet_Code"
       JOIN public."SW_TBL_PROFILE_CUST" profile ON profile."MSISDN"=wallet.owner_msisdn
       WHERE wallet.owner_type='CUSTOMER' AND wallet."Status"<>6
         AND type."Is_Kyc_Needed"
         AND NOT EXISTS (
           SELECT 1 FROM kyc.cases cases WHERE cases.customer_msisdn=wallet.owner_msisdn
         )
       ORDER BY wallet.owner_msisdn LIMIT $1
     ), inserted AS (
       INSERT INTO kyc.cases(
         customer_msisdn,document_type,issuing_country,status,created_by)
       SELECT owner_msisdn,$2,$3,'DRAFT','KYC_RECONCILIATION'
       FROM candidates
       RETURNING id,customer_msisdn
     ), audited AS (
       INSERT INTO kyc.review_audit(
         case_id,action,previous_status,new_status,reason,actor_id)
       SELECT id,'CREATE',NULL,'DRAFT',
              'Created by controlled reconciliation for an existing KYC-required wallet',
              'KYC_RECONCILIATION'
       FROM inserted RETURNING case_id
     ), linked_openings AS (
       UPDATE public.customer_account_opening_requests opening
       SET kyc_case_id=inserted.id,updated_at=CURRENT_TIMESTAMP
       FROM inserted
       WHERE opening.customer_msisdn=inserted.customer_msisdn
         AND opening.kyc_required AND opening.status<>'OPENED'
       RETURNING opening.id
     )
     SELECT count(*)::int AS count FROM inserted`,
    [batchSize, documentType, country],
  );
  return Number(result.rows[0]?.count || 0);
}

async function main() {
  const client = new Client(connectionConfig());
  await client.connect();
  try {
    const candidates = await countCandidates(client);
    console.log(JSON.stringify({ mode: execute ? 'EXECUTE' : 'DRY_RUN', candidates, batchSize, documentType, country }));
    if (!execute || !candidates) return;
    await client.query('SELECT pg_advisory_lock(2026080202)');
    let total = 0;
    while (true) {
      await client.query('BEGIN');
      try {
        const processed = await processBatch(client);
        await client.query('COMMIT');
        total += processed;
        console.log(JSON.stringify({ processed, total }));
        if (processed < batchSize) break;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    console.log(JSON.stringify({ status: 'COMPLETE', total }));
  } finally {
    try { await client.query('SELECT pg_advisory_unlock(2026080202)'); } catch {}
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
