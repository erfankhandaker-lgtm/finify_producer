import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CreateDisputeDto } from './integration.dto';
import { IntegrationAdminGuard } from './integration-admin.guard';
import { TransactionReaderService } from './transaction-reader.service';

@ApiTags('Transaction Disputes')
@ApiSecurity('admin-api-key')
@UseGuards(IntegrationAdminGuard)
@Controller('v1/transaction-disputes')
export class DisputeController {
  constructor(private readonly transactions: TransactionReaderService) {}

  @Post('reverse')
  @ApiOperation({
    summary: 'Reverse a completed or reserved transaction for a dispute',
    description: 'Uses the original accounting mode and creates balanced reversal entries. The dispute reference makes retries idempotent.',
  })
  @ApiResponse({ status: 201, description: 'Dispute reversal result.' })
  reverse(@Body() dto: CreateDisputeDto) {
    return this.transactions.submitDispute(dto);
  }
}
