import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { CreateMerchantRefundDto } from './merchant-refund.dto';
import { MerchantRefundService } from './merchant-refund.service';
import { IntegrationAdminGuard } from './integration-admin.guard';

@ApiTags('Merchant Refunds')
@ApiSecurity('admin-api-key')
@ApiHeader({ name: 'x-admin-api-key', required: false, description: 'Required in production and when INTEGRATION_ADMIN_API_KEY is configured.' })
@UseGuards(IntegrationAdminGuard)
@Controller('v1/merchant-refunds')
export class MerchantRefundController {
  constructor(private readonly refunds: MerchantRefundService) {}

  @Post()
  @ApiOperation({
    summary: 'Create an idempotent full merchant refund',
    description: 'Creates a separately linked transaction and exactly reverses the original principal, charge, and commission entries.',
  })
  @ApiResponse({ status: 201, description: 'Refund completed or the existing idempotent refund returned.' })
  create(@Body() dto: CreateMerchantRefundDto) {
    return this.refunds.create(dto);
  }

  @Get(':originalTransactionId')
  @ApiOperation({ summary: 'Get the full refund linked to an original transaction' })
  get(@Param('originalTransactionId') originalTransactionId: string) {
    return this.refunds.getByOriginal(originalTransactionId);
  }
}
