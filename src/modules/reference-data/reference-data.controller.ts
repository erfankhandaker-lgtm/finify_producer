import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { AdminTokenPayload } from '../admin-auth/admin-auth.types';
import { AdminPermissionsGuard } from '../admin-auth/permissions.guard';
import { RequirePermissions } from '../admin-auth/permissions.decorator';
import {
  AmlConfigurationListQueryDto,
  ChangeRequestListQueryDto,
  CreateAmlConfigurationDto,
  CreateKeywordDto,
  CreateWalletTypeDto,
  ReferenceListQueryDto,
  RejectChangeDto,
  ReviewChangeDto,
  SimulateAmlConfigurationDto,
  UpdateAmlConfigurationDto,
  UpdateKeywordDto,
  UpdateWalletTypeDto,
} from './dto/reference-data.dto';
import { ReferenceDataService } from './reference-data.service';

type AdminRequest = Request & { user: AdminTokenPayload };

@ApiTags('Admin Reference Data - Maker Checker')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
@Controller('admin/reference-data')
export class ReferenceDataController {
  constructor(private readonly service: ReferenceDataService) {}

  @Get('keywords')
  @RequirePermissions('reference_data.read')
  @ApiOperation({ summary: 'List live keywords with pending-change indicators for the UI' })
  listKeywords(@Query() query: ReferenceListQueryDto) { return this.service.listKeywords(query); }

  @Get('keywords/:keyword')
  @RequirePermissions('reference_data.read')
  @ApiOperation({ summary: 'Get a live keyword and its pending maker request' })
  getKeyword(@Param('keyword') keyword: string) { return this.service.getKeyword(keyword); }

  @Post('keywords')
  @RequirePermissions('reference_data.make')
  @ApiOperation({ summary: 'Submit a new keyword for checker approval' })
  @ApiResponse({ status: 201, description: 'Pending CREATE request created; the live keyword is unchanged.' })
  createKeyword(@Body() dto: CreateKeywordDto, @Req() request: AdminRequest) {
    return this.service.createKeyword(dto, request.user);
  }

  @Patch('keywords/:keyword')
  @RequirePermissions('reference_data.make')
  @ApiOperation({ summary: 'Submit changes to an existing keyword for checker approval' })
  updateKeyword(@Param('keyword') keyword: string, @Body() dto: UpdateKeywordDto, @Req() request: AdminRequest) {
    return this.service.updateKeyword(keyword, dto, request.user);
  }

  @Delete('keywords/:keyword')
  @RequirePermissions('reference_data.make')
  @ApiOperation({ summary: 'Submit keyword deactivation for approval', description: 'Historical master records are not physically deleted.' })
  deleteKeyword(@Param('keyword') keyword: string, @Body() dto: ReviewChangeDto, @Req() request: AdminRequest) {
    return this.service.deleteKeyword(keyword, dto.comment, request.user);
  }

  @Get('wallet-types')
  @RequirePermissions('reference_data.read')
  @ApiOperation({ summary: 'List live wallet types with pending-change indicators for the UI' })
  listWalletTypes(@Query() query: ReferenceListQueryDto) { return this.service.listWalletTypes(query); }

  @Get('wallet-types/:walletId')
  @RequirePermissions('reference_data.read')
  @ApiOperation({ summary: 'Get a live wallet type and its pending maker request' })
  getWalletType(@Param('walletId', ParseIntPipe) walletId: number) { return this.service.getWalletType(walletId); }

  @Post('wallet-types')
  @RequirePermissions('reference_data.make')
  @ApiOperation({ summary: 'Submit a new wallet type for checker approval' })
  createWalletType(@Body() dto: CreateWalletTypeDto, @Req() request: AdminRequest) {
    return this.service.createWalletType(dto, request.user);
  }

  @Patch('wallet-types/:walletId')
  @RequirePermissions('reference_data.make')
  @ApiOperation({ summary: 'Submit changes to an existing wallet type for checker approval' })
  updateWalletType(
    @Param('walletId', ParseIntPipe) walletId: number,
    @Body() dto: UpdateWalletTypeDto,
    @Req() request: AdminRequest,
  ) { return this.service.updateWalletType(walletId, dto, request.user); }

  @Delete('wallet-types/:walletId')
  @RequirePermissions('reference_data.make')
  @ApiOperation({ summary: 'Submit wallet-type deactivation for approval', description: 'Referenced wallet types are not physically deleted.' })
  deleteWalletType(
    @Param('walletId', ParseIntPipe) walletId: number,
    @Body() dto: ReviewChangeDto,
    @Req() request: AdminRequest,
  ) { return this.service.deleteWalletType(walletId, dto.comment, request.user); }

