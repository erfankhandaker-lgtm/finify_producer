# Lending commercial configuration

The Finify Admin UI exposes **Lending commercial** under the Credit navigation group. It governs the commercial bridge between an approved credit policy and the operational loan product.

## Boundary

- The browser calls Finify only. PostgreSQL and Fineract credentials are never exposed to the UI.
- `TEST_ACTIVE` configurations are available to the simulator but are ignored by production credit decisions.
- `ACTIVE` is reserved for maker-checker-approved `PRODUCTION` configurations.
- The Fineract product ID is an explicit external-system reference. Finify remains the owner of credit-policy selection, lender allocation, channel scope, wallet mapping, and commercial governance.

## Atomic database operations

Migration `055_credit_commercial_configuration_studio.sql` provides these PostgreSQL functions:

- `create_credit_commercial_configuration(code, actor, configuration)` creates a version and applies all linked settings in one transaction.
- `apply_credit_commercial_configuration(binding_id, expected_revision, actor, configuration)` locks the binding, validates bank/lender/wallet relationships, updates the bank settlement wallet, lender allocation, and product binding, calculates activation blockers, and records the before/after audit snapshot.
- `transition_credit_commercial_configuration(binding_id, expected_revision, action, actor, reason)` performs submission, approval, activation, rejection, or retirement with maker-checker and optimistic-lock controls.
- `credit_commercial_configuration_view(binding_id)` returns the composed admin/API view without repeated application queries.

Any validation error rolls back every affected table. The API therefore performs one database-function call for each create, save, or lifecycle action rather than reading and writing each table separately.

## API

Base path: `/finify/api/v1/admin/credit-commercial`

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/metadata` | `credit_commercial.read` | Bank, lender, wallet, channel, policy, currency, and known Fineract references |
| GET | `/configurations` | `credit_commercial.read` | List composed configurations |
| POST | `/configurations` | `credit_commercial.make` | Create a new governed version atomically |
| GET | `/configurations/{id}` | `credit_commercial.read` | Read one composed configuration |
| PUT | `/configurations/{id}` | `credit_commercial.make` | Save all linked settings atomically |
| GET | `/configurations/{id}/audit` | `credit_commercial.read` | Read immutable configuration history |
| POST | `/configurations/{id}/submit` | `credit_commercial.make` | Submit a complete draft |
| POST | `/configurations/{id}/approve` | `credit_commercial.check` | Approve as an independent checker |
| POST | `/configurations/{id}/activate` | `credit_commercial.check` | Activate in the selected environment |
| POST | `/configurations/{id}/reject` | `credit_commercial.check` | Reject with a mandatory reason |
| POST | `/configurations/{id}/retire` | `credit_commercial.check` | Retire an approved or active version |
| POST | `/simulate` | `credit_commercial.simulate` | Resolve a binding and calculate fee projections without mutation |

Updates and transitions require `expectedRevision`. A stale revision returns a conflict instead of silently overwriting another administrator's change.

## Current local test configuration

The local migration seeds an explicitly non-production DTB configuration:

- country/currency: Uganda / UGX
- channel: all configured channels, with exact channel overrides supported by later versions
- customer wallet: `103`
- bank settlement wallet: `205`
- lender: `DTB_UGA`
- Fineract product: local product ID `1`, `DTB Uganda Test Credit`
- interest: flat, 5% monthly
- repayment: monthly; default 3, minimum 1, maximum 12
- processing fee: 1% of principal
- late-payment fee: 2% of principal
- early settlement: allowed, zero fee
- charge references: `FINERACT:1`, `FINERACT:2`
- commission rule: `NONE` (explicit zero commission)
- status: `TEST_ACTIVE`

These values are synthetic test terms and must not be promoted to production without approved commercial evidence.
