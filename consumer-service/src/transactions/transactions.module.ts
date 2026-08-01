import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionReaderService } from './transaction-reader.service';
import { TransactionRequest } from './transaction-request.entity';
import { FieldMappingService } from './field-mapping.service';
import { IntegrationAdminGuard } from './integration-admin.guard';
import { IntegrationConfigController } from './integration-config.controller';
import { IntegrationConfigService } from './integration-config.service';
import { IntegrationKafkaPublisherService } from './integration-kafka-publisher.service';
import { IntegrationSecretService } from './integration-secret.service';
import { MerchantConfirmationController } from './merchant-confirmation.controller';
import { MerchantConfirmationService } from './merchant-confirmation.service';
import { MerchantDispatchService } from './merchant-dispatch.service';
import { DisputeController } from './dispute.controller';
import { AmlSummaryService } from './aml-summary.service';
import { MerchantRefundController } from './merchant-refund.controller';
import { MerchantRefundService } from './merchant-refund.service';

@Module({
  imports: [TypeOrmModule.forFeature([TransactionRequest])],
  controllers: [IntegrationConfigController, MerchantConfirmationController, DisputeController, MerchantRefundController],
  providers: [
    TransactionReaderService,
    FieldMappingService,
    IntegrationSecretService,
    IntegrationConfigService,
    IntegrationKafkaPublisherService,
    MerchantDispatchService,
    MerchantConfirmationService,
    IntegrationAdminGuard,
    AmlSummaryService,
    MerchantRefundService,
  ],
  exports: [TransactionReaderService],
})
export class TransactionsModule {}
