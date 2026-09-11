import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { AdminTokenPayload } from '../admin-auth/admin-auth.types';
import { RequirePermissions } from '../admin-auth/permissions.decorator';
import { AdminPermissionsGuard } from '../admin-auth/permissions.guard';
import { CreditCommercialService } from './credit-commercial.service';
import {
  CreateCreditCommercialConfigurationDto,
  CreditCommercialTransitionDto,
  SimulateCreditCommercialConfigurationDto,
  UpdateCreditCommercialConfigurationDto,
} from './dto/credit-commercial.dto';

type AdminRequest = Request & { user: AdminTokenPayload };

@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
@Controller('api/v1/admin/credit-commercial')
export class CreditCommercialController {
  constructor(private readonly commercial: CreditCommercialService) {}

  @Get('metadata')
  @RequirePermissions('credit_commercial.read')
  metadata() { return this.commercial.metadata(); }

  @Get('configurations')
  @RequirePermissions('credit_commercial.read')
  list(@Query() query: { status?: string; environmentScope?: string }) {
    return this.commercial.list(query);
  }

  @Post('configurations')
  @RequirePermissions('credit_commercial.make')
  create(@Body() dto: CreateCreditCommercialConfigurationDto, @Req() request: AdminRequest) {
    return this.commercial.create(dto, request.user.username);
  }

  @Post('simulate')
  @RequirePermissions('credit_commercial.simulate')
  simulate(@Body() dto: SimulateCreditCommercialConfigurationDto) {
    return this.commercial.simulate(dto);
  }

  @Get('configurations/:id')
  @RequirePermissions('credit_commercial.read')
  get(@Param('id') id: string) { return this.commercial.get(id); }

  @Get('configurations/:id/audit')
  @RequirePermissions('credit_commercial.read')
  audit(@Param('id') id: string) { return this.commercial.audit(id); }

  @Put('configurations/:id')
  @RequirePermissions('credit_commercial.make')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCreditCommercialConfigurationDto,
    @Req() request: AdminRequest,
  ) { return this.commercial.update(id, dto, request.user.username); }

  @Post('configurations/:id/:action')
  @RequirePermissions('credit_commercial.read')
  transition(
    @Param('id') id: string,
    @Param('action') rawAction: string,
    @Body() dto: CreditCommercialTransitionDto,
    @Req() request: AdminRequest,
  ) {
    const action = rawAction.toUpperCase();
    if (!['SUBMIT', 'APPROVE', 'ACTIVATE', 'REJECT', 'RETIRE'].includes(action)) {
      throw new BadRequestException('Unsupported commercial configuration transition');
    }
    const makerAction = action === 'SUBMIT';
    const required = makerAction ? 'credit_commercial.make' : 'credit_commercial.check';
    if (!request.user.roles.includes('super_admin') && !request.user.permissions.includes(required)) {
      throw new ForbiddenException('Administrator lacks the required commercial permission');
    }
    return this.commercial.transition(
      id,dto.expectedRevision,
      action as 'SUBMIT' | 'APPROVE' | 'ACTIVATE' | 'REJECT' | 'RETIRE',
      request.user.username,dto.reason,
    );
  }
}
