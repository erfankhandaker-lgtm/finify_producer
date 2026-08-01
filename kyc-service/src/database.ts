import { Provider } from '@nestjs/common';
import { Pool } from 'pg';

export const DATABASE = Symbol('KYC_DATABASE');

export const databaseProvider: Provider = {
  provide: DATABASE,
  useFactory: () => new Pool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME || 'finify',
    max: Number(process.env.KYC_DB_POOL_SIZE || 10),
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : false,
  }),
};
