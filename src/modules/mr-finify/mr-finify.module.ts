import { Module } from '@nestjs/common';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AdminOperationsModule } from '../admin-operations/admin-operations.module';
import { MrFinifyController } from './mr-finify.controller';
import { MrFinifyService } from './mr-finify.service';

@Module({
  imports: [AdminAuthModule, AdminOperationsModule],
  controllers: [MrFinifyController],
  providers: [MrFinifyService],
  exports: [MrFinifyService],
})
export class MrFinifyModule {}
