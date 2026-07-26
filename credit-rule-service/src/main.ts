import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug']
  });
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true
  }));
  app.enableCors();
  const swagger = new DocumentBuilder()
    .setTitle('Finify Credit Rule API')
    .setDescription(
      'Manage versioned category/product credit policies, data sources, rule approval, simulations, and explainable credit decisions.'
    )
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-api-key' }, 'api-key')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-actor-id' }, 'actor-id')
    .build();
  const document = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs-json' });
  const port = Number(process.env.CREDIT_RULE_HTTP_PORT ?? 5005);
  await app.listen(port, '0.0.0.0');
  Logger.log(`Finify credit-rule service is running on port ${port}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  Logger.error(error instanceof Error ? error.stack ?? error.message : String(error), undefined, 'Bootstrap');
  process.exitCode = 1;
});
