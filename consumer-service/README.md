# Finify Service Consumer

Independent NestJS worker that reads transaction messages from Kafka and looks up the matching transaction in PostgreSQL. PostgreSQL and Kafka connections are established during startup.

This initial service is intentionally read-only: it does not update transactions or publish Kafka messages.

## Setup

```bash
cp .env.example .env
npm install
npm run start:dev
```

Set `KAFKA_TOPICS` to the comma-separated transaction keyword topics published by the producer, for example:

```dotenv
KAFKA_TOPICS=PMNT,CASHIN,CASHOUT
```

## Build and run

```bash
npm run build
npm run start:prod
```

The consumer recognizes transaction IDs in `TransactionId`, `transactionId`, or `TRNSID`. It logs transaction ID, topic, keyword, and status only.
