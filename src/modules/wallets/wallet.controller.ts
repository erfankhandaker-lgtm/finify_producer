import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../middleware/guards';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { AdminTokenPayload } from '../admin-auth/admin-auth.types';
import { RequirePermissions } from '../admin-auth/permissions.decorator';
import { AdminPermissionsGuard } from '../admin-auth/permissions.guard';
import {
  AdminWalletQueryDto,
  ChangeWalletStatusDto,
  CreateAdditionalWalletDto,
  CreateCustomerWithWalletDto,
  UpdateWalletRoutingDto,
  WalletTransactionQueryDto,
} from './dto/wallet.dto';
import { WalletService } from './wallet.service';

type CustomerRequest = Request & { user: { username: string } };
type AdminRequest = Request & { user: AdminTokenPayload };

@ApiTags('Customer wallets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallets')
export class CustomerWalletController {
  constructor(private readonly wallets: WalletService) {}

  @Get() @ApiOperation({ summary: 'List every wallet owned by the authenticated customer' })
  list(@Req() req: CustomerRequest) { return this.wallets.listMine(req.user.username); }

  @Post() @ApiOperation({ summary: 'Create an additional wallet; the customer main wallet must already exist' })
  create(@Req() req: CustomerRequest, @Body() dto: CreateAdditionalWalletDto) {
    return this.wallets.createAdditional(req.user.username, dto);
  }

  @Get(':walletId') @ApiOperation({ summary: 'Get one owned wallet' })
  @ApiParam({ name: 'walletId', example: '990000000001' })
  get(@Req() req: CustomerRequest, @Param('walletId') id: string) {
    return this.wallets.getMine(req.user.username, id);
  }

  @Post(':walletId/default') @ApiOperation({ summary: 'Make an active wallet the default for its currency' })
  setDefault(@Req() req: CustomerRequest, @Param('walletId') id: string) {
    return this.wallets.setDefault(req.user.username, id);
  }

  @Patch(':walletId/routing')
  @ApiOperation({ summary: 'Add, change, or clear IBAN and SWIFT/BIC routing details' })
  routing(
    @Req() req: CustomerRequest,
    @Param('walletId') id: string,
    @Body() dto: UpdateWalletRoutingDto,
  ) {
    return this.wallets.updateRoutingForCustomer(req.user.username, id, dto);
  }

  @Get(':walletId/transactions') @ApiOperation({ summary: 'List ledger entries for one owned wallet' })
  transactions(@Req() req: CustomerRequest, @Param('walletId') id: string,
    @Query() query: WalletTransactionQueryDto) {
    return this.wallets.transactions(req.user.username, id, query);
  }
}

@ApiTags('Admin wallets')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
@Controller('admin/wallets')
export class AdminWalletController {
  constructor(private readonly wallets: WalletService) {}

  @Get() @RequirePermissions('wallets.read')
  @ApiOperation({ summary: 'Search all customer, agent, merchant, and system wallets' })
  list(@Query() query: AdminWalletQueryDto) { return this.wallets.adminList(query); }

  @Get('customer-types/eligible')
  @RequirePermissions('wallets.read')
  @ApiOperation({ summary: 'List active customer wallet types and their KYC requirement' })
  customerTypes() { return this.wallets.listCustomerWalletTypes(); }

  @Post('customers')
  @RequirePermissions('customers.manage', 'wallets.manage')
  @ApiOperation({ summary: 'Create a customer with their required default-currency wallet' })
  createCustomer(
    @Req() req: AdminRequest,
    @Body() dto: CreateCustomerWithWalletDto,
  ) {
    return this.wallets.createCustomer(dto, req.user.username);
  }

  @Post('customers/:customerId/complete-opening')
  @RequirePermissions('customers.manage', 'wallets.manage')
  @ApiOperation({ summary: 'Complete a pending default-wallet opening after required KYC approval' })
  completeCustomerOpening(
    @Req() req: AdminRequest,
    @Param('customerId') customerId: string,
  ) {
    return this.wallets.completeCustomerAccountOpening(customerId, req.user.username);
  }

  @Post('customers/:customerId')
  @RequirePermissions('customers.manage', 'wallets.manage')
  @ApiOperation({ summary: 'Add another currency wallet to an existing customer' })
  createCustomerWallet(
    @Req() req: AdminRequest,
    @Param('customerId') customerId: string,
    @Body() dto: CreateAdditionalWalletDto,
  ) {
    return this.wallets.createAdditionalForAdmin(customerId, dto, req.user.username);
  }

  @Post(':walletId/default')
  @RequirePermissions('wallets.manage')
  @ApiOperation({ summary: 'Set the customer default wallet and default currency' })
  setDefault(@Req() req: AdminRequest, @Param('walletId') id: string) {
    return this.wallets.setDefaultForAdmin(id, req.user.username);
  }

  @Patch(':walletId/routing')
  @RequirePermissions('wallets.manage')
  @ApiOperation({ summary: 'Add, change, or clear customer-wallet IBAN and SWIFT/BIC routing' })
  routing(
    @Req() req: AdminRequest,
    @Param('walletId') id: string,
    @Body() dto: UpdateWalletRoutingDto,
  ) {
    return this.wallets.updateRoutingForAdmin(id, dto, req.user.username);
  }

  @Patch(':walletId/status') @RequirePermissions('wallets.manage')
  @ApiOperation({ summary: 'Activate, suspend, freeze, or close a wallet without deleting history' })
  status(@Req() req: AdminRequest, @Param('walletId') id: string, @Body() dto: ChangeWalletStatusDto) {
    return this.wallets.changeStatus(id, dto, req.user.username);
  }

  @Get(':walletId/history') @RequirePermissions('wallets.read')
  @ApiOperation({ summary: 'List immutable operational audit history for a wallet' })
  history(@Param('walletId') id: string) { return this.wallets.history(id); }
}
