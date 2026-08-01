const fs = require('fs');
const path = require('path');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('/app/dist/src/app.module');
const {
  AdminOperationsService,
} = require('/app/dist/src/modules/admin-operations/admin-operations.service');
const {
  TreasuryDocumentService,
} = require('/app/dist/src/modules/admin-operations/treasury-document.service');

async function main() {
  const evidenceDir = process.argv[2] || '/tmp/finify-safeguarding-evidence';
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const operations = app.get(AdminOperationsService);
    const documents = app.get(TreasuryDocumentService);
    const results = [];
    for (const currency of ['GBP', 'UGX', 'USD']) {
      const reference = `TEST-SAFE-20260731-${currency}`;
      const filePath = path.join(
        evidenceDir,
        `safeguarding-test-deposit-${currency.toLowerCase()}.pdf`,
      );
      const buffer = fs.readFileSync(filePath);
      const document = await documents.upload({
        fieldname: 'file',
        originalname: path.basename(filePath),
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: buffer.length,
        buffer,
      }, 'SAFEGUARDING_TEST_MAKER');
      const request = await operations.createTreasuryFunding({
        operation: 'ADD_SAFEGUARDING',
        currency,
        amount: '100000.00',
        reference,
        bankName: 'Finify Test Settlement Bank',
        bankAccount: `TEST-SAFEGUARDING-${currency}`,
        valueDate: '2026-07-31',
        evidenceReference: document.evidenceReference,
        evidenceDocumentId: document.id,
        comment: 'Multi-currency safeguarding funding for end-to-end testing',
      }, 'SAFEGUARDING_TEST_MAKER');
      const approved = await operations.reviewTreasuryFunding(
        request.id,
        'approve',
        'Approved test safeguarding funding',
        'SAFEGUARDING_TEST_CHECKER',
      );
      results.push({
        currency,
        requestId: request.id,
        documentId: document.id,
        reference,
        status: approved.status,
        balance: approved.wallet.balance,
      });
    }
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  } finally {
    await app.close();
  }
}

main().catch(error => {
  process.stderr.write(`${error?.stack || error}\n`);
  process.exitCode = 1;
});
