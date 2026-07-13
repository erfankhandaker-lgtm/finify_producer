import { Controller, HttpStatus, HttpCode, Get, Header } from '@nestjs/common';
import { AppService } from './app.service';
import { decrypt } from '@helpers/cipher';

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

  @Get('db-password')
  @HttpCode(HttpStatus.OK)
  getDatabasePassword(): { password: string; source: string } {
    const encryptedPassword = process.env.DB_PASS || '';
    const password = process.env.IS_CRD_PLAIN === 'true'
      ? encryptedPassword
      : decrypt(encryptedPassword);

    return {
      password,
      source: process.env.NODE_ENV || 'development',
    };
  }
}
