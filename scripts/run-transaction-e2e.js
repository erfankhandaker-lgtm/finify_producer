'use strict';

require('dotenv').config();
const crypto = require('node:crypto');
const { Client } = require('pg');

const producerUrl = process.env.E2E_PRODUCER_URL || 'http://127.0.0.1:5002/finify';
const consumerUrl = process.env.E2E_CONSUMER_URL || 'http://127.0.0.1:5003';
const customer = '447700920001';
const directMerchant = '447700910001';
const specialMerchant = '447700910002';
const pin = '1234';

const db = new Client({
  host: process.env.E2E_DB_HOST || '127.0.0.1',
  port: Number(process.env.LOCAL_POSTGRES_PORT || 5444),
  user: 'finify',
  password: 'finify_local_password',
  database: 'finify',
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) {
    throw new Error(`${init.method || 'GET'} ${url} failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function waitForTransaction(transactionId, expectedStatus, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await db.query(
      `SELECT "Transaction_Status"::int AS status,
              "Transaction_Fee"::numeric AS fee,
              "Transaction_Comm"::numeric AS commission,
              remarks
       FROM "SW_TBL_TRANSACTION_REQUEST"
       WHERE "Transaction_ID"=$1::bigint`,
      [transactionId],
    );
    const row = result.rows[0];
    if (row && Number(row.status) === expectedStatus) return row;
    if (row && Number(row.status) === 3) {
      throw new Error(`Transaction ${transactionId} failed: ${row.remarks || 'unknown reason'}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Transaction ${transactionId} did not reach status ${expectedStatus}`);
}

async function createPayment(token, destinationAccount, referenceId) {
  const response = await request(`${producerUrl}/transaction/process`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({
      amount: 100,
      pin,
      keyword: 'PMNT',
      sourceAccount: customer,
      destinationAccount,
      mobileNumber: customer,
      referenceId,
      currency: 'UGX',
    }),
  });
  const result = response.payload || response;
  assert(Number(result.Responsecode) === 200, `Payment submission failed: ${JSON.stringify(result)}`);
  return String(result.TransactionID);
}

async function main() {
  await db.connect();
  try {
    const localAuthSecret = process.env.AUTH_MODULE;
    assert(localAuthSecret, 'AUTH_MODULE is required to seed the local E2E PIN');
    const pinHash = crypto.createHmac('sha256', localAuthSecret).update(pin).digest('hex');
    await db.query(
      `UPDATE "SW_TBL_PROFILE_CUST"
       SET "PIN"=$2,"Fail_Attempt"=0,"Status"=0
       WHERE "MSISDN"=$1::bigint`,
      [customer, pinHash],
    );

    await request(`${consumerUrl}/v1/merchant-integrations/${specialMerchant}`, {
      method: 'PUT',
      body: JSON.stringify({
        channel: 'API',
        active: true,
        apiUrl: 'http://mock-merchant:5010/payments',
        apiMethod: 'POST',
        requestMapping: [
          { source: 'message.TransactionId', target: 'transactionId', location: 'body', required: true, type: 'string' },
          { source: 'message.Amount', target: 'amount', location: 'body', required: true, type: 'decimal' },
          { source: 'message.referenceId', target: 'reference', location: 'body', required: true, type: 'string' },
          { source: 'message.CHARGEAMOUNT', target: 'charge', location: 'body', required: true, type: 'decimal' },
          { source: 'message.COMMISSIONAMOUNT', target: 'commission', location: 'body', required: true, type: 'decimal' },
        ],
        responseMapping: {
          decisionPath: 'decision',
          approvedValues: ['APPROVED'],
          rejectedValues: ['REJECTED'],
          codePath: 'code',
          messagePath: 'message',
          externalReferencePath: 'externalReference',
        },
        auth: { type: 'NONE' },
        timeoutMs: 2000,
        maxRetries: 0,
        callbackAuthType: 'NONE',
        changedBy: 'LOCAL_E2E',
      }),
    });

    const login = await request(`${producerUrl}/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ username: customer, password: pin }),
    });
    const token = String(login.payload?.token || login.token || '');
    assert(token, 'Customer login did not return a token');

    const directId = await createPayment(token, directMerchant, 'E2E-DIRECT-REFUND');
    const direct = await waitForTransaction(directId, 5);
    assert(Number(direct.fee) > 0, 'Direct payment charge was not applied');
    assert(Number(direct.commission) > 0, 'Direct payment commission was not applied');

    const twoLegApprovedId = await createPayment(token, specialMerchant, 'E2E-LEG2-SUCCESS');
    const approved = await waitForTransaction(twoLegApprovedId, 5);
    assert(Number(approved.fee) > 0, 'Two-leg payment charge was not applied');
    assert(Number(approved.commission) > 0, 'Two-leg payment commission was not applied');

    const twoLegRejectedId = await createPayment(token, specialMerchant, 'E2E-LEG2-REJECT');
    const rejected = await waitForTransaction(twoLegRejectedId, 6);
    assert(Number(rejected.fee) > 0, 'Rejected two-leg payment did not capture its charge');
    assert(Number(rejected.commission) > 0, 'Rejected two-leg payment did not capture its commission');

    const refund = await request(`${consumerUrl}/v1/merchant-refunds`, {
      method: 'POST',
      body: JSON.stringify({
        originalTransactionId: directId,
        refundReference: 'REFUND-E2E-DIRECT-001',
        reason: 'End-to-end full merchant refund',
        requestedBy: 'LOCAL_E2E',
      }),
    });
    assert(refund.success === true && refund.status_code === 'REFUNDED', 'Merchant refund did not complete');

    const duplicateRefund = await request(`${consumerUrl}/v1/merchant-refunds`, {
      method: 'POST',
      body: JSON.stringify({
        originalTransactionId: directId,
        refundReference: 'REFUND-E2E-DIRECT-001',
        reason: 'Idempotency replay',
        requestedBy: 'LOCAL_E2E',
      }),
    });
    assert(duplicateRefund.idempotent === true, 'Duplicate refund was not idempotent');

    const refundId = String(refund.refund_transaction_id);
    const verification = await db.query(
      `SELECT
        (SELECT count(*) FROM "SW_TBL_TRANSACTION_REQUEST")::int AS transaction_count,
        (SELECT count(*) FROM "SW_TBL_TRANSACTION_REQUEST"
         WHERE "Transaction_Fee"::numeric>0 AND "Transaction_Comm"::numeric>0)::int AS priced_count,
        (SELECT count(*) FROM sw_tbl_accounting_journal)::int AS journal_count,
        (SELECT count(*) FROM (
          SELECT journal_id
          FROM sw_tbl_accounting_entry
          GROUP BY journal_id
          HAVING round(sum("Debit"),2)<>round(sum("Credit"),2)
        ) unbalanced)::int AS unbalanced_count,
        (SELECT count(*) FROM sw_tbl_merchant_refund)::int AS refund_count,
        (SELECT count(*) FROM sw_tbl_merchant_integration_attempt)::int AS merchant_attempt_count`,
    );
    const summary = verification.rows[0];
    assert(Number(summary.transaction_count) === 4, `Expected 4 transactions, found ${summary.transaction_count}`);
    assert(Number(summary.priced_count) === 4, `Expected all 4 transactions to retain charge and commission, found ${summary.priced_count}`);
    assert(Number(summary.journal_count) === 6, `Expected 6 journals, found ${summary.journal_count}`);
    assert(Number(summary.unbalanced_count) === 0, 'An accounting journal is unbalanced');
    assert(Number(summary.refund_count) === 1, 'Expected exactly one linked merchant refund');
    assert(Number(summary.merchant_attempt_count) === 2, 'Expected two mock merchant attempts');

    const balances = await db.query(
      `SELECT "Wallet_MSISDN"::text AS wallet,"Amount"::numeric AS balance
       FROM "SW_TBL_WALLET"
       WHERE "Wallet_MSISDN"=ANY($1::bigint[])
       ORDER BY "Wallet_MSISDN"`,
      [[customer, directMerchant, specialMerchant, '9800000105', '9800000113', '9800000114']],
    );
    const byWallet = new Map(balances.rows.map((row) => [row.wallet, Number(row.balance)]));
    assert(byWallet.get(customer) === 9895, `Unexpected customer balance ${byWallet.get(customer)}`);
    assert(byWallet.get(directMerchant) === 0, `Refund did not restore direct merchant balance`);
    assert(byWallet.get(specialMerchant) === 100, `Unexpected special merchant balance ${byWallet.get(specialMerchant)}`);
    assert(byWallet.get('9800000105') === 0, 'Temporary reserve wallet was not cleared');
    assert(byWallet.get('9800000113') === 10, 'Charge revenue balance is incorrect');
    assert(byWallet.get('9800000114') === 99995, 'Commission funding balance is incorrect');

    const aml = await db.query(
      `SELECT transactionid::text,status FROM sw_tbl_aml_transaction_reservation
       WHERE transactionid=ANY($1::bigint[]) ORDER BY transactionid`,
      [[directId, twoLegApprovedId, twoLegRejectedId]],
    );
    const amlStates = new Map(aml.rows.map((row) => [row.transactionid, row.status]));
    assert(amlStates.get(directId) === 'COMPLETED', 'Direct AML reservation was not completed');
    assert(amlStates.get(twoLegApprovedId) === 'COMPLETED', 'Two-leg AML reservation was not completed');
    assert(amlStates.get(twoLegRejectedId) === 'RELEASED', 'Rejected two-leg AML reservation was not released');

    console.log(JSON.stringify({
      directTransactionId: directId,
      twoLegApprovedTransactionId: twoLegApprovedId,
      twoLegRejectedTransactionId: twoLegRejectedId,
      refundTransactionId: refundId,
      transactions: Number(summary.transaction_count),
      journals: Number(summary.journal_count),
      allJournalsBalanced: true,
      chargesAndCommissionsPresent: true,
      duplicateRefundIdempotent: true,
      balances: Object.fromEntries(byWallet),
      aml: Object.fromEntries(amlStates),
    }, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
