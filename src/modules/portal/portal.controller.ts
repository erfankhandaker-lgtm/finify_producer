import {
  BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { memoryStorage } from 'multer';
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

  @Get('kyc') kyc(@Req() request: PortalRequest) {
    return this.portal.kycJourney(request.user.username);
  }

  @Post('kyc/documents')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  }))
  uploadKycDocument(
    @Req() request: PortalRequest,
    @Body('role') role: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('Select a KYC document image');
    return this.portal.uploadKycDocument(request.user.username, role, file);
  }

  @Post('kyc/verify') verifyKyc(@Req() request: PortalRequest) {
    return this.portal.verifyKyc(request.user.username);
  }

  @Post('payments') payment(@Req() request: PortalRequest, @Body() input: PortalPaymentDto) {
    return this.portal.payment(request.user.username, input);
  }

  @Patch('security/pin') changePin(@Req() request: PortalRequest, @Body() input: ChangePortalPinDto) {
    return this.portal.changePin(request.user.username, input);
  }
}
