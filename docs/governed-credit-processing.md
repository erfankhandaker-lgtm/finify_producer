# Governed credit processing

## Runtime status

The local Finify environment has an active submitted-score provider and an active Uganda retail A-J underwriting policy. The score model remains the source of `score` and `grade`; the decision service verifies that the grade in the input snapshot matches the grade used by the tree.

The underwriting policy may calculate an eligible limit, but a production offer is only auto-approved when an ACTIVE commercial binding exists for the exact product, country, currency and channel and its lender is ACTIVE. The seeded commercial binding is deliberately DRAFT because the policy workbook does not contain approved lender, interest, fee, charge or commission values.

## Decision input

`POST /v1/credit-decisions/evaluate` requires:

- score snapshot: numeric score, A-J grade, model identity/version and optional immutable external reference;
- scope: product, currency, channel and country;
- eligibility: KYC status and age;
- bureau: PASS, FAIL or NO_RECORD, current DPD, 30+ DPD frequency, six/twelve-month maximum DPD and open-loan count;
- affordability and behaviour: dominant cash flow, model-proposed limit, telecom tenure, 30/60/90-day DPD, churn band and post-allocation dormancy;
- USSD evidence: completed Schoolaggregator term payment.

Example:

```json
{
  "customerId": "customer-123",
  "applicationId": "application-123",
  "productId": "UGA_RETAIL_CREDIT",
  "currency": "UGX",
  "requestedAmount": 500000,
  "aiResult": {
    "score": 850,
    "category": "A",
    "modelId": "finify-score-model",
    "modelVersion": "1"
  },
  "scoreProviderCode": "FINIFY_SCORE_MODEL_UGA_V1",
  "decisionInputs": {
    "grade": "A",
    "channel": "APP",
    "countryCode": "UGA",
    "kycStatus": "VERIFIED",
    "bureauStatus": "PASS",
    "ageYears": 35,
    "dominantCashFlow": 400000,
    "modelProposedLimit": 1200000,
    "telecomTenureMonths": 36,
    "currentDpd": 0,
    "count30PlusDpd6Months": 0,
    "maxDpd6Months": 0,
    "maxDpd12Months": 0,
    "currentOpenLoans": 0,
    "dpd30Days": 0,
    "dpd60Days": 0,
    "dpd90Days": 0,
    "churnBand": 1,
    "dormantAfterAllocation": false,
    "schoolAggregatorTermPaid": true
  }
}
```

Every response contains machine-readable `reasonCodes` and resolved `reasons` containing separate customer-facing, internal analytical and analytics-dimension values. The execution retains the complete point-in-time decision input and ordered rule trace.

## Manual review

Manual review is a two-person process:

1. `GET /v1/credit-manual-reviews` lists the work queue.
2. `POST /v1/credit-manual-reviews/{id}/recommend` records APPROVE or REJECT, a governed reason code, a mandatory comment and optional recommended limit.
3. `POST /v1/credit-manual-reviews/{id}/decide` records the independent final decision. The final actor must differ from the recommender.

An approval cannot exceed the policy-calculated limit and cannot bypass an inactive lender/commercial binding. Every recommendation and decision is appended to `credit_manual_review_actions`.

## Commercial activation

Before changing `UGA_RETAIL_CREDIT_COMMERCIAL` from DRAFT, populate and independently approve:

- lender/bank and allocation status;
- wallet type and product scope;
- country, currency and channel scope;
- pricing rule, interest method and annual rate;
- processing fee, late-payment fee and early-settlement policy;
- loan-specific charge codes and commission codes.

The database constraint rejects an ACTIVE binding while any blocker remains or mandatory lender/pricing fields are null.

## Policy provenance

The decision leaves are seeded from `Copy of Credit Policy recco-T1_2026_V4.xlsx`, sheet `New Policy 300326`. Where that workbook does not provide a commercial value, the system records an activation blocker instead of inventing a value. The older February sheet remains evidence, not the active policy source.
