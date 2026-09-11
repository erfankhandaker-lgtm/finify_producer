import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { AdminTokenPayload } from '../admin-auth/admin-auth.types';
import { RequirePermissions } from '../admin-auth/permissions.decorator';
import { AdminPermissionsGuard } from '../admin-auth/permissions.guard';
import {
  CreateJourneyDto,CreateJourneyVersionDto,JourneyReviewDto,
  ReplaceJourneyGraphDto,SimulateJourneyDto,
} from './dto/onboarding.dto';
import { OnboardingService } from './onboarding.service';

type AdminRequest = Request & { user: AdminTokenPayload };

@UseGuards(AdminAuthGuard,AdminPermissionsGuard)
@Controller('api/v1/admin/onboarding')
export class AdminOnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get('metadata')
  @RequirePermissions('onboarding_journeys.read')
  metadata() { return this.onboarding.getStudioMetadata(); }

  @Get('journeys')
  @RequirePermissions('onboarding_journeys.read')
  list(@Query() query: { tenantId?: string; status?: string }) {
    return this.onboarding.listJourneys(query);
  }

  @Post('journeys')
  @RequirePermissions('onboarding_journeys.make')
  create(@Body() input: CreateJourneyDto,@Req() request: AdminRequest) {
    return this.onboarding.createJourney(input,request.user.username);
  }

  @Post('journeys/:journeyId/versions')
  @RequirePermissions('onboarding_journeys.make')
  createVersion(@Param('journeyId') journeyId: string,@Body() input: CreateJourneyVersionDto,@Req() request: AdminRequest) {
    return this.onboarding.createVersion(journeyId,input,request.user.username);
  }

  @Get('versions/:versionId')
  @RequirePermissions('onboarding_journeys.read')
  version(@Param('versionId') versionId: string) { return this.onboarding.getVersion(versionId); }

  @Put('versions/:versionId/graph')
  @RequirePermissions('onboarding_journeys.make')
  graph(@Param('versionId') versionId: string,@Headers('if-match') ifMatch: string,
    @Body() input: ReplaceJourneyGraphDto,@Req() request: AdminRequest) {
    const revision=Number(String(ifMatch || '').replace(/^W\//,'').replace(/"/g,''));
    return this.onboarding.replaceGraph(versionId,input,revision,request.user.username);
  }

  @Post('versions/:versionId/validate')
  @RequirePermissions('onboarding_journeys.simulate')
  validate(@Param('versionId') versionId: string) { return this.onboarding.validateVersion(versionId); }

  @Post('versions/:versionId/simulate')
  @RequirePermissions('onboarding_journeys.simulate')
  simulate(@Param('versionId') versionId: string,@Body() input: SimulateJourneyDto) {
    return this.onboarding.simulate(versionId,input);
  }

  @Post('versions/:versionId/submit')
  @RequirePermissions('onboarding_journeys.make')
  submit(@Param('versionId') versionId: string,@Req() request: AdminRequest) {
    return this.onboarding.transitionVersion(versionId,'submit',request.user.username);
  }

  @Post('versions/:versionId/:action')
  @RequirePermissions('onboarding_journeys.check')
  review(@Param('versionId') versionId: string,@Param('action') action: string,
    @Body() input: JourneyReviewDto,@Req() request: AdminRequest) {
    if (!['approve','activate','reject','retire'].includes(action)) {
      throw new BadRequestException('Unsupported journey transition');
    }
    return this.onboarding.transitionVersion(versionId,
      action as 'approve'|'activate'|'reject'|'retire',request.user.username,input.reason);
  }
}
