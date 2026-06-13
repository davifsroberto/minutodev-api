import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

// Allowlist vazia (CORS_ORIGINS ausente/vazia) é intencional: o boot não deve
// quebrar, apenas resultar em nenhum acesso cross-origin (o front cai no estado
// de erro). Por isso o parsing tolera entradas ausentes em vez de lançar.
export const parseCorsOrigins = (raw: string | undefined): string[] => {
  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
};

// Caminho de bootstrap compartilhado entre o main.ts de produção e o harness de
// testes de integração, garantindo que os testes exercitem a configuração real.
export const configureBootstrapGlobals = (app: INestApplication): void => {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  app.enableCors({
    origin: parseCorsOrigins(process.env.CORS_ORIGINS),
    methods: ['GET'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('minutoDev API')
    .setDescription('minutoDev HTTP API')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/json',
  });
};
