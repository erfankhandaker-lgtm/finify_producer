import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../../middleware/guards';
import { ChangePortalPinDto, PortalActivityQueryDto, PortalPaymentDto } from './dto/portal.dto';
import { PortalService } from './portal.service';

type PortalRequest = Request & { user: { username: string } };

@Controller('portal')
@UseGuards(JwtAuthGuard)
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get('dashboard') dashboard(@Req() request: PortalRequest) {
    return this.portal.dashboard(request.user.username);
  }

  @Get('activity') activity(@Req() request: PortalRequest, @Query() query: PortalActivityQueryDto) {
    return this.portal.activity(request.user.username, query);
  }

  @Get('recipients/:walletId') recipient(@Req() request: PortalRequest, @Param('walletId') walletId: string) {
    return this.portal.recipient(request.user.username, walletId);
  }

  @Get('services') services() { return this.portal.services(); }

  @Post('payments') payment(@Req() request: PortalRequest, @Body() input: PortalPaymentDto) {
    return this.portal.payment(request.user.username, input);
  }

  @Patch('security/pin') changePin(@Req() request: PortalRequest, @Body() input: ChangePortalPinDto) {
    return this.portal.changePin(request.user.username, input);
  }
}