  @Get('aml-configurations')
  @RequirePermissions('reference_data.read')
  @ApiOperation({ summary: 'List live AML limit profiles with pending-change indicators for the UI' })
  listAmlConfigurations(@Query() query: AmlConfigurationListQueryDto) {
    return this.service.listAmlConfigurations(query);
  }

  @Get('aml-configurations/:walletCode/:keyword')
  @RequirePermissions('reference_data.read')
  @ApiOperation({ summary: 'Get one AML profile by wallet code and keyword' })
  getAmlConfiguration(
    @Param('walletCode', ParseIntPipe) walletCode: number,
    @Param('keyword') keyword: string,
  ) { return this.service.getAmlConfiguration(walletCode, keyword); }

  @Post('aml-configurations')
  @RequirePermissions('reference_data.make')
  @ApiOperation({ summary: 'Submit a new AML limit profile for checker approval' })
  @ApiResponse({ status: 201, description: 'Pending CREATE request created; live AML limits are unchanged.' })
  createAmlConfiguration(@Body() dto: CreateAmlConfigurationDto, @Req() request: AdminRequest) {
    return this.service.createAmlConfiguration(dto, request.user);
  }

  @Post('aml-configurations/simulate')
  @RequirePermissions('reference_data.read')
  @ApiOperation({ summary: 'Simulate AML limit evaluation without reserving capacity or changing live data' })
  simulateAmlConfiguration(@Body() dto: SimulateAmlConfigurationDto) {
    return this.service.simulateAmlConfiguration(dto);
  }

  @Patch('aml-configurations/:walletCode/:keyword')
  @RequirePermissions('reference_data.make')
  @ApiOperation({ summary: 'Submit AML limit changes for checker approval' })
  updateAmlConfiguration(
    @Param('walletCode', ParseIntPipe) walletCode: number,
    @Param('keyword') keyword: string,
    @Body() dto: UpdateAmlConfigurationDto,
    @Req() request: AdminRequest,
  ) { return this.service.updateAmlConfiguration(walletCode, keyword, dto, request.user); }

  @Delete('aml-configurations/:walletCode/:keyword')
  @RequirePermissions('reference_data.make')
  @ApiOperation({ summary: 'Submit AML profile deactivation for approval', description: 'AML audit records are not physically deleted.' })
  deleteAmlConfiguration(
    @Param('walletCode', ParseIntPipe) walletCode: number,
    @Param('keyword') keyword: string,
    @Body() dto: ReviewChangeDto,
    @Req() request: AdminRequest,
  ) { return this.service.deleteAmlConfiguration(walletCode, keyword, dto.comment, request.user); }

  @Get('change-requests')
  @RequirePermissions('reference_data.read')
  @ApiOperation({ summary: 'List pending and historical maker-checker requests' })
  listRequests(@Query() query: ChangeRequestListQueryDto) { return this.service.listChangeRequests(query); }

  @Get('change-requests/:id')
  @RequirePermissions('reference_data.read')
  @ApiParam({ name: 'id', example: '1' })
  @ApiOperation({ summary: 'Get before/after snapshots and audit details for a change request' })
  getRequest(@Param('id') id: string) { return this.service.getChangeRequest(id); }

  @Post('change-requests/:id/approve')
  @RequirePermissions('reference_data.check')
  @ApiOperation({ summary: 'Approve and atomically apply a pending request' })
  @ApiResponse({ status: 403, description: 'The checker is the same administrator as the maker.' })
  approve(@Param('id') id: string, @Body() dto: ReviewChangeDto, @Req() request: AdminRequest) {
    return this.service.approve(id, dto.comment, request.user);
  }

  @Post('change-requests/:id/reject')
  @RequirePermissions('reference_data.check')
  @ApiOperation({ summary: 'Reject a pending request without changing live data' })
  reject(@Param('id') id: string, @Body() dto: RejectChangeDto, @Req() request: AdminRequest) {
    return this.service.reject(id, dto.reason, request.user);
  }

  @Post('change-requests/:id/cancel')
  @RequirePermissions('reference_data.make')
  @ApiOperation({ summary: 'Cancel a pending request created by the current maker' })
  cancel(@Param('id') id: string, @Req() request: AdminRequest) {
    return this.service.cancel(id, request.user);
  }
}
