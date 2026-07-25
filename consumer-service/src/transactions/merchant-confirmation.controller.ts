import { Body, Controller, Get, Headers, Param, Post, RawBodyRequest, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { MerchantConfirmationDto } from './integration.dto';
import { MerchantConfirmationService } from './merchant-confirmation.service';

@ApiTags('Merchant Confirmation API')
@Controller('v1/merchant-confirmations')
export class MerchantConfirmationController {
  constructor(private readonly confirmations: MerchantConfirmationService) {}

  @Post()
  @ApiOperation({
    summary: 'Confirm or reject a reserved Kafka-based merchant transaction',
    description: 'APPROVED executes L2 settlement. REJECTED reverses L1. Repeating the same correlation and decision is idempotent; contradictory decisions return 409.',
  })
  @ApiHeader({ name: 'x-integration-key', required: false, description: 'Required for API_KEY callback authentication.' })
  @ApiHeader({ name: 'x-finify-signature', required: false, description: 'sha256=<hex HMAC of raw JSON body> for HMAC callback authentication.' })
  @ApiResponse({ status: 201, description: 'Confirmation processed and settlement/reversal result returned.' })
  @ApiResponse({ status: 409, description: 'Transaction mismatch or contradictory prior decision.' })
  confirm(
    @Body() dto: MerchantConfirmationDto,
    @Headers('x-integration-key') apiKey: string | undefined,
    @Headers('x-finify-signature') signature: string | undefined,
    @Req() request: RawBodyRequest<Request>,
  ) {
    return this.confirmations.confirm(dto, { 'x-integration-key': apiKey, 'x-finify-signature': signature }, request.rawBody?.toString('utf8') ?? JSON.stringify(dto));
  }

  @Get(':correlationId')
  @ApiOperation({ summary: 'Get an idempotently processed confirmation result by correlation ID' })
  status(@Param('correlationId') correlationId: string) { return this.confirmations.status(correlationId); }
}
