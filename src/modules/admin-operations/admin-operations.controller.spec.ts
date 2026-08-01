import { ADMIN_PERMISSIONS } from '../admin-auth/permissions.decorator';
import { AdminOperationsController } from './admin-operations.controller';

const permissionsFor = (method: keyof AdminOperationsController) =>
  Reflect.getMetadata(
    ADMIN_PERMISSIONS,
    AdminOperationsController.prototype[method],
  );

describe('AdminOperationsController pricing flow permissions', () => {
  it('allows every authenticated administrator to read system pulse', () => {
    expect(permissionsFor('systemPulse')).toBeUndefined();
    expect(permissionsFor('commandCenterMetrics')).toBeUndefined();
  });

  it('uses the unified pricing rule read privilege', () => {
    expect(permissionsFor('pricingRuleFlows')).toEqual(['pricing_rules.read']);
    expect(permissionsFor('pricingRuleFlow')).toEqual(['pricing_rules.read']);
  });

  it('protects treasury funding with accounting permissions', () => {
    expect(permissionsFor('treasuryFundingRequests')).toEqual([
      'accounting.read',
    ]);
    expect(permissionsFor('createTreasuryFunding')).toEqual([
      'accounting.operate',
    ]);
    expect(permissionsFor('reviewTreasuryFunding')).toEqual([
      'accounting.operate',
    ]);
    expect(permissionsFor('uploadTreasuryDocument')).toEqual([
      'accounting.operate',
    ]);
    expect(permissionsFor('downloadTreasuryDocument')).toEqual([
      'accounting.read',
    ]);
    expect(permissionsFor('removeTreasuryDocument')).toEqual([
      'accounting.operate',
    ]);
  });

  it('protects the transaction registry and inspector', () => {
    expect(permissionsFor('transactions')).toEqual(['transactions.read']);
    expect(permissionsFor('transaction')).toEqual(['transactions.read']);
  });

  it('uses maker, checker, and simulation privileges independently', () => {
    expect(permissionsFor('createPricingRuleFlow')).toEqual([
      'pricing_rules.make',
    ]);
    expect(permissionsFor('updatePricingRuleFlow')).toEqual([
      'pricing_rules.make',
    ]);
    expect(permissionsFor('submitPricingRuleFlow')).toEqual([
      'pricing_rules.make',
    ]);
    expect(permissionsFor('approvePricingRuleFlow')).toEqual([
      'pricing_rules.check',
    ]);
    expect(permissionsFor('activatePricingRuleFlow')).toEqual([
      'pricing_rules.check',
    ]);
    expect(permissionsFor('retirePricingRuleFlow')).toEqual([
      'pricing_rules.check',
    ]);
    expect(permissionsFor('rejectPricingRuleFlow')).toEqual([
      'pricing_rules.check',
    ]);
    expect(permissionsFor('simulatePricingRuleFlow')).toEqual([
      'pricing_rules.simulate',
    ]);
  });
});
