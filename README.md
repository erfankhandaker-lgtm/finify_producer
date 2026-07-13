# Finify Service Producer

A NestJS-based payment service producer API with Kafka, Redis, TypeORM, and Docker CI support.

## Overview

This project is built using NestJS and provides message-driven service production for payment processing and event delivery. It includes:

- Kafka producer/consumer configuration
- Redis integration
- TypeORM entities and database setup
- Winston logging
- Docker build workflow via GitHub Actions

## Getting Started

1. Install dependencies

```bash
npm install
```

2. Create local environment configuration

```bash
cp .env.example .env
```

3. Update `.env` with your environment-specific values.

4. Start the app in development mode

```bash
npm run start:dev
```

## Available Scripts

- `npm run build` - compile TypeScript sources to `dist`
- `npm run start` - start the NestJS application
- `npm run start:dev` - start in watch mode
- `npm run lint` - run ESLint and auto-fix issues
- `npm run test` - run unit tests
- `npm run test:e2e` - run end-to-end tests

## Environment

Use `.env.example` as a template for local configuration. Do not commit `.env` to source control.

## Docker CI

GitHub Actions builds and pushes a Docker image using `.github/workflows/docker-image.yml`.

## Notes

- `.env` is ignored by `.gitignore` for security.
- `dist` and `node_modules` are excluded from source control.

## Admin authentication

Admin authentication is isolated from wallet/PIN authentication under
`/finify/admin/auth`. Access tokens expire after 15 minutes and refresh tokens
are rotated and stored only as hashes.

Apply `database/migrations/001_admin_auth.sql` through the normal database
change process. Then create the initial administrator by setting the four
`ADMIN_BOOTSTRAP_*` environment variables and running:

```bash
npm run admin:create
```

Available endpoints:

- `POST /finify/admin/auth/login`
- `POST /finify/admin/auth/refresh`
- `POST /finify/admin/auth/logout`
- `GET /finify/admin/auth/me`

### Admin UI

The Next.js administration interface is in `admin-ui`. It includes a one-time,
four-step first-administrator wizard that checks the API and permanently locks
initialization after the first user is created.

```bash
cd admin-ui
cp .env.example .env.local
npm install
npm run dev
```

The UI runs at `http://localhost:3100` by default. Set
`NEXT_PUBLIC_API_URL` when the API is hosted somewhere other than
`http://localhost:5002/finify`.
