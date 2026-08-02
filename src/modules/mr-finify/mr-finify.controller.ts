import { Controller, Get, Post, Body, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { AdminTokenPayload } from '../admin-auth/admin-auth.types';
import { RequirePermissions } from '../admin-auth/permissions.decorator';
import { AdminPermissionsGuard } from '../admin-auth/permissions.guard';
import { MrFinifyChatDto, UpdateMrFinifyConfigurationDto } from './dto/mr-finify.dto';
import { MrFinifyService } from './mr-finify.service';

type AdminRequest = Request & { user: AdminTokenPayload };

@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
@Controller('admin/assistant')
export class MrFinifyController {
  constructor(private readonly assistant: MrFinifyService) {}

  @Get('status')
  @RequirePermissions('assistant.use')
  status(@Req() request: AdminRequest) {
    return this.assistant.status(request.user);
  }

  @Post('chat')
  @RequirePermissions('assistant.use')
  chat(@Body() body: MrFinifyChatDto, @Req() request: AdminRequest) {
    return this.assistant.chat(body, request.user);
  }

  @Get('audit')
  @RequirePermissions('assistant.audit')
  audit(@Query('limit') limit: string | undefined) {
    return this.assistant.audit(limit);
  }

  @Get('configuration')
  @RequirePermissions('assistant.configure')
  configuration() {
    return this.assistant.configuration();
  }

  @Post('configuration')
  @RequirePermissions('assistant.configure')
  updateConfiguration(
    @Body() body: UpdateMrFinifyConfigurationDto,
    @Req() request: AdminRequest,
  ) {
    return this.assistant.updateConfiguration(body, request.user);
  }
}
