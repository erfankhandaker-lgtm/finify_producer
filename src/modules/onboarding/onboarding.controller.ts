import { Body, Controller, Get, Headers, Param, Post, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AdvanceJourneyStepDto, StartJourneyDto } from './dto/onboarding.dto';
import { ConsumeChannelHandoffDto,CreateChannelHandoffDto } from './dto/channel.dto';
import { OnboardingService } from './onboarding.service';
import { ChannelService } from './channel.service';
import { OnboardingRuntimeService } from './onboarding-runtime.service';
import {
  AcceptOnboardingConsentDto,
  CreateOnboardingPinDto,
  OnboardingKycDocumentDto,
  OnboardingNodeCallbackDto,
  StartOnboardingKycDto,
  SubmitOnboardingProfileDto,
  VerifyOnboardingOtpDto,
  VerifyOnboardingPinDto,
} from './dto/onboarding-runtime.dto';

@Controller('api/v1/onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService,private readonly channels:ChannelService,
    private readonly runtime: OnboardingRuntimeService) {}

  @Post('instances')
  start(@Body() input: StartJourneyDto,@Headers('x-correlation-id') correlationId?: string,
    @Headers('x-finify-channel-client-id') clientId?:string,
    @Headers('x-finify-channel-credential') clientCredential?:string) {
    return this.onboarding.startOrResume(input,correlationId,clientId,clientCredential);
  }

  @Get('instances/resume')
  resume(@Query('token') token: string) { return this.onboarding.resume(token); }

  @Post('instances/:instanceId/steps')
  advance(
    @Param('instanceId') instanceId: string,
    @Body() input: AdvanceJourneyStepDto,
    @Headers('x-onboarding-resume-token') resumeToken: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    return this.onboarding.advanceStep(
      instanceId,input,resumeToken,idempotencyKey,correlationId,
    );
  }

  @Post('instances/:instanceId/handoffs')
  handoff(@Param('instanceId') instanceId:string,@Body() input:CreateChannelHandoffDto,
    @Headers('x-onboarding-resume-token') resumeToken:string,
    @Headers('idempotency-key') idempotencyKey:string,
    @Headers('x-correlation-id') correlationId?:string){
    return this.channels.createHandoff(instanceId,resumeToken,idempotencyKey,input.expiresInSeconds,correlationId);
  }

  @Post('handoffs/consume')
  consumeHandoff(@Body() input:ConsumeChannelHandoffDto,
    @Headers('x-finify-channel-client-id') clientId?:string,
    @Headers('x-finify-channel-credential') credential?:string,
    @Headers('x-correlation-id') correlationId?:string){
    return this.channels.consumeHandoff(input.handoffToken,clientId,credential,correlationId);
  }

  @Post('instances/:instanceId/otp/challenges')
  createOtp(@Param('instanceId') id:string,@Headers('x-onboarding-resume-token') token:string,
    @Headers('idempotency-key') key:string){ return this.runtime.createOtpChallenge(id,token,key); }

  @Post('instances/:instanceId/otp/verify')
  verifyOtp(@Param('instanceId') id:string,@Headers('x-onboarding-resume-token') token:string,
    @Headers('idempotency-key') key:string,@Body() input:VerifyOnboardingOtpDto){
    return this.runtime.verifyOtp(id,token,key,input);
  }

  @Post('instances/:instanceId/pin')
  createPin(@Param('instanceId') id:string,@Headers('x-onboarding-resume-token') token:string,
    @Headers('idempotency-key') key:string,@Body() input:CreateOnboardingPinDto){
    return this.runtime.createPin(id,token,key,input);
  }

  @Post('instances/:instanceId/pin/verify')
  verifyPin(@Param('instanceId') id:string,@Headers('x-onboarding-resume-token') token:string,
    @Body() input:VerifyOnboardingPinDto){ return this.runtime.verifyPin(id,token,input); }

  @Post('instances/:instanceId/consents')
  consent(@Param('instanceId') id:string,@Headers('x-onboarding-resume-token') token:string,
    @Headers('idempotency-key') key:string,@Body() input:AcceptOnboardingConsentDto,@Req() request:any){
    return this.runtime.acceptConsent(id,token,key,input,request.ip,request.headers['user-agent']);
  }

  @Post('instances/:instanceId/profile')
  profile(@Param('instanceId') id:string,@Headers('x-onboarding-resume-token') token:string,
    @Headers('idempotency-key') key:string,@Body() input:SubmitOnboardingProfileDto){
    return this.runtime.submitProfile(id,token,key,input);
  }

  @Post('instances/:instanceId/kyc')
  startKyc(@Param('instanceId') id:string,@Headers('x-onboarding-resume-token') token:string,
    @Headers('idempotency-key') key:string,@Body() input:StartOnboardingKycDto){
    return this.runtime.startKyc(id,token,key,input);
  }

  @Get('instances/:instanceId/kyc')
  getKyc(@Param('instanceId') id:string,@Headers('x-onboarding-resume-token') token:string){
    return this.runtime.getKyc(id,token);
  }

  @Post('instances/:instanceId/kyc/documents')
  @UseInterceptors(FileInterceptor('file',{storage:memoryStorage(),limits:{fileSize:10*1024*1024,files:1}}))
  uploadKyc(@Param('instanceId') id:string,@Headers('x-onboarding-resume-token') token:string,
    @Body() input:OnboardingKycDocumentDto,@UploadedFile() file:Express.Multer.File){
    return this.runtime.uploadKycDocument(id,token,input.role,file);
  }

  @Post('instances/:instanceId/kyc/verify')
  verifyKyc(@Param('instanceId') id:string,@Headers('x-onboarding-resume-token') token:string){
    return this.runtime.verifyKyc(id,token);
  }

  @Post('instances/:instanceId/wallet')
  wallet(@Param('instanceId') id:string,@Headers('x-onboarding-resume-token') token:string,
    @Headers('idempotency-key') key:string){ return this.runtime.allocateWallet(id,token,key); }

  @Post('internal/instances/:instanceId/callbacks')
  callback(@Param('instanceId') id:string,@Headers('x-onboarding-callback-key') key:string,
    @Body() input:OnboardingNodeCallbackDto){ return this.runtime.callback(id,key,input); }
}
