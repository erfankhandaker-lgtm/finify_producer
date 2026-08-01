import {
  All,
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { AdminTokenPayload } from '../admin-auth/admin-auth.types';
import { RequirePermissions } from '../admin-auth/permissions.decorator';
import { AdminPermissionsGuard } from '../admin-auth/permissions.guard';
import { PricingFlowService } from '../pricing-rules/pricing-flow.service';
import { AdminOperationsService } from './admin-operations.service';
import { TreasuryDocumentService } from './treasury-document.service';

type AdminRequest = Request & { user: AdminTokenPayload };

@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
@Controller('admin/operations')
export class AdminOperationsController {
  constructor(
    private readonly operations: AdminOperationsService,
    private readonly pricingFlows: PricingFlowService,
    private readonly treasuryDocuments: TreasuryDocumentService,
  ) {}

  @Get('system-pulse')
  systemPulse() {
    return this.operations.systemPulse();
  }

  @Get('command-center')
  commandCenterMetrics() {
    return this.operations.commandCenterMetrics();
  }

  @Get('treasury-funding-requests')
  @RequirePermissions('accounting.read')
  treasuryFundingRequests(@Query('status') status?: string) {
    return this.operations.treasuryFundingRequests(status);
  }

  @Post('treasury-documents')
  @RequirePermissions('accounting.operate')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  }))
  uploadTreasuryDocument(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: AdminRequest,
  ) {
    return this.treasuryDocuments.upload(file, request.user.username);
  }

  @Get('treasury-documents/:id/download')
  @RequirePermissions('accounting.read')
  async downloadTreasuryDocument(
    @Param('id') id: string,
    @Req() request: AdminRequest,
    @Res() response: Response,
  ) {
    const { document, stream } = await this.treasuryDocuments.download(
      id,
      request.user.username,
    );
    response.setHeader('Content-Type', document.contentType);
    response.setHeader('Content-Length', document.sizeBytes);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${document.originalName.replace(/["\r\n]/g, '_')}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    stream.pipe(response);
  }

  @Delete('treasury-documents/:id')
  @RequirePermissions('accounting.operate')
  removeTreasuryDocument(
    @Param('id') id: string,
    @Req() request: AdminRequest,
  ) {
    return this.treasuryDocuments.removeUnattached(id, request.user.username);
  }

  @Post('treasury-funding-requests')
  @RequirePermissions('accounting.operate')
  createTreasuryFunding(
    @Body() body: Record<string, unknown>,
    @Req() request: AdminRequest,
  ) {
    return this.operations.createTreasuryFunding(body, request.user.username);
  }

  @Post('treasury-funding-requests/:id/:action')
  @RequirePermissions('accounting.operate')
  reviewTreasuryFunding(
    @Param('id') id: string,
    @Param('action') action: string,
    @Body() body: { comment?: string },
    @Req() request: AdminRequest,
  ) {
    if (action !== 'approve' && action !== 'reject') {
      throw new BadRequestException('Funding action must be approve or reject');
    }
    return this.operations.reviewTreasuryFunding(
      id,
      action,
      body.comment,
      request.user.username,
    );
  }

  @Get('customers')
  @RequirePermissions('customers.read')
  customers(@Query() query: Record<string, string>) {
    return this.operations.customers(query);
  }

  @Get('customers/:customerId')
  @RequirePermissions('customers.read')
  customer(@Param('customerId') customerId: string) {
    return this.operations.customer(customerId);
  }

  @Patch('customers/:customerId')
  @RequirePermissions('customers.manage')
  updateCustomer(
    @Param('customerId') customerId: string,
    @Body() body: Record<string, unknown>,
    @Req() request: AdminRequest,
  ) {
    return this.operations.updateCustomer(customerId, body, request.user.username);
  }

  @Patch('customers/:customerId/status')
  @RequirePermissions('customers.manage')
  customerStatus(
    @Param('customerId') customerId: string,
    @Body() body: { status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED' | 'CLOSED'; reason: string },
    @Req() request: AdminRequest,
  ) {
    return this.operations.changeCustomerStatus(
      customerId,
      body.status,
      body.reason,
      request.user.username,
    );
  }

  @Get('transactions')
  @RequirePermissions('transactions.read')
  transactions(@Query() query: Record<string, string>) {
    return this.operations.transactions(query);
  }

  @Get('transactions/:transactionId')
  @RequirePermissions('transactions.read')
  transaction(@Param('transactionId') transactionId: string) {
    return this.operations.transaction(transactionId);
  }

  @Get('pricing-flows')
  @RequirePermissions('pricing_rules.read')
  pricingRuleFlows(@Query() query: Record<string, string>) {
    return this.pricingFlows.list(query);
  }

  @Get('pricing-flows/:id')
  @RequirePermissions('pricing_rules.read')
  pricingRuleFlow(@Param('id') id: string) {
    return this.pricingFlows.get(id);
  }

  @Post('pricing-flows')
  @RequirePermissions('pricing_rules.make')
  createPricingRuleFlow(
    @Body() body: Record<string, unknown>,
    @Req() request: AdminRequest,
  ) {
    return this.pricingFlows.create(body, request.user.username);
  }

  @Patch('pricing-flows/:id')
  @RequirePermissions('pricing_rules.make')
  updatePricingRuleFlow(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() request: AdminRequest,
  ) {
    return this.pricingFlows.update(id, body, request.user.username);
  }

  @Post('pricing-flows/:id/submit')
  @RequirePermissions('pricing_rules.make')
  submitPricingRuleFlow(
    @Param('id') id: string,
    @Req() request: AdminRequest,
  ) {
    return this.pricingFlows.transition(id, 'submit', request.user.username);
  }

  @Post('pricing-flows/:id/approve')
  @RequirePermissions('pricing_rules.check')
  approvePricingRuleFlow(@Param('id') id: string, @Req() request: AdminRequest) {
    return this.pricingFlows.transition(
      id,
      'approve',
      request.user.username,
      undefined,
      request.user.roles.includes('super_admin'),
    );
  }

  @Post('pricing-flows/:id/activate')
  @RequirePermissions('pricing_rules.check')
  activatePricingRuleFlow(@Param('id') id: string, @Req() request: AdminRequest) {
    return this.pricingFlows.transition(id, 'activate', request.user.username);
  }

  @Post('pricing-flows/:id/retire')
  @RequirePermissions('pricing_rules.check')
  retirePricingRuleFlow(@Param('id') id: string, @Req() request: AdminRequest) {
    return this.pricingFlows.transition(id, 'retire', request.user.username);
  }

  @Post('pricing-flows/:id/reject')
  @RequirePermissions('pricing_rules.check')
  rejectPricingRuleFlow(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() request: AdminRequest,
  ) {
    return this.pricingFlows.transition(
      id,
      'reject',
      request.user.username,
      body.reason ? String(body.reason) : undefined,
      request.user.roles.includes('super_admin'),
    );
  }

  @Post('pricing-flows/simulate')
  @RequirePermissions('pricing_rules.simulate')
  simulatePricingRuleFlow(@Body() body: Record<string, unknown>) {
    if (
      body.sourceWalletType === undefined ||
      body.destinationWalletType === undefined
    ) {
      throw new BadRequestException(
        'Source wallet type and destination wallet type are required',
      );
    }
    return this.pricingFlows.simulate(
      body.definition,
      body.amount,
      body.sourceWalletType,
      body.destinationWalletType,
    );
  }

  @Get('charges')
  @RequirePermissions('charges.read')
  charges() { return this.operations.listCharges(); }

  @Get('charges/:id')
  @RequirePermissions('charges.read')
  charge(@Param('id', ParseIntPipe) id: number) { return this.operations.getCharge(id); }

  @Post('charges')
  @RequirePermissions('charges.make')
  createCharge(@Body() body: Record<string, unknown>, @Req() request: AdminRequest) {
    return this.operations.createCharge(body, request.user.username);
  }

  @Post('charges/:id/:action')
  @RequirePermissions('charges.check')
  chargeAction(
    @Param('id', ParseIntPipe) id: number,
    @Param('action') action: string,
    @Body() body: Record<string, unknown>,
    @Req() request: AdminRequest,
  ) {
    if (action === 'detail') {
      return this.operations.createChargeDetail(id, body, request.user.username);
    }
    return action === 'approve'
      ? this.operations.approveCharge(id, request.user.username)
      : this.operations.deactivateCharge(id, request.user.username);
  }

  @Get('commissions')
  @RequirePermissions('commissions.read')
  commissions() { return this.operations.listCommissions(); }

  @Get('commissions/:id')
  @RequirePermissions('commissions.read')
  commission(@Param('id', ParseIntPipe) id: number) {
    return this.operations.getCommission(id);
  }

  @Post('commissions')
  @RequirePermissions('commissions.make')
  createCommission(@Body() body: Record<string, unknown>, @Req() request: AdminRequest) {
    return this.operations.createCommission(body, request.user.username);
  }

  @Post('commissions/:id/:action')
  @RequirePermissions('commissions.check')
  commissionAction(
    @Param('id', ParseIntPipe) id: number,
    @Param('action') action: string,
    @Body() body: Record<string, unknown>,
    @Req() request: AdminRequest,
  ) {
    if (action === 'detail') {
      return this.operations.createCommissionDetail(id, body, request.user.username);
    }
    return action === 'approve'
      ? this.operations.approveCommission(id, request.user.username)
      : this.operations.deactivateCommission(id, request.user.username);
  }

  @Get('aml/activity')
  @RequirePermissions('aml.read')
  amlActivity(@Query() query: Record<string, string>) {
    return this.operations.amlActivity(query);
  }

  @Get('aml/cases')
  @RequirePermissions('aml.read')
  amlCases(@Query() query: Record<string, string>) {
    return this.operations.amlCases(query);
  }

  @Post('aml/cases')
  @RequirePermissions('aml.make')
  createAmlCase(@Body() body: Record<string, unknown>, @Req() request: AdminRequest) {
    return this.operations.createAmlCase(body, request.user.username);
  }

  @Patch('aml/cases/:id')
  @RequirePermissions('aml.check')
  updateAmlCase(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() request: AdminRequest,
  ) {
    return this.operations.updateAmlCase(id, body, request.user.username);
  }

  @All('credit/*path')
  @RequirePermissions('credit_rules.read')
  credit(
    @Param('path') path: string | string[],
    @Req() request: AdminRequest,
    @Query() query: Record<string, unknown>,
    @Body() body: unknown,
  ) {
    return this.operations.proxy(
      'credit',
      Array.isArray(path) ? path.join('/') : path,
      request.method,
      query,
      body,
      request.user.username,
    );
  }

  @All('accounting/*path')
  @RequirePermissions('accounting.read')
  accounting(
    @Param('path') path: string | string[],
    @Req() request: AdminRequest,
    @Query() query: Record<string, unknown>,
    @Body() body: unknown,
  ) {
    if (!['GET', 'HEAD'].includes(request.method.toUpperCase())
      && !request.user.permissions?.includes('accounting.operate')) {
      throw new ForbiddenException('accounting.operate permission is required');
    }
    return this.operations.proxy(
      'accounting',
      Array.isArray(path) ? path.join('/') : path,
      request.method,
      query,
      body,
      request.user.username,
    );
  }

  @Post('kyc/cases/:id/documents')
  @RequirePermissions('kyc.operate')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  }))
  uploadKycDocument(
    @Param('id') id: string,
    @Body('role') role: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: AdminRequest,
  ) {
    return this.operations.proxyKycDocument(id, role, file, request.user.username);
  }

  @Get('kyc/cases/:id/documents/:documentId/url')
  @RequirePermissions('kyc.documents.read')
  kycDocumentUrl(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Req() request: AdminRequest,
  ) {
    return this.operations.proxy(
      'kyc',
      `cases/${id}/documents/${documentId}/url`,
      'GET',
      {},
      undefined,
      request.user.username,
    );
  }

  @Post('kyc/sanctions/upload')
  @RequirePermissions('kyc.configure')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  }))
  uploadKycSanctions(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('listName') listName: string,
    @Body('mode') mode: string,
    @Req() request: AdminRequest,
  ) {
    return this.operations.proxyKycSanctionFile(
      file,
      listName,
      mode,
      request.user.username,
    );
  }

  @All('kyc/*path')
  @RequirePermissions('kyc.read')
  kyc(
    @Param('path') path: string | string[],
    @Req() request: AdminRequest,
    @Query() query: Record<string, unknown>,
    @Body() body: unknown,
  ) {
    if (!['GET', 'HEAD'].includes(request.method.toUpperCase())) {
      const required = request.url.includes('/sanctions/')
        ? 'kyc.configure'
        : request.url.includes('/review')
          ? 'kyc.review'
          : 'kyc.operate';
      if (!request.user.permissions?.includes(required)) {
        throw new ForbiddenException(`${required} permission is required`);
      }
    }
    return this.operations.proxy(
      'kyc',
      Array.isArray(path) ? path.join('/') : path,
      request.method,
      query,
      body,
      request.user.username,
    );
  }
}
