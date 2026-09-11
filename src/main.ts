import 'dotenv/config'
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {NestExpressApplication} from '@nestjs/platform-express'
import {expressBind} from 'i18n-2'
import {localize} from './middleware'
import { ValidateInputPipe } from './middleware/validate';
import {AuthModuleGuard} from './middleware/guards'
import {nestwinstonLog, HttpPortLog} from './config/winstonLog'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import fs from 'fs'

const runtimeMode = () => String(process.env.NODE_MODE || process.env.NODE_ENV || 'development').toLowerCase();
const isProduction = () => ['prod', 'production'].includes(runtimeMode());

function validateProductionConfiguration() {
  if (!isProduction()) return;
  const required = [
    'JWTKEY',
    'ADMIN_JWT_SECRET',
    'AUTH_MODULE',
    'DB_HOST',
    'DB_USER',
    'DB_PASS',
    'DB_NAME_PRODUCTION',
    'MINIO_ACCESS_KEY',
    'MINIO_SECRET_KEY',
    'KYC_ADMIN_API_KEY',
    'ACCOUNTING_ADMIN_API_KEY',
    'INTEGRATION_ADMIN_API_KEY',
    'CREDIT_RULE_ADMIN_API_KEY',
    'CREDIT_RULE_EVALUATION_API_KEY',
    'ADMIN_MFA_ENCRYPTION_KEY',
    'ONBOARDING_PII_ENCRYPTION_KEY',
    'CORS_ALLOWED_ORIGINS',
  ];
  const missing = required.filter((key) => !String(process.env[key] || '').trim());
  if (missing.length) {
    throw new Error(`Production configuration is incomplete: ${missing.join(', ')}`);
  }
}

async function bootstrap() {
  validateProductionConfiguration();
  const NestFactoryOptions = {logger:  nestwinstonLog}

  if(process.env.SSL == 'true') {
    const httpsOptions = {
      key: fs.readFileSync('./ssl/keyfile-encrypted.key'),
      cert: fs.readFileSync('./ssl/97580e4c070d1482.crt'),
      ca: [fs.readFileSync('./ssl/gd1.crt')],
      passphrase: process.env.SSL_KEY_PASSPHRASE,
    }

    //enable ssl..
    NestFactoryOptions['httpsOptions'] = httpsOptions
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule,NestFactoryOptions)

 // global prefix
  app.setGlobalPrefix('finify')
  
   expressBind(app, {locales: [ 'en', 'bn' ] })
 
   app.use(localize)

   const allowedOrigins = String(process.env.CORS_ALLOWED_ORIGINS || '')
     .split(',')
     .map((origin) => origin.trim())
     .filter(Boolean);
   app.enableCors({
     origin: allowedOrigins.length ? allowedOrigins : !isProduction(),
     credentials: true,
     methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
   });
   app.use((_request, response, next) => {
     response.setHeader('X-Content-Type-Options', 'nosniff');
     response.setHeader('X-Frame-Options', 'DENY');
     response.setHeader('Referrer-Policy', 'no-referrer');
     response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
     next();
   });

  // handle all user input validation globally

  app.useGlobalPipes(new ValidateInputPipe());

  //use globally to check auth module from request header
  // app.useGlobalGuards(new AuthModuleGuard())

   //SwaggerModule not use for production...
   if(!isProduction()) {

    const config = new DocumentBuilder()
    .setTitle('Finify Producer API')
    .setDescription('Producer, administration, and maker-checker reference-data APIs')
    .setVersion('1.0')
    .addTag('Admin Reference Data - Maker Checker')
    .addBearerAuth(
      { 
        // I was also testing it without prefix 'Bearer ' before the JWT
        description: `[just text field] Please enter token in following format: Bearer <JWT>`,
        name: 'Authorization',
        bearerFormat: 'Bearer', // I`ve tested not to use this field, but the result was the same
        scheme: 'Bearer',
        type: 'http', // I`ve attempted type: 'apiKey' too
        in: 'Header',
      }
    )
    .addBearerAuth(
      { 
        // I was also testing it without prefix 'Bearer ' before the JWT
        description: `[just text field] Please enter token in following format: Bearer <JWT>`,
        name: 'Module',
        bearerFormat: 'Bearer', // I`ve tested not to use this field, but the result was the same
        scheme: 'Bearer',
        type: 'http', // I`ve attempted type: 'apiKey' too
        in: 'Header',
      }
    )
    .build();
  
    const document = SwaggerModule.createDocument(app, config);
  
    SwaggerModule.setup('api', app, document, { useGlobalPrefix: true });
   }

  await app.listen(process.env.PORT || 3000, () => HttpPortLog(process.env.PORT || 3000));

}

bootstrap();
