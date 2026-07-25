import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Consumer, EachMessagePayload, Kafka, logLevel } from 'kafkajs';
import { TransactionReaderService } from '../transactions/transaction-reader.service';
import { readCredential } from '../config/credential';

@Injectable()
export class KafkaConsumerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private readonly consumer: Consumer;
  private readonly topics: string[];
  private readonly fromBeginning: boolean;
  private stopping = false;

  constructor(
    config: ConfigService,
    private readonly transactionReader: TransactionReaderService,
  ) {
    const plain = config.get<string>('IS_CRD_PLAIN', 'true') === 'true';
    const brokerValue = readCredential(config.getOrThrow<string>('KAFKA_BROKERS'), plain);
    const brokers = this.csv(brokerValue || '');
    this.topics = this.csv(config.getOrThrow<string>('KAFKA_TOPICS'));
    this.fromBeginning = config.get<string>('KAFKA_FROM_BEGINNING', 'false') === 'true';

    const kafka = new Kafka({
      clientId: config.get<string>('KAFKA_CLIENT_ID', 'finify-service-consumer'),
      brokers,
      logLevel: logLevel.INFO,
    });

    this.consumer = kafka.consumer({
      groupId: config.getOrThrow<string>('KAFKA_GROUP_ID'),
    });
  }

  onApplicationBootstrap(): void {
    void this.startWithRetry();
  }

  private async startWithRetry(): Promise<void> {
    while (!this.stopping) {
      try {
        await this.start();
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Kafka consumer startup failed; retrying in 5 seconds: ${message}`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  private async start(): Promise<void> {
    await this.consumer.connect();

    for (const topic of this.topics) {
      await this.consumer.subscribe({ topic, fromBeginning: this.fromBeginning });
    }

    await this.consumer.run({
      eachMessage: (payload) => this.handleMessage(payload),
    });

    this.logger.log(`Reading transaction messages from: ${this.topics.join(', ')}`);
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopping = true;
    await this.consumer.disconnect().catch(() => undefined);
  }

  private async handleMessage({ topic, partition, message }: EachMessagePayload): Promise<void> {
    if (!message.value) {
      this.logger.warn(`Ignored empty message from ${topic}:${partition}:${message.offset}`);
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(message.value.toString('utf8')) as unknown;
    } catch {
      this.logger.warn(`Ignored invalid JSON from ${topic}:${partition}:${message.offset}`);
      return;
    }

    await this.transactionReader.read(payload, {
      topic,
      partition,
      offset: message.offset,
    });
  }

  private csv(value: string): string[] {
    const entries = value.split(',').map((entry) => entry.trim()).filter(Boolean);
    if (entries.length === 0) {
      throw new Error('Kafka configuration requires at least one value');
    }
    return entries;
  }
}
