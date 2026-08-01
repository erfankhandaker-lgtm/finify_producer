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
  private starting = false;
  private ready = false;
  private recoveryTimer: NodeJS.Timeout | null = null;
  private lastError: string | null = null;
  private lastGroupJoinAt: string | null = null;

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

    this.consumer.on(this.consumer.events.GROUP_JOIN, () => {
      this.ready = true;
      this.lastError = null;
      this.lastGroupJoinAt = new Date().toISOString();
    });
    this.consumer.on(this.consumer.events.CRASH, (event) => {
      this.ready = false;
      this.lastError = this.errorMessage(event.payload.error);
      this.logger.error(`Kafka consumer crashed: ${this.lastError}`);
      if (!event.payload.restart) this.scheduleRecovery();
    });
    this.consumer.on(this.consumer.events.DISCONNECT, () => {
      this.ready = false;
      if (!this.stopping) this.scheduleRecovery();
    });
  }

  onApplicationBootstrap(): void {
    void this.startWithRetry();
  }

  private async startWithRetry(): Promise<void> {
    if (this.starting || this.stopping) return;
    this.starting = true;
    while (!this.stopping && !this.ready) {
      try {
        await this.start();
        break;
      } catch (error) {
        this.lastError = this.errorMessage(error);
        this.logger.error(`Kafka consumer startup failed; retrying in 5 seconds: ${this.lastError}`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
    this.starting = false;
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
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    await this.consumer.disconnect().catch(() => undefined);
  }

  health() {
    return {
      ready: this.ready,
      status: this.ready ? 'connected' : this.starting ? 'connecting' : 'disconnected',
      topics: [...this.topics],
      lastGroupJoinAt: this.lastGroupJoinAt,
      lastError: this.lastError,
    };
  }

  private scheduleRecovery(): void {
    if (this.stopping || this.recoveryTimer) return;
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null;
      if (this.ready || this.stopping) return;
      void this.reconnect();
    }, 5000);
  }

  private async reconnect(): Promise<void> {
    await this.consumer.disconnect().catch(() => undefined);
    await this.startWithRetry();
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
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
