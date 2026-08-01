# Local Finify database

The local Docker override creates a complete development stack without the
remote infrastructure:

```sh
docker compose -f compose.yaml -f compose.local.yaml up -d
```

On the first PostgreSQL startup it runs, in order:

1. `001_legacy_baseline.sql` — reconstructs the legacy tables and views used by
   the producer and consumer.
2. `002_apply_migrations.sql` — applies migrations 001 through 017.
3. `003_seed_local.sql` — loads local keywords, wallet types, customer and
   merchant profiles, scored customers, wallets, AML configuration, charge
   rules, and commission rules.

Local endpoints:

- Admin UI: `http://localhost:3100`
- Producer API: `http://localhost:5002/finify`
- Consumer API: `http://localhost:5003`
- Accounting API: `http://localhost:5004`
- Credit-rule API: `http://localhost:5005`
- PostgreSQL: `localhost:5444` (`finify` / `finify_local_password`)
- Redis: `localhost:7025`
- Kafka: `localhost:9093`

The PostgreSQL data is persisted in the
`finify_finify_local_postgres_data` Docker volume. Initialization scripts only
run for a new, empty volume.
