import { Module } from '@nestjs/common';
import {HttpModule} from '@nestjs/axios';
import { ApifetchService } from './apifetch.service';
import { ApifetchController } from './apifetch.controller';

@Module({
  imports: [
    HttpModule.register({
    //timeout: 5000,
    maxRedirects: 5,
  })
],
  providers: [ApifetchService],
  controllers: [ApifetchController]
})
export class ApifetchModule {}
