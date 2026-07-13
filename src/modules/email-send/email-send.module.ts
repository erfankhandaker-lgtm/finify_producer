import { Module } from '@nestjs/common';
import { EmailSendService } from './email-send.service';
import { KafkaModule } from '../../config/kafka/kafka.module'

@Module({
  imports: [KafkaModule],
  providers: [EmailSendService]
})
export class EmailSendModule {}
 