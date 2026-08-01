import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiKeyGuard } from './api-key.guard';
import { SanctionsService } from './sanctions.service';

@UseGuards(ApiKeyGuard)
@Controller('sanctions')
export class SanctionsController {
  constructor(private readonly service: SanctionsService) {}

  @Get('status')
  status() {
    return this.service.status();
  }

  @Post('sync')
  sync(@Headers('x-actor-id') actor = 'SYSTEM') {
    return this.service.syncOfficial(actor);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  }))
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('listName') listName: string,
    @Body('mode') mode: string,
    @Headers('x-actor-id') actor = 'SYSTEM',
  ) {
    return this.service.uploadManual(file, listName, mode, actor);
  }
}
