const test = require('node:test');
const assert = require('node:assert/strict');
const { ConflictException } = require('@nestjs/common');
const { AccountingConfigService } = require('../dist/accounting-config/accounting-config.service');

const input = {
  currency: 'EUR',
  baseCurrency: 'GBP',
  reportingEntity: 'FINIFY_UK',
  businessTimezone: 'Europe/London',
  cutoffTime: '00:00:00',
  effectiveFrom: '2026-07-31',
  requestedBy: 'maker.user',
  approvedBy: 'checker.user',
};

test('new currency provisioning creates all five wallets before its configuration', async () => {
  let nextId = 990000000100;
  const createdCodes = [];
  const manager = {
    query: async (sql, values = []) => {
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('FROM public.sw_tbl_accounting_configuration')
        && sql.includes('LIMIT 1')) return [];
      if (sql.includes('FROM public.admin_users')) {
        return [{ username: 'maker.user' }, { username: 'checker.user' }];
      }
      if (sql.includes('SELECT 1 FROM public.sw_tbl_accounting_configuration')) return [{ exists: 1 }];
      if (sql.includes('FROM public."SW_TBL_WALLET_TYPE"')) {
        return [105, 110, 113, 114, 115].map(Wallet_ID => ({ Wallet_ID }));
      }
      if (sql.includes('FROM public."SW_TBL_WALLET"')) return [];
      if (sql.includes("nextval('public.sw_wallet_account_number_seq')")) {
        return [{ id: String(nextId++) }];
      }
      if (sql.includes('INSERT INTO public."SW_TBL_WALLET"')) {
        createdCodes.push(values[1]);
        return [{
          walletId: values[0],
          walletCode: values[1],
          purpose: values[4],
          balance: '0',
          currency: values[3],
        }];
      }
      if (sql.includes('INSERT INTO public.sw_tbl_accounting_configuration')) {
        assert.deepEqual(createdCodes, [105, 110, 113, 114, 115]);
        return [{ id: '9', currency: 'EUR', masterWallet: values[5] }];
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const service = new AccountingConfigService({
    transaction: callback => callback(manager),
  });

  const result = await service.provisionCurrency(input);

  assert.equal(result.configuration.currency, 'EUR');
  assert.equal(result.wallets.length, 5);
  assert.deepEqual(result.wallets.map(wallet => wallet.walletCode), [105, 110, 113, 114, 115]);
});

test('new currency provisioning rejects an existing active currency before wallet creation', async () => {
  let walletCreated = false;
  const manager = {
    query: async sql => {
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('FROM public.sw_tbl_accounting_configuration')
        && sql.includes('LIMIT 1')) return [{ id: '3' }];
      if (sql.includes('INSERT INTO public."SW_TBL_WALLET"')) walletCreated = true;
      return [];
    },
  };
  const service = new AccountingConfigService({
    transaction: callback => callback(manager),
  });

  await assert.rejects(() => service.provisionCurrency(input), ConflictException);
  assert.equal(walletCreated, false);
});
