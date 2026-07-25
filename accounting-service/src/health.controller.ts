import { Controller, Get } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @ApiExcludeEndpoint()
  async health() {
    await this.dataSource.query('SELECT 1');
    return { status: 'ok', service: 'finify-accounting-service', database: 'connected' };
  }
}
