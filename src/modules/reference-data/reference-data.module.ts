import { Module } from '@nestjs/common';
import { RedisModule } from '@config/redis/redis.module';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { ReferenceDataController } from './reference-data.controller';
import { ReferenceDataService } from './reference-data.service';

@Module({
  imports: [AdminAuthModule, RedisModule],
  controllers: [ReferenceDataController],
  providers: [ReferenceDataService],
  exports: [ReferenceDataService],
})
export class ReferenceDataModule {}
