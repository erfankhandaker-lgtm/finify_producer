# Finify API gateway

Kong Gateway is the only published API entry point. Its DB-less declarative
configuration is stored in `kong/kong.yml`; Kong's Admin API is private to the
gateway container itself. System Pulse uses a separate read-only status listener
on the private Compose network.

## Local development

Set `NODE_MODE=development` in `.env`, then start the stack:

```bash
docker compose -f compose.yaml -f compose.local.yaml up -d --build
npm run test:gateway
```

Local addresses:

- Kong HTTP API: `http://localhost:8080`
- Kong HTTPS API with its local certificate: `https://localhost:8443`
- Admin UI: `http://localhost:3100`
- Customer portal: `http://localhost:3200`
- MinIO development console: `http://localhost:9011`

The producer, consumer, accounting, credit-rule, KYC, OCR and mock-merchant API
ports are not published. PostgreSQL, Redis and Kafka are published only by
`compose.local.yaml` for local development tooling.

## Production mode

Both `NODE_MODE=prod` and `NODE_MODE=production` activate production behavior.
Compose passes that value to `NODE_ENV` for framework compatibility. Production
mode disables service Swagger endpoints, requires internal service credentials,
prohibits unauthenticated merchant callbacks, and selects the production database
configuration.

Changing the mode does not replace production provisioning. Before deployment,
provide unique secrets, production database and MinIO credentials, TLS
certificates or an external TLS load balancer, the real `PUBLIC_API_URL`, and the
allowed Admin UI/portal origins. Never use values from `compose.local.yaml` in a
production deployment.

Minimum production variables are documented in `.env.example`. The producer
fails startup with a list of missing security variables rather than running in a
partially secured state.

## Published API allowlist

- `/finify/hello`
- `/finify/auth/*`
- `/finify/admin/auth/*`
- `/finify/admin/access/*`
- `/finify/admin/operations/*`
- `/finify/admin/reference-data/*`
- `/finify/admin/wallets/*`
- `/finify/admin/assistant/*`
- `/finify/api/v1/admin/onboarding/*`
- `/finify/api/v1/onboarding/*`
- `/finify/portal/*`
- `/finify/wallets/*`
- `POST /v1/merchant-confirmations`

Adding a controller does not publish it automatically. Every new external API
requires an explicit route, allowed HTTP methods, an application authorization
review, rate limits, and a gateway regression test.

## Production network rule

Deploy only `compose.yaml` plus the production platform overrides. Do not apply
`compose.local.yaml`; it intentionally publishes PostgreSQL, Redis, Kafka and the
MinIO console for laptop development.
