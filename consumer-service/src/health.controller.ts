import { Controller, Get, Res } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Response } from 'express';
import { KafkaConsumerService } from './kafka/kafka-consumer.service';

@Controller('health')
export class HealthController {
  constructor(private readonly kafkaConsumer: KafkaConsumerService) {}

  @Get()
  @ApiExcludeEndpoint()
  health(@Res({ passthrough: true }) response: Response) {
    const kafka = this.kafkaConsumer.health();
    response.status(kafka.ready ? 200 : 503);
    return {
      status: kafka.ready ? 'ok' : 'degraded',
      service: 'finify-service-consumer',
      kafka,
    };
  }
}
