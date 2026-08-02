import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

const isProduction = () => ['prod', 'production'].includes(String(
  process.env.NODE_MODE || process.env.NODE_ENV || 'development',
).toLowerCase());

async function bootstrap() {
  if (isProduction() && !process.env.ACCOUNTING_ADMIN_API_KEY) {
    throw new Error('ACCOUNTING_ADMIN_API_KEY is required in production');
  }
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });
  app.useGlobalPipes(new ValidationPipe({
    transform: true, whitelist: true, forbidNonWhitelisted: true,
  }));
  if (!isProduction()) {
    const config = new DocumentBuilder()
    .setTitle('Finify Accounting API')
    .setDescription(
      'Per-currency EOD closure, UK accounting calendar, safeguarding reconciliation, '
      + 'trial balance, balance sheet, income statement, and wallet-holder statements.',
    )
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-admin-api-key' }, 'admin-api-key')
    .addBearerAuth()
    .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs-json' });
  }
  app.enableShutdownHooks();
  const port = Number(process.env.ACCOUNTING_HTTP_PORT ?? 5004);
  await app.listen(port, '0.0.0.0');
  Logger.log(`Finify accounting service is running on port ${port}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.stack ?? error.message : String(error), undefined, 'Bootstrap');
  process.exitCode = 1;
});
