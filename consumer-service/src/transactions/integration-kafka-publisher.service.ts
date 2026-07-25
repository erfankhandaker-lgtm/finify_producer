import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';
import { readCredential } from '../config/credential';

@Injectable()
export class IntegrationKafkaPublisherService implements OnApplicationShutdown {
  private readonly producer: Producer;
  private connectPromise?: Promise<void>;
  private connected = false;

  constructor(config: ConfigService) {
    const plain = config.get<string>('IS_CRD_PLAIN', 'true') === 'true';
    const brokers = (readCredential(config.get<string>('KAFKA_BROKERS'), plain) ?? '')
      .split(',').map((value) => value.trim()).filter(Boolean);
    this.producer = new Kafka({
      clientId: config.get<string>('KAFKA_INTEGRATION_CLIENT_ID', 'finify-merchant-integration-publisher'),
      brokers,
    }).producer();
  }

  async publish(topic: string, key: string, payload: Record<string, unknown>): Promise<void> {
    await this.connect();
    await this.producer.send({
      topic,
      messages: [{ key, value: JSON.stringify(payload), headers: { 'content-type': 'application/json' } }],
    });
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.connected) await this.producer.disconnect();
  }

  private async connect(): Promise<void> {
    if (this.connected) return;
    this.connectPromise ??= this.producer.connect().then(() => { this.connected = true; });
    await this.connectPromise;
  }
}
