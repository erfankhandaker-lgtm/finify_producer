import { BadRequestException,Body,Controller,Get,Headers,Param,Post,Put,Query,Req,UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { AdminTokenPayload } from '../admin-auth/admin-auth.types';
import { RequirePermissions } from '../admin-auth/permissions.decorator';
import { AdminPermissionsGuard } from '../admin-auth/permissions.guard';
import { ChannelService } from './channel.service';
import { ChannelReviewDto,CreateChannelClientDto,CreateChannelDto,CreateChannelVersionDto,ReplaceChannelVersionDto } from './dto/channel.dto';

type AdminRequest=Request&{user:AdminTokenPayload};

@UseGuards(AdminAuthGuard,AdminPermissionsGuard)
@Controller('api/v1/admin/onboarding/channels')
export class AdminChannelController {
  constructor(private readonly channels:ChannelService) {}
  @Get() @RequirePermissions('onboarding_channels.read')
  list(@Query('tenantId') tenantId?:string){return this.channels.list(tenantId);}
  @Post() @RequirePermissions('onboarding_channels.make')
  create(@Body() input:CreateChannelDto,@Req() request:AdminRequest){return this.channels.create(input,request.user.username);}
  @Post(':channelId/versions') @RequirePermissions('onboarding_channels.make')
  createVersion(@Param('channelId') channelId:string,@Body() input:CreateChannelVersionDto,@Req() request:AdminRequest){
    return this.channels.createVersion(channelId,input,request.user.username);
  }
  @Get('versions/:versionId') @RequirePermissions('onboarding_channels.read')
  version(@Param('versionId') versionId:string){return this.channels.getVersion(versionId);}
  @Put('versions/:versionId') @RequirePermissions('onboarding_channels.make')
  replace(@Param('versionId') versionId:string,@Headers('if-match') ifMatch:string,
    @Body() input:ReplaceChannelVersionDto,@Req() request:AdminRequest){
    const revision=Number(String(ifMatch||'').replace(/^W\//,'').replace(/"/g,''));
    if (!Number.isInteger(revision)||revision<1) throw new BadRequestException('A valid If-Match revision is required');
    return this.channels.replaceVersion(versionId,input,revision,request.user.username);
  }
  @Post('versions/:versionId/submit') @RequirePermissions('onboarding_channels.make')
  submit(@Param('versionId') versionId:string,@Req() request:AdminRequest){return this.channels.transition(versionId,'submit',request.user.username);}
  @Post('versions/:versionId/:action') @RequirePermissions('onboarding_channels.check')
  review(@Param('versionId') versionId:string,@Param('action') action:string,@Body() input:ChannelReviewDto,@Req() request:AdminRequest){
    if (!['approve','activate','reject','retire'].includes(action)) throw new BadRequestException('Unsupported channel transition');
    return this.channels.transition(versionId,action as 'approve'|'activate'|'reject'|'retire',request.user.username,input.reason);
  }
  @Get(':channelId/clients') @RequirePermissions('onboarding_channels.read')
  clients(@Param('channelId') channelId:string){return this.channels.listClients(channelId);}
  @Post(':channelId/clients') @RequirePermissions('onboarding_channels.make')
  createClient(@Param('channelId') channelId:string,@Body() input:CreateChannelClientDto,@Req() request:AdminRequest){return this.channels.createClient(channelId,input,request.user.username);}
  @Post(':channelId/clients/:clientId/revoke') @RequirePermissions('onboarding_channels.check')
  revokeClient(@Param('channelId') channelId:string,@Param('clientId') clientId:string){return this.channels.revokeClient(channelId,clientId);}
}
