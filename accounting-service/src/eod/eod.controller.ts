import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AdminApiGuard } from '../common/admin-api.guard';
import { RunEodBatchDto, RunEodDto } from './eod.dto';
import { EodOrchestrationService } from './eod-orchestration.service';

@ApiTags('End of day')
@ApiSecurity('admin-api-key')
@UseGuards(AdminApiGuard)
@Controller('v1/accounting/eod')
export class EodController {
  constructor(private readonly orchestration: EodOrchestrationService) {}

  @Post('dry-run')
  @ApiOperation({ summary: 'Validate one currency without creating snapshots or closing the period' })
  @ApiResponse({ status: 201, description: 'Readiness and database controls completed; inspect readyForClose and result.' })
  @ApiResponse({ status: 409, description: 'Operational readiness controls blocked the run.' })
  dryRun(@Body() dto: RunEodDto) {
    return this.orchestration.runOne({ ...dto, currency: dto.currency.toUpperCase(), dryRun: true });
  }

  @Post('close')
  @ApiOperation({ summary: 'Close one business date and currency atomically',
    description: 'Persists wallet/GL snapshots, reconciliation, run steps, exceptions, and the CLOSED period.' })
  @ApiResponse({ status: 201, description: 'The period closed or returned a structured blocked result.' })
  @ApiResponse({ status: 409, description: 'Operational readiness controls failed.' })
  close(@Body() dto: RunEodDto) {
    return this.orchestration.runOne({ ...dto, currency: dto.currency.toUpperCase(), dryRun: false });
  }

  @Post('batch')
  @ApiOperation({ summary: 'Run every active currency for a business date',
    description: 'Currencies execute independently; the response reports COMPLETED, PARTIAL, or FAILED.' })
  @ApiResponse({ status: 201, description: 'Batch results for every active currency.' })
  batch(@Body() dto: RunEodBatchDto) { return this.orchestration.runAll(dto); }

  @Get('runs')
  @ApiOperation({ summary: 'List persisted EOD dry-runs and closes' })
  @ApiQuery({ name: 'limit', required: false, example: 100, schema: { minimum: 1, maximum: 500 } })
  runs(@Query('limit') limit = '100') { return this.orchestration.listRuns(Number(limit) || 100); }

  @Get('runs/:runId')
  @ApiOperation({ summary: 'Get one EOD run with its ordered steps and exceptions' })
  @ApiParam({ name: 'runId', example: '7' })
  run(@Param('runId') runId: string) { return this.orchestration.getRun(runId); }
}
