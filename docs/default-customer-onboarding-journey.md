# Default customer onboarding journey

The local development environment retains an idempotent default journey through migration `049_default_customer_onboarding_journey.sql`. Migration `050_onboarding_configuration_bindings.sql` replaces its bootstrap strings with governed configuration records and immutable version references.

## Identity and scope

- Tenant: `00000000-0000-4000-8000-000000000001` (development bootstrap only)
- Journey code: `DEFAULT_CUSTOMER_ONBOARDING`
- Country: `UGA`
- Channel: `MOBILE_APP`
- Customer type: `INDIVIDUAL`
- Status: `DRAFT`

## Flow

`START → PHONE_CAPTURE → OTP_VERIFICATION → PIN_SETUP → CONSENT → FORM → KYC → WALLET_ALLOCATION → CREDIT_SCORE → CREDIT_POLICY → DECISION`

Decision outcomes:

- `APPROVED → LIMIT_ALLOCATION → Onboarding complete`
- `MANUAL_REVIEW → Manual credit review → approved or rejected`
- `REJECTED → Application not approved`

## Bound development configurations

The journey is bound to:

- OTP policy `UGA_MOBILE_CUSTOMER_OTP`, version 1 (active locally)
- Consent version `00000000-0000-4000-8302-000000000001`
- Customer profile form version `00000000-0000-4000-8304-000000000001`
- KYC configuration version `00000000-0000-4000-8306-000000000001`
- Wallet/product binding `00000000-0000-4000-8309-000000000001`
- Score provider `FINIFY_SCORE_MODEL_UGA_V1`
- Credit policy `UGA_RETAIL_CREDIT_POLICY`, version 1

## Why it remains a draft

Only the local OTP baseline is active. Consent wording, the profile form, KYC thresholds, wallet/product pricing, the real score-model endpoint and the credit decision tree/limits still require their domain owners and maker/checker approval. Journey validation treats any inactive binding as an error, so the journey cannot be submitted or activated prematurely.

Production also requires a trusted Mobile App client, `ONBOARDING_TRUSTED_CHANNEL_REQUIRED=true`, dedicated verified-node services, customer-safe rejection codes and maker/checker approval.

Do not reuse the development tenant UUID as a production tenant identifier.
