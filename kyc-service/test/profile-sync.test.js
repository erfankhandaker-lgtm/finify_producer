const test = require('node:test');
const assert = require('node:assert/strict');
const { KycService } = require('../dist/kyc.service');

test('KYC approval synchronizes verified identity fields and approved case to customer profile', async () => {
  const calls = [];
  const caseId = '04300000-0000-4000-8000-000000000043';
  const client = {
    query: async (sql, parameters = []) => {
      calls.push({ sql, parameters });
      if (sql.includes('SELECT status,created_by,customer_msisdn')) {
        return { rows: [{
          status: 'MANUAL_REVIEW',
          created_by: 'maker',
          customer_msisdn: '256700000043',
          document_type: 'UGANDA_NATIONAL_ID',
          extracted_data: {
            firstName: 'Amina', lastName: 'Nsubuga', idNumber: 'CM123456789012',
            dateOfBirth: '1991-04-12', gender: 'FEMALE', address: 'Kampala',
          },
        }] };
      }
      if (sql.includes("screening_summary->>'status'")) return { rows: [{ status: 'CLEAR' }] };
      if (sql.includes("WHERE customer_msisdn=$1::bigint AND status='APPROVED'")) {
        return { rows: [{ id: caseId }] };
      }
      if (sql.includes('FROM public."SW_TBL_PROFILE_CUST"') && sql.includes('FOR UPDATE')) {
        return { rows: [{ firstName: 'Entered', lastName: 'Name', kycStatus: 0 }] };
      }
      if (sql.includes('UPDATE public."SW_TBL_PROFILE_CUST"')) {
        return { rows: [{
          firstName: parameters[4], lastName: parameters[5], idType: parameters[6],
          idNumber: parameters[7], gender: parameters[8], dob: parameters[9],
          address: parameters[10], kycStatus: parameters[1], kycCaseId: parameters[11],
        }] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const service = new KycService({ connect: async () => client }, {});
  service.get = async () => ({ id: caseId, status: 'APPROVED' });

  await service.review(caseId, { action: 'APPROVE', reason: 'Identity verified' }, 'checker');

  const update = calls.find((call) => call.sql.includes('UPDATE public."SW_TBL_PROFILE_CUST"'));
  assert.ok(update);
  assert.match(update.sql, /"KYC_Case_ID"/);
  assert.deepEqual(update.parameters.slice(1), [
    1, 'checker', true, 'Amina', 'Nsubuga', 'UGANDA_NATIONAL_ID',
    'CM123456789012', 'F', '1991-04-12', 'Kampala', caseId,
  ]);
  const audit = calls.find((call) => call.sql.includes('customer_profile_operation_audit'));
  assert.ok(audit);
  assert.match(String(audit.parameters[1]), /Entered/);
  assert.match(String(audit.parameters[2]), /CM123456789012/);
});
