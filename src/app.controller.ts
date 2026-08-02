import { Controller, HttpCode, Get, Header } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('hello')
export class AppController  {
  constructor(
    private readonly appService: AppService
  ) {
     // super()
  }

  @Get()
  @HttpCode(204)
  @Header('Cache-Control', 'none')
  getHello(): string {
    return this.appService.getHello();
  }
}
