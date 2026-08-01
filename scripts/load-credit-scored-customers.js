const fs = require('node:fs');
const path = require('node:path');
const { createDecipheriv } = require('node:crypto');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const legacyKey = '3zTvzr3p67VC61jmV54rIYu1545x4TlY';
const legacyIv = '60iP0h6vJoEa';
const inputFile = process.argv[2] ? path.resolve(process.argv[2]) : null;

if (!inputFile) {
  throw new Error('Usage: node scripts/load-credit-scored-customers.js <input.tsv>');
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

function identifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe input column ${value}`);
  }
  return `"${value}"`;
}

function parseInput(file) {
  const lines = fs.readFileSync(file, 'utf8').replace(/\r/g, '').split('\n');
  while (lines.length && !lines.at(-1)) lines.pop();
  if (lines.length < 2) throw new Error('The TSV file has no data rows');
  const headers = lines[0].split('\t');
  if (new Set(headers).size !== headers.length) throw new Error('The TSV header contains duplicate columns');
  const rows = lines.slice(1).filter(Boolean).map((line, index) => {
    const values = line.split('\t');
    if (values.length !== headers.length) {
      throw new Error(`TSV row ${index + 2} has ${values.length} values; expected ${headers.length}`);
    }
    return values;
  });
  return { headers, rows };
}

function convert(value, dataType, rowNumber, column) {
  if (value === '') return null;
  try {
    if (dataType === 'jsonb' || dataType === 'json') return JSON.stringify(JSON.parse(value));
    if (dataType === 'bigint' || dataType === 'integer' || dataType === 'smallint') {
      if (!/^-?\d+$/.test(value)) throw new Error('not an integer');
      return value;
    }
    if (['double precision', 'real', 'numeric', 'decimal'].includes(dataType)) {
      const number = Number(value);
      if (!Number.isFinite(number)) throw new Error('not numeric');
      return number;
    }
    if (dataType === 'boolean') {
      const normalized = value.trim().toLowerCase();
      if (['true', 't', '1', 'yes', 'y'].includes(normalized)) return true;
      if (['false', 'f', '0', 'no', 'n'].includes(normalized)) return false;
      throw new Error('not boolean');
    }
    if (dataType.startsWith('timestamp')) {
      if (!Number.isFinite(new Date(value).getTime())) throw new Error('not a timestamp');
      return value;
    }
    return value;
  } catch (error) {
    throw new Error(`Invalid ${dataType} at TSV row ${rowNumber}, column ${column}: ${error.message}`);
  }
}

function categoryFor(headers, row) {
  const grade = row[headers.indexOf('score_grade')]?.trim();
  const band = row[headers.indexOf('band')]?.trim();
  return (grade || band || 'UNCLASSIFIED').toUpperCase();
}

async function main() {
  const { headers, rows } = parseInput(inputFile);
  const client = new Client({
    host: credential(process.env.DB_HOST),
    port: Number(credential(process.env.DB_PORT) || 5432),
    user: credential(process.env.DB_USER),
    password: credential(process.env.DB_PASS),
    database: credential(process.env.DB_NAME || process.env.DB_NAME_DEVELOPMENT),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  await client.connect();
  try {
    const metadataResult = await client.query(
      `SELECT column_name,data_type
       FROM information_schema.columns
       WHERE table_schema='public' AND table_name='credit_scored_customers'`,
    );
    if (!metadataResult.rowCount) throw new Error('public.credit_scored_customers does not exist');
    const types = new Map(metadataResult.rows.map((row) => [row.column_name, row.data_type]));
    const unknown = headers.filter((header) => !types.has(header));
    if (unknown.length) throw new Error(`Unknown target columns: ${unknown.join(', ')}`);
    if (!headers.includes('_id')) throw new Error('The TSV must include _id');

    const columns = [...headers, 'customer_category'];
    const idIndex = headers.indexOf('_id');
    const inputIds = rows.map((row) => row[idIndex]);
    const existingResult = await client.query(
      `SELECT count(*)::integer AS count
       FROM public.credit_scored_customers WHERE _id=ANY($1::bigint[])`,
      [inputIds],
    );
    const existing = existingResult.rows[0].count;
    let profilesCreated = 0;

    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('credit_scored_customers_import'))`);
    try {
      for (let offset = 0; offset < rows.length; offset += 10) {
        const batch = rows.slice(offset, offset + 10);
        const parameters = [];
        const tuples = batch.map((row, batchIndex) => {
          const converted = headers.map((header, columnIndex) =>
            convert(row[columnIndex], types.get(header), offset + batchIndex + 2, header)
          );
          converted.push(categoryFor(headers, row));
          const placeholders = converted.map((value) => {
            parameters.push(value);
            return `$${parameters.length}`;
          });
          return `(${placeholders.join(',')})`;
        });
        const updates = columns
          .filter((column) => column !== '_id')
          .map((column) => `${identifier(column)}=EXCLUDED.${identifier(column)}`)
          .join(',');
        await client.query(
          `INSERT INTO public.credit_scored_customers(${columns.map(identifier).join(',')})
           VALUES ${tuples.join(',')}
           ON CONFLICT (_id) DO UPDATE SET ${updates}`,
          parameters,
        );
      }
      const profileResult = await client.query(
        `WITH source AS (
           SELECT DISTINCT ON (
             regexp_replace(COALESCE(scored.msisdn,''),'[^0-9]','','g')
           )
             regexp_replace(COALESCE(scored.msisdn,''),'[^0-9]','','g') AS owner,
             scored.*
           FROM public.credit_scored_customers scored
           WHERE scored._id=ANY($1::bigint[])
             AND regexp_replace(COALESCE(scored.msisdn,''),'[^0-9]','','g')
                 ~ '^[0-9]{8,15}$'
           ORDER BY
             regexp_replace(COALESCE(scored.msisdn,''),'[^0-9]','','g'),
             scored.updated_at DESC,
             scored._id DESC
         )
         INSERT INTO public."SW_TBL_PROFILE_CUST"(
           "MSISDN","First_Name","Last_Name","Email","ID_Type","ID_Number",
           "Status","KYC_Status","Gender","DOB","Address","Created_By","Created_Date"
         )
         SELECT
           owner::bigint,
           NULLIF(COALESCE(NULLIF(first_name,''),NULLIF(given_name,''),name),''),
           NULLIF(last_name,''),
           NULLIF(email,''),
           CASE
             WHEN NULLIF(COALESCE(NULLIF(national_id,''),nin),'') IS NOT NULL
             THEN 'NATIONAL_ID'
           END,
           NULLIF(COALESCE(NULLIF(national_id,''),nin),''),
           0,
           CASE WHEN lower(COALESCE(kyc_status,'')) IN
             ('true','verified','approved','complete','completed','1','yes')
             THEN 2 ELSE 0 END,
           NULLIF(left(upper(gender),1),''),
           dob::date,
           NULLIF(concat_ws(', ',NULLIF(addressline1,''),NULLIF(city,''),NULLIF(district,'')),''),
           'CREDIT_SCORE_IMPORT',
           CURRENT_TIMESTAMP
         FROM source
         ON CONFLICT ("MSISDN") DO NOTHING
         RETURNING "MSISDN"`,
        [inputIds],
      );
      profilesCreated = profileResult.rowCount;
      await client.query(
        `SELECT setval(
           pg_get_serial_sequence('public.credit_scored_customers','_id'),
           (SELECT max(_id) FROM public.credit_scored_customers),
           true
         )`,
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    const summary = await client.query(
      `SELECT count(*)::integer AS total,
              count(*) FILTER (WHERE customer_category='UNCLASSIFIED')::integer AS unclassified,
              count(*) FILTER (WHERE credit_limit>0)::integer AS with_credit_limit,
              min(credit_limit) AS minimum_credit_limit,
              max(credit_limit) AS maximum_credit_limit
       FROM public.credit_scored_customers`,
    );
    console.log(JSON.stringify({
      sourceRows: rows.length,
      inserted: rows.length - existing,
      updated: existing,
      profilesCreated,
      ...summary.rows[0],
    }));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
