\set ON_ERROR_STOP on

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
