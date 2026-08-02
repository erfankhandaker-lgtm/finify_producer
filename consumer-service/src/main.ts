import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

const isProduction = () => ['prod', 'production'].includes(String(
  process.env.NODE_MODE || process.env.NODE_ENV || 'development',
).toLowerCase());

async function bootstrap(): Promise<void> {
  if (isProduction()) {
    const missing = ['INTEGRATION_ADMIN_API_KEY', 'INTEGRATION_SECRET_KEY']
      .filter((key) => !String(process.env[key] || '').trim());
    if (missing.length) throw new Error(`Production configuration is incomplete: ${missing.join(', ')}`);
  }
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger: ['log', 'error', 'warn', 'debug'],
  });

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  if (!isProduction()) {
    const swaggerConfig = new DocumentBuilder()
    .setTitle('Finify Merchant Integration API')
    .setDescription('Configure merchant API/Kafka routing, preview field mappings, confirm reserved transactions, and submit dispute reversals.')
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-admin-api-key' }, 'admin-api-key')
    .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs-json' });
  }

  app.enableShutdownHooks();
  const port = Number(process.env.CONSUMER_HTTP_PORT ?? 5003);
  await app.listen(port, '0.0.0.0');
  Logger.log(`Finify transaction consumer and integration API are running on port ${port}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  Logger.error(message, undefined, 'Bootstrap');
  process.exitCode = 1;
});
