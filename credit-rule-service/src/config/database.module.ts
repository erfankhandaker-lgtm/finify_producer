import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { readCredential } from './credential';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const plain = config.get<string>('IS_CRD_PLAIN', 'true') === 'true';
        const credential = (key: string) => readCredential(config.get<string>(key), plain);
        const databaseKey = config.get<string>('DB_NAME')
          ? 'DB_NAME'
          : config.get<string>('NODE_ENV') === 'production'
            ? 'DB_NAME_PRODUCTION'
            : config.get<string>('NODE_ENV') === 'test'
              ? 'DB_NAME_TEST'
              : 'DB_NAME_DEVELOPMENT';
        return {
          type: 'postgres' as const,
          host: credential('DB_HOST') || 'localhost',
          port: Number(credential('DB_PORT') || 5432),
          username: credential('DB_USER'),
          password: credential('DB_PASS'),
          database: credential(databaseKey),
          synchronize: false,
          logging: false,
          ssl: config.get<string>('DB_SSL', 'false') === 'true'
            ? { rejectUnauthorized: false }
            : false,
          extra: {
            max: 12,
            connectionTimeoutMillis: 10000,
            idleTimeoutMillis: 10000
          }
        };
      }
    })
  ]
})
export class DatabaseModule {}
