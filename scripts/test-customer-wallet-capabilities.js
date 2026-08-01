const { NestFactory } = require('@nestjs/core');
const { DataSource } = require('typeorm');
const { AppModule } = require('/app/dist/src/app.module');
const { WalletService } = require('/app/dist/src/modules/wallets/wallet.service');

const customerId = '447700999998';
const actor = 'CUSTOMER_WALLET_TEST_ADMIN';

async function cleanup(dataSource) {
  await dataSource.transaction(async manager => {
    await manager.query(
      `DELETE FROM public.sw_tbl_wallet_operation_audit WHERE owner_msisdn=$1::bigint`,
      [customerId],
    );
    await manager.query(
      `DELETE FROM public.customer_profile_operation_audit WHERE customer_msisdn=$1::bigint`,
      [customerId],
    );
    await manager.query(
      `DELETE FROM public."SW_TBL_WALLET"
       WHERE owner_type='CUSTOMER' AND owner_msisdn=$1::bigint`,
      [customerId],
    );
    await manager.query(
      `DELETE FROM public."SW_TBL_PROFILE_CUST" WHERE "MSISDN"=$1::bigint`,
      [customerId],
    );
  });
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const dataSource = app.get(DataSource);
  const wallets = app.get(WalletService);
  try {
    await cleanup(dataSource);
    const created = await wallets.createCustomer({
      msisdn: customerId,
      firstName: 'Wallet',
      lastName: 'Capability Test',
      email: 'wallet-capability@example.test',
      address: 'Test only',
      defaultCurrency: 'GBP',
      iban: 'GB82 WEST 1234 5698 7654 32',
      swiftBic: 'DEUTDEFF500',
    }, actor);
    const additional = await wallets.createAdditionalForAdmin(customerId, {
      walletCode: 103,
      currency: 'USD',
      iban: 'GB33 BUKB 2020 1555 5555 55',
      swiftBic: 'NWBKGB2L',
    }, actor);
    const selected = await wallets.setDefaultForAdmin(additional.walletId, actor);
    const routing = await wallets.updateRoutingForAdmin(additional.walletId, {
      iban: 'GB33 BUKB 2020 1555 5555 55',
      swiftBic: 'NWBKGB2LXXX',
    }, actor);
    const rows = await dataSource.query(
      `SELECT "Wallet_MSISDN"::text AS "walletId",currency,is_default AS "isDefault",
              wallet_purpose AS purpose,iban,swift_bic AS "swiftBic","Amount"::numeric AS balance
       FROM public."SW_TBL_WALLET"
       WHERE owner_type='CUSTOMER' AND owner_msisdn=$1::bigint
       ORDER BY currency`,
      [customerId],
    );
    process.stdout.write(`${JSON.stringify({
      createdWallet: created.wallet.walletId,
      additionalWallet: additional.walletId,
      selectedDefaultCurrency: selected.currency,
      routing,
      wallets: rows,
    }, null, 2)}\n`);
  } finally {
    await cleanup(dataSource);
    await app.close();
  }
}

main().then(() => process.exit(0)).catch(error => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exit(1);
});
