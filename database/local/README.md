# Local Finify database

The local Docker override creates a complete development stack without the
remote infrastructure:

```sh
docker compose -f compose.yaml -f compose.local.yaml up -d
```

On the first PostgreSQL startup it runs, in order:

1. `001_legacy_baseline.sql` — reconstructs the legacy tables and views used by
   the producer and consumer.
2. `002_apply_migrations.sql` — applies migrations 001 through 043 once and
   creates the migration ledger.
3. `003_seed_local.sql` — loads local keywords, wallet types, customer and
   merchant profiles, scored customers, wallets, AML configuration, charge
   rules, and commission rules.

After initial creation, apply new migrations through the checksum-verified
runner. Never execute `002_apply_migrations.sql` against an existing database:

```sh
npm run migrate
```

An existing pre-ledger installation must first be verified and explicitly
baselined, for example `npm run migrate -- --baseline-through=043`. The runner
refuses implicit baselining and refuses any changed, previously applied file.
Each new migration and its ledger record are committed in one database
transaction. In production, provide a restricted deployment credential through
`MIGRATION_DATABASE_URL`; application processes do not run migrations at boot.

Local endpoints:

- Admin UI: `http://localhost:3100`
- Kong API gateway: `http://localhost:8080`
- PostgreSQL: `localhost:5444` (`finify` / `finify_local_password`)
- Redis: `localhost:7025`
- Kafka: `localhost:9093`

The PostgreSQL data is persisted in the
`finify_finify_local_postgres_data` Docker volume. Initialization scripts only
run for a new, empty volume.
