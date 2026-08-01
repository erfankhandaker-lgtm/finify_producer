const path = require('node:path');
const { createDecipheriv, createHmac, randomInt } = require('node:crypto');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const legacyKey = '3zTvzr3p67VC61jmV54rIYu1545x4TlY';
const legacyIv = '60iP0h6vJoEa';
const actor = 'CREDIT_E2E_SEED';
const currency = (process.env.E2E_CUSTOMER_WALLET_CURRENCY || 'UGX').trim().toUpperCase();
const suppliedPin = process.env.E2E_CUSTOMER_PIN?.trim();
const testPin = suppliedPin || String(randomInt(100000, 1000000));

if (!/^[0-9]{4,12}$/.test(testPin)) {
  throw new Error('E2E_CUSTOMER_PIN must contain between 4 and 12 digits');
}
if (!/^[A-Z]{3}$/.test(currency)) {
  throw new Error('E2E_CUSTOMER_WALLET_CURRENCY must be a three-letter currency code');
}
if (!process.env.AUTH_MODULE) {
  throw new Error('AUTH_MODULE is required to generate test wallet PIN hashes');
}

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
  const client = new Client({
    host: credential(process.env.DB_HOST),
    port: Number(credential(process.env.DB_PORT) || 5432),
    user: credential(process.env.DB_USER),
    password: credential(process.env.DB_PASS),
    database: credential(process.env.DB_NAME || process.env.DB_NAME_DEVELOPMENT),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  const pinHash = createHmac('sha256', process.env.AUTH_MODULE).update(testPin).digest('hex');
  await client.connect();

  try {
    const prerequisites = await client.query(
      `SELECT
         to_regclass('public.credit_scored_customers') IS NOT NULL AS scored,
         to_regclass('public."SW_TBL_PROFILE_CUST"') IS NOT NULL AS profiles,
         to_regclass('public."SW_TBL_WALLET"') IS NOT NULL AS wallets,
         to_regclass('public.sw_tbl_wallet_operation_audit') IS NOT NULL AS audit`,
    );
    if (Object.values(prerequisites.rows[0]).some((value) => !value)) {
      throw new Error('Scored-customer, profile, wallet, and audit tables are required');
    }
    const types = await client.query(
      `SELECT "Wallet_ID" AS id FROM public."SW_TBL_WALLET_TYPE"
       WHERE "Wallet_Type"=100 AND "Wallet_ID" IN (103,111)`,
    );
    if (new Set(types.rows.map((row) => Number(row.id))).size !== 2) {
      throw new Error('Verified wallet type 103 and unverified wallet type 111 are required');
    }

    const collision = await client.query(
      `WITH source AS (
         SELECT DISTINCT regexp_replace(COALESCE(msisdn,''),'[^0-9]','','g') AS owner
         FROM public.credit_scored_customers
       )
       SELECT count(*)::integer AS count
       FROM source
       JOIN public."SW_TBL_WALLET" wallet ON wallet."Wallet_MSISDN"::text=source.owner
       WHERE wallet.owner_msisdn::text<>source.owner OR wallet.owner_type<>'CUSTOMER'`,
    );
    if (collision.rows[0].count) {
      throw new Error(`${collision.rows[0].count} scored-customer MSISDNs collide with another wallet owner`);
    }

    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('scored_customer_wallet_provision'))`);
    try {
      const profileResult = await client.query(
        `WITH ranked AS (
           SELECT scored.*,
                  regexp_replace(COALESCE(scored.msisdn,''),'[^0-9]','','g') AS owner,
                  row_number() OVER (
                    PARTITION BY regexp_replace(COALESCE(scored.msisdn,''),'[^0-9]','','g')
                    ORDER BY scored.updated_at DESC,scored._id DESC
                  ) AS owner_rank
           FROM public.credit_scored_customers scored
         ), source AS (
           SELECT *,
             CASE WHEN lower(COALESCE(kyc_status,'')) IN
               ('true','verified','approved','complete','completed','1','yes')
               THEN 103 ELSE 111 END AS wallet_code
           FROM ranked WHERE owner_rank=1 AND owner~'^[0-9]{8,15}$'
         )
         INSERT INTO public."SW_TBL_PROFILE_CUST"(
           "MSISDN","First_Name","Last_Name","Email","ID_Type","ID_Number","PIN",
           "Status","KYC_Status","Gender","DOB","Created_By","Created_Date",
           "Approved_By","Approved_Date","Address"
         )
         SELECT owner::bigint,
                NULLIF(COALESCE(NULLIF(first_name,''),NULLIF(given_name,''),name),''),
                NULLIF(last_name,''),
                NULLIF(email,''),
                CASE
                  WHEN NULLIF(COALESCE(NULLIF(national_id,''),nin),'') IS NOT NULL
                  THEN 'NATIONAL_ID'
                END,
                NULLIF(COALESCE(NULLIF(national_id,''),nin),''),
                $1,0,CASE WHEN wallet_code=103 THEN 2 ELSE 0 END,
                NULLIF(left(upper(gender),1),''),
                dob::date,$2::varchar,CURRENT_TIMESTAMP,
                CASE WHEN wallet_code=103 THEN $2::varchar END,
                CASE WHEN wallet_code=103 THEN CURRENT_TIMESTAMP END,
                NULLIF(concat_ws(', ',NULLIF(addressline1,''),NULLIF(city,''),NULLIF(district,'')),'')
         FROM source
         ON CONFLICT ("MSISDN") DO NOTHING
         RETURNING "MSISDN"`,
        [pinHash, actor],
      );
      const profileCredentialResult = await client.query(
        `UPDATE public."SW_TBL_PROFILE_CUST" profile
         SET "PIN"=$1,"Modified_By"=$2,"Modified_Date"=CURRENT_TIMESTAMP
         WHERE profile."PIN" IS NULL
           AND EXISTS (
             SELECT 1
             FROM public.credit_scored_customers scored
             WHERE regexp_replace(COALESCE(scored.msisdn,''),'[^0-9]','','g')
                   =profile."MSISDN"::text
           )
         RETURNING profile."MSISDN"`,
        [pinHash, actor],
      );
      const walletCredentialResult = await client.query(
        `UPDATE public."SW_TBL_WALLET" wallet
         SET pin=$1,"Modified_By"=$2,"Modified_Date"=CURRENT_TIMESTAMP
         WHERE wallet.pin IS NULL
           AND wallet.owner_type='CUSTOMER'
           AND EXISTS (
             SELECT 1
             FROM public.credit_scored_customers scored
             WHERE regexp_replace(COALESCE(scored.msisdn,''),'[^0-9]','','g')
                   =wallet.owner_msisdn::text
           )
         RETURNING wallet."Wallet_MSISDN"`,
        [pinHash, actor],
      );

      const walletResult = await client.query(
        `WITH ranked AS (
           SELECT scored.*,
                  regexp_replace(COALESCE(scored.msisdn,''),'[^0-9]','','g') AS owner,
                  row_number() OVER (
                    PARTITION BY regexp_replace(COALESCE(scored.msisdn,''),'[^0-9]','','g')
                    ORDER BY scored.updated_at DESC,scored._id DESC
                  ) AS owner_rank
           FROM public.credit_scored_customers scored
         ), source AS (
           SELECT owner,
             CASE WHEN lower(COALESCE(kyc_status,'')) IN
               ('true','verified','approved','complete','completed','1','yes')
               THEN 103 ELSE 111 END AS wallet_code
           FROM ranked WHERE owner_rank=1 AND owner~'^[0-9]{8,15}$'
         ), inserted AS (
           INSERT INTO public."SW_TBL_WALLET"(
             "Wallet_MSISDN","Wallet_Code","Amount","Created_Date","Created_By",
             "Status","Mobile_Number",commission_balance,pin,is_default,currency,
             owner_msisdn,owner_type,wallet_purpose
           )
           SELECT source.owner::bigint,source.wallet_code,0,CURRENT_TIMESTAMP,$2,0,
                  source.owner::bigint,0,$1,true,$3,
                  source.owner::bigint,'CUSTOMER','CUSTOMER_MAIN'
           FROM source
           JOIN public."SW_TBL_PROFILE_CUST" profile
             ON profile."MSISDN"::text=source.owner AND profile."Status"=0
           WHERE NOT EXISTS (
             SELECT 1 FROM public."SW_TBL_WALLET" wallet
             WHERE wallet.owner_msisdn::text=source.owner
               AND wallet.owner_type='CUSTOMER'
               AND wallet.wallet_purpose='CUSTOMER_MAIN'
               AND upper(wallet.currency)=$3
               AND wallet."Status"<>6
           )
           ON CONFLICT ("Wallet_MSISDN") DO NOTHING
           RETURNING "Wallet_MSISDN",owner_msisdn,"Wallet_Code","Amount",
                     "Status",is_default,currency,wallet_purpose
         ), audited AS (
           INSERT INTO public.sw_tbl_wallet_operation_audit(
             wallet_msisdn,owner_msisdn,operation,previous_state,new_state,
             reason,actor_type,actor_id
           )
           SELECT "Wallet_MSISDN",owner_msisdn,'CREATE',NULL,
                  jsonb_build_object(
                    'walletId',"Wallet_MSISDN"::text,
                    'ownerMsisdn',owner_msisdn::text,
                    'walletCode',"Wallet_Code",
                    'balance',"Amount",
                    'status',"Status",
                    'isDefault',is_default,
                    'currency',currency,
                    'purpose',wallet_purpose
                  ),
                  'Provisioned for scored-customer end-to-end testing',
                  'SYSTEM',$2
           FROM inserted
           RETURNING id
         )
         SELECT count(*)::integer AS created,
                (SELECT count(*)::integer FROM audited) AS audited
         FROM inserted`,
        [pinHash, actor, currency],
      );
      await client.query('COMMIT');

      const summary = await client.query(
        `WITH source AS (
           SELECT DISTINCT regexp_replace(COALESCE(msisdn,''),'[^0-9]','','g') AS owner
           FROM public.credit_scored_customers
           WHERE regexp_replace(COALESCE(msisdn,''),'[^0-9]','','g')~'^[0-9]{8,15}$'
         )
         SELECT
           (SELECT count(*) FROM source)::integer AS scored_customers,
           (SELECT count(*) FROM source JOIN public."SW_TBL_PROFILE_CUST" profile
             ON profile."MSISDN"::text=source.owner WHERE profile."Status"=0)::integer AS active_profiles,
           (SELECT count(*) FROM source JOIN public."SW_TBL_WALLET" wallet
             ON wallet.owner_msisdn::text=source.owner
             WHERE wallet.owner_type='CUSTOMER'
               AND wallet.wallet_purpose='CUSTOMER_MAIN'
               AND upper(wallet.currency)=$1
               AND wallet."Status"=0)::integer AS active_main_wallets,
           (SELECT count(*) FROM source JOIN public."SW_TBL_WALLET" wallet
             ON wallet.owner_msisdn::text=source.owner
             WHERE wallet.owner_type='CUSTOMER' AND wallet."Amount"<>0)::integer AS nonzero_balances`,
        [currency],
      );
      const createdWallets = walletResult.rows[0].created;
      console.log(JSON.stringify({
        profilesCreated: profileResult.rowCount,
        profileCredentialsInitialized: profileCredentialResult.rowCount,
        walletsCreated: createdWallets,
        walletCredentialsInitialized: walletCredentialResult.rowCount,
        auditRowsCreated: walletResult.rows[0].audited,
        currency,
        ...summary.rows[0],
        testPin: createdWallets > 0 ? testPin : undefined,
      }));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
