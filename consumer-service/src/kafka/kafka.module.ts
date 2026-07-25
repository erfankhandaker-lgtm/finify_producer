import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { KafkaConsumerService } from './kafka-consumer.service';

@Module({
  imports: [TransactionsModule],
  providers: [KafkaConsumerService],
})
export class KafkaModule {}
