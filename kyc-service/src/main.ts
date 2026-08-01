import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }));
  app.enableShutdownHooks();
  await app.listen(Number(process.env.KYC_HTTP_PORT || 5006), '0.0.0.0');
  Logger.log('Finify KYC service is running', 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.stack : String(error), undefined, 'Bootstrap');
  process.exitCode = 1;
});
