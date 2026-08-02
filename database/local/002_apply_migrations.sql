\set ON_ERROR_STOP on

DO $$
BEGIN
  IF to_regclass('public.finify_schema_migrations') IS NOT NULL THEN
    RAISE EXCEPTION 'Migration ledger already exists. Use npm run migrate; historical migrations will not be replayed.';
  END IF;
END $$;

CREATE TABLE public.finify_schema_migrations (
  version varchar(3) PRIMARY KEY,
  name text NOT NULL UNIQUE,
  checksum_sha256 char(64) NULL,
  applied_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_by text NOT NULL DEFAULT CURRENT_USER
);

\echo Applying 001_admin_auth.sql
\ir /migrations/001_admin_auth.sql
\echo Applying 002_charge_relations.sql
\ir /migrations/002_charge_relations.sql
\echo Applying 003_reconcile_charge_configuration.sql
\ir /migrations/003_reconcile_charge_configuration.sql
\echo Applying 004_charge_performance_indexes.sql
\ir /migrations/004_charge_performance_indexes.sql
\echo Applying 005_reset_commission_configuration.sql
\ir /migrations/005_reset_commission_configuration.sql
\echo Applying 006_finify_transaction_posting.sql
\ir /migrations/006_finify_transaction_posting.sql
\echo Applying 007_consumer_merchant_orchestration.sql
\ir /migrations/007_consumer_merchant_orchestration.sql
\echo Applying 008_configurable_merchant_integrations.sql
\ir /migrations/008_configurable_merchant_integrations.sql
\echo Applying 009_reference_data_maker_checker.sql
\ir /migrations/009_reference_data_maker_checker.sql
\echo Applying 010_aml_configuration_maker_checker.sql
\ir /migrations/010_aml_configuration_maker_checker.sql
\echo Applying 011_aml_transaction_lifecycle.sql
\ir /migrations/011_aml_transaction_lifecycle.sql
\echo Applying 012_eod_accounting.sql
\ir /migrations/012_eod_accounting.sql
\echo Applying 013_wallet_operations.sql
\ir /migrations/013_wallet_operations.sql
\echo Applying 014_credit_rule_engine.sql
\ir /migrations/014_credit_rule_engine.sql
\echo Applying 015_credit_scored_customers.sql
\ir /migrations/015_credit_scored_customers.sql
\echo Applying 016_admin_operations.sql
\ir /migrations/016_admin_operations.sql
\echo Applying 017_pricing_rule_flows.sql
\ir /migrations/017_pricing_rule_flows.sql
\echo Applying 018_scored_customer_profile_link.sql
\ir /migrations/018_scored_customer_profile_link.sql
\echo Applying 019_treasury_funding.sql
\ir /migrations/019_treasury_funding.sql
\echo Applying 020_bank_treasury_movements.sql
\ir /migrations/020_bank_treasury_movements.sql
\echo Applying 021_treasury_documents.sql
\ir /migrations/021_treasury_documents.sql
\echo Applying 022_customer_registry_scale.sql
\ir /migrations/022_customer_registry_scale.sql
\echo Applying 023_admin_transaction_registry.sql
\ir /migrations/023_admin_transaction_registry.sql
\echo Applying 024_merchant_refunds.sql
\ir /migrations/024_merchant_refunds.sql
\echo Applying 025_accounting_reporting_controls.sql
\ir /migrations/025_accounting_reporting_controls.sql
\echo Applying 026_multicurrency_accounting.sql
\ir /migrations/026_multicurrency_accounting.sql
\echo Applying 027_multicurrency_treasury_wallets.sql
\ir /migrations/027_multicurrency_treasury_wallets.sql
\echo Applying 028_treasury_balance_integrity.sql
\ir /migrations/028_treasury_balance_integrity.sql
\echo Applying 029_treasury_accounting.sql
\ir /migrations/029_treasury_accounting.sql
\echo Applying 030_customer_wallet_routing.sql
\ir /migrations/030_customer_wallet_routing.sql
\echo Applying 031_kyc_schema.sql
\ir /migrations/031_kyc_schema.sql
\echo Applying 032_kyc_sanctions_screening.sql
\ir /migrations/032_kyc_sanctions_screening.sql
\echo Applying 033_kyc_sanctions_sync.sql
\ir /migrations/033_kyc_sanctions_sync.sql
\echo Applying 034_kyc_account_opening_enforcement.sql
\ir /migrations/034_kyc_account_opening_enforcement.sql
\echo Applying 035_customer_main_wallet_kyc.sql
\ir /migrations/035_customer_main_wallet_kyc.sql
\echo Applying 036_business_portal_identity.sql
\ir /migrations/036_business_portal_identity.sql
\echo Applying 037_admin_biometric_login.sql
\ir /migrations/037_admin_biometric_login.sql
\echo Applying 038_admin_totp_mfa.sql
\ir /migrations/038_admin_totp_mfa.sql
\echo Applying 039_admin_security_configuration.sql
\ir /migrations/039_admin_security_configuration.sql
\echo Applying 040_eod_business_close_schedule.sql
\ir /migrations/040_eod_business_close_schedule.sql
\echo Applying 041_mr_finify_assistant.sql
\ir /migrations/041_mr_finify_assistant.sql
\echo Applying 042_mr_finify_secure_configuration.sql
\ir /migrations/042_mr_finify_secure_configuration.sql
\echo Applying 043_customer_kyc_profile_sync.sql
\ir /migrations/043_customer_kyc_profile_sync.sql

INSERT INTO public.finify_schema_migrations(version,name)
SELECT lpad(version::text,3,'0'),
       (ARRAY[
         '001_admin_auth.sql','002_charge_relations.sql','003_reconcile_charge_configuration.sql',
         '004_charge_performance_indexes.sql','005_reset_commission_configuration.sql',
         '006_finify_transaction_posting.sql','007_consumer_merchant_orchestration.sql',
         '008_configurable_merchant_integrations.sql','009_reference_data_maker_checker.sql',
         '010_aml_configuration_maker_checker.sql','011_aml_transaction_lifecycle.sql',
         '012_eod_accounting.sql','013_wallet_operations.sql','014_credit_rule_engine.sql',
         '015_credit_scored_customers.sql','016_admin_operations.sql','017_pricing_rule_flows.sql',
         '018_scored_customer_profile_link.sql','019_treasury_funding.sql',
         '020_bank_treasury_movements.sql','021_treasury_documents.sql',
         '022_customer_registry_scale.sql','023_admin_transaction_registry.sql',
         '024_merchant_refunds.sql','025_accounting_reporting_controls.sql',
         '026_multicurrency_accounting.sql','027_multicurrency_treasury_wallets.sql',
         '028_treasury_balance_integrity.sql','029_treasury_accounting.sql',
         '030_customer_wallet_routing.sql','031_kyc_schema.sql','032_kyc_sanctions_screening.sql',
         '033_kyc_sanctions_sync.sql','034_kyc_account_opening_enforcement.sql',
         '035_customer_main_wallet_kyc.sql','036_business_portal_identity.sql',
         '037_admin_biometric_login.sql','038_admin_totp_mfa.sql',
         '039_admin_security_configuration.sql','040_eod_business_close_schedule.sql',
         '041_mr_finify_assistant.sql','042_mr_finify_secure_configuration.sql',
         '043_customer_kyc_profile_sync.sql'
       ])[version]
FROM generate_series(1,43) AS version;
