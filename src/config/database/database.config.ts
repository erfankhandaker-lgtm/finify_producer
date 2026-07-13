import 'dotenv/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { decrypt } from '@helpers/cipher';
import * as models from '../../models';

const plain = process.env.IS_CRD_PLAIN === 'true';
const credential = (value?: string) => plain ? value : decrypt(value);

const databaseForEnvironment = () => {
  switch (process.env.NODE_ENV) {
    case 'test': return credential(process.env.DB_NAME_TEST);
    case 'production': return credential(process.env.DB_NAME_PRODUCTION);
    default: return credential(process.env.DB_NAME_DEVELOPMENT);
  }
};

export const databaseConfig = (): TypeOrmModuleOptions => ({
  type: (credential(process.env.DB_DIALECT) || 'postgres') as 'postgres',
  host: credential(process.env.DB_HOST),
  port: Number(credential(process.env.DB_PORT)),
  username: credential(process.env.DB_USER),
  password: credential(process.env.DB_PASS),
  database: databaseForEnvironment(),
  entities: Object.values(models).filter((model) => typeof model === 'function') as Function[],
  synchronize: false,
  logging: false,
  extra: {
    max: 40,
    connectionTimeoutMillis: 60000,
    idleTimeoutMillis: 10000,
  },
});
