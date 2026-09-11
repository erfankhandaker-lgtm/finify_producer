# Finify CI/CD

Finify uses GitHub Actions for validation, immutable image publication and
environment-approved deployment.

## Pipeline

1. `Finify CI` runs on every pull request and every push to `main`. It builds and
   tests each Node service, compiles both UIs, checks the KYC OCR module, applies
   every database migration twice, runs all migration verification scripts, and
   validates local and production Compose configuration.
2. `Security scanning` runs CodeQL for JavaScript/TypeScript and Python. Pull
   requests also receive a high-severity dependency review.
3. `Publish release images` runs only after `Finify CI` succeeds on `main`. It
   publishes one image per production service to GHCR, tagged with the complete
   commit SHA. Each image includes an SBOM and signed GitHub provenance.
4. `Deploy Finify` is manual and protected by the selected GitHub environment.
   It installs the production manifests on the target host, applies forward-only
   migrations with an advisory lock, starts the exact SHA-tagged images, waits
   for every health check, then tests the public Kong endpoint.

The mock merchant simulator is disabled by the production Compose override.

## Repository variables

- `PUBLIC_API_URL`: HTTPS Kong URL ending in `/finify`; embedded into both UIs.
- `TURNSTILE_SITE_KEY`: public Cloudflare Turnstile site key.

## Environment configuration

Create protected `staging` and `production` GitHub environments. Require an
approver for production and configure these values in each environment.

Variables:

- `DEPLOY_PATH`: absolute application directory on the Docker host.
- `DEPLOY_HEALTH_URL`: externally reachable Kong origin, without `/finify`.
- `GHCR_USER`: GitHub user or machine account used to pull images.

Secrets:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- `DEPLOY_KNOWN_HOSTS`: pinned `ssh-keyscan` output reviewed out of band.
- `GHCR_PULL_TOKEN`: read-only token with `read:packages`.

The deployment host must already contain a root-owned `.env` at `DEPLOY_PATH`
with `NODE_MODE=production`, production database connectivity, TLS-facing URLs,
and all mandatory Finify secrets. The workflow never copies or modifies `.env`.

## Branch protection

Protect `main`, require pull requests, prevent force pushes, dismiss stale
approvals, and require these checks:

- `Producer API`
- all service jobs under `Finify CI`
- `Admin UI`
- `Customer portal`
- `Database migrations`
- `Compose validation`
- both CodeQL jobs

## Release and rollback

Deploy the full commit SHA displayed by `Publish release images`. To roll back
application containers, dispatch `Deploy Finify` with a previously healthy SHA.
Database migrations are forward-only and are not automatically reversed; schema
changes must remain backward compatible with the preceding application release.
