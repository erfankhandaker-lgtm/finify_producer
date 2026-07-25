import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { IntegrationAdminGuard } from './integration-admin.guard';
import { IntegrationConfigService } from './integration-config.service';
import { IntegrationStatusDto, PreviewMappingDto, UpsertMerchantIntegrationDto } from './integration.dto';

@ApiTags('Merchant Integration Administration')
@ApiSecurity('admin-api-key')
@ApiHeader({ name: 'x-admin-api-key', required: false, description: 'Required in production and when INTEGRATION_ADMIN_API_KEY is configured.' })
@UseGuards(IntegrationAdminGuard)
@Controller('v1/merchant-integrations')
export class IntegrationConfigController {
  constructor(private readonly configs: IntegrationConfigService) {}

  @Get('source-fields')
  @ApiOperation({ summary: 'List selectable transaction, system, and secret mapping sources for the UI' })
  sourceFields(): Record<string, string[]> { return this.configs.sourceFields(); }

  @Get(':merchantMsisdn')
  @ApiOperation({ summary: 'Get the active merchant integration configuration with secrets redacted' })
  @ApiParam({ name: 'merchantMsisdn', example: '447700000001' })
  get(@Param('merchantMsisdn') merchantMsisdn: string) { return this.configs.get(merchantMsisdn); }

  @Put(':merchantMsisdn')
  @ApiOperation({ summary: 'Create or replace a versioned API/Kafka integration configuration' })
  @ApiResponse({ status: 200, description: 'Saved configuration. Secret values are never returned.' })
  upsert(@Param('merchantMsisdn') merchantMsisdn: string, @Body() dto: UpsertMerchantIntegrationDto) {
    return this.configs.upsert(merchantMsisdn, dto);
  }

  @Post(':merchantMsisdn/preview')
  @ApiOperation({ summary: 'Preview the configured outbound body/headers/query/path without sending it' })
  preview(@Param('merchantMsisdn') merchantMsisdn: string, @Body() dto: PreviewMappingDto) {
    return this.configs.preview(merchantMsisdn, dto);
  }

  @Patch(':merchantMsisdn/status')
  @ApiOperation({ summary: 'Activate or deactivate a validated integration configuration' })
  setStatus(@Param('merchantMsisdn') merchantMsisdn: string, @Body() dto: IntegrationStatusDto) {
    return this.configs.setActive(merchantMsisdn, dto.active, dto.changedBy);
  }

  @Get(':merchantMsisdn/history')
  @ApiOperation({ summary: 'Get redacted configuration-version history for audit and UI display' })
  history(@Param('merchantMsisdn') merchantMsisdn: string) { return this.configs.history(merchantMsisdn); }

  @Get(':merchantMsisdn/attempts')
  @ApiOperation({ summary: 'Get recent outbound API/Kafka attempts and settlement states' })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  attempts(
    @Param('merchantMsisdn') merchantMsisdn: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) { return this.configs.attempts(merchantMsisdn, limit); }
}
