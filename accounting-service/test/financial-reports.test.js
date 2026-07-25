const test = require('node:test');
const assert = require('node:assert/strict');
const { TrialBalanceService } = require('../dist/financial-statements/trial-balance.service');
const { BalanceSheetService } = require('../dist/financial-statements/balance-sheet.service');
const { IncomeStatementService } = require('../dist/financial-statements/income-statement.service');
const { FxTranslationService } = require('../dist/financial-statements/fx-translation.service');
const { AccountStatementService } = require('../dist/account-statements/account-statement.service');
const { CsvReportService } = require('../dist/common/csv-report.service');

test('trial balance reports balanced persisted movements', async () => {
  const service = new TrialBalanceService({ query: async () => [
    { account_code: '1000', total_debit: '25.00', total_credit: '0.00' },
    { account_code: '2000', total_debit: '0.00', total_credit: '25.00' },
  ] });
  const result = await service.get('2026-07-25', 'gbp', 'FINIFY_UK');
  assert.equal(result.totalDebit, '25.00');
  assert.equal(result.totalCredit, '25.00');
  assert.equal(result.balanced, true);
});

test('balance sheet includes current-period profit in its balance control', async () => {
  let call = 0;
  const service = new BalanceSheetService({ query: async () => ++call === 1
    ? [{ account_type: 'ASSET', amount: '120' }, { account_type: 'LIABILITY', amount: '70' },
       { account_type: 'EQUITY', amount: '40' }]
    : [{ account_type: 'INCOME', amount: '15' }, { account_type: 'EXPENSE', amount: '5' }] });
  const result = await service.get('2026-07-25', 'GBP', 'FINIFY_UK');
  assert.equal(result.currentPeriodProfit, '10.00');
  assert.equal(result.balanced, true);
});

test('income statement calculates profit and rejects reversed date ranges', async () => {
  const service = new IncomeStatementService({ query: async () => [
    { account_type: 'INCOME', amount: '100' }, { account_type: 'EXPENSE', amount: '35' },
  ] });
  assert.equal((await service.get('2026-07-01', '2026-07-31', 'GBP', 'FINIFY_UK')).profitOrLoss, '65.00');
  await assert.rejects(() => service.get('2026-08-01', '2026-07-31', 'GBP', 'FINIFY_UK'));
});

test('consolidated balance sheet identifies missing approved FX rates', async () => {
  const service = new FxTranslationService({ query: async () => [
    { currency: 'GBP', amount: '10', fx_rate: '1' },
    { currency: 'EUR', amount: '20', fx_rate: null },
  ] });
  const result = await service.consolidatedBalanceSheet('2026-07-25', 'FINIFY_UK', 'GBP');
  assert.equal(result.complete, false);
  assert.deepEqual(result.missingRates, ['EUR']);
});

test('wallet statement returns daily closing balances and ledger entries', async () => {
  let call = 0;
  const service = new AccountStatementService({ query: async () => {
    call += 1;
    if (call === 1) return [{ wallet: '447700900123', currentBalance: '15.00' }];
    if (call === 2) return [{ transaction_id: '1' }];
    return [{ businessDate: '2026-07-25', closingBalance: '15.00' }];
  } });
  const result = await service.get('447700900123', '2026-07-01', '2026-07-31', 'GBP');
  assert.equal(result.dailyBalances.length, 1);
  assert.equal(result.entries.length, 1);
});

test('CSV report export escapes commas, quotes and line breaks', () => {
  const csv = new CsvReportService().serialize([{ account: 'Cash, UK', note: 'A \"quoted\" value' }]);
  assert.match(csv, /\"Cash, UK\"/);
  assert.match(csv, /\"A \"\"quoted\"\" value\"/);
});
