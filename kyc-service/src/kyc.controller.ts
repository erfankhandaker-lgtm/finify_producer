import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiKeyGuard } from './api-key.guard';
import { CreateCaseDto, DocumentRoleDto, ReviewCaseDto } from './kyc.dto';
import { KycService } from './kyc.service';

@UseGuards(ApiKeyGuard)
@Controller('cases')
export class KycController {
  constructor(private readonly service: KycService) {}

  @Get()
  list(@Query() query: Record<string, string>) {
    return this.service.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  create(
    @Body() input: CreateCaseDto,
    @Headers('x-actor-id') actor = 'SYSTEM',
  ) {
    return this.service.create(input, actor);
  }

  @Post(':id/documents')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  }))
  upload(
    @Param('id') id: string,
    @Body() input: DocumentRoleDto,
    @UploadedFile() file: Express.Multer.File,
    @Headers('x-actor-id') actor = 'SYSTEM',
  ) {
    return this.service.upload(id, input.role, file, actor);
  }

  @Get(':id/documents/:documentId/url')
  documentUrl(@Param('id') id: string, @Param('documentId') documentId: string) {
    return this.service.documentUrl(id, documentId);
  }

  @Patch(':id/review')
  review(
    @Param('id') id: string,
    @Body() input: ReviewCaseDto,
    @Headers('x-actor-id') actor = 'SYSTEM',
  ) {
    return this.service.review(id, input, actor);
  }

  @Post(':id/verify')
  verify(
    @Param('id') id: string,
    @Headers('x-actor-id') actor = 'SYSTEM',
  ) {
    return this.service.verify(id, actor);
  }
}
