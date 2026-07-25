import { Controller, Get } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';

@Controller('health')
export class HealthController {
  @Get()
  @ApiExcludeEndpoint()
  health() { return { status: 'ok', service: 'finify-service-consumer' }; }
}
