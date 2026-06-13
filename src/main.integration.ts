import {
  Controller,
  Get,
  INestApplication,
  Module,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test, TestingModule } from '@nestjs/testing';

import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import request from 'supertest';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

class ValidationProbeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

@Controller('validation-probe')
class ValidationProbeController {
  @Get()
  getProbe(@Query() query: ValidationProbeQueryDto): ValidationProbeQueryDto {
    return query;
  }
}

@Module({
  controllers: [AppController, ValidationProbeController],
  providers: [AppService],
})
class BootstrapIntegrationModule {}

const configureBootstrapGlobals = (app: INestApplication): void => {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

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

describe('main.ts bootstrap globals', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [BootstrapIntegrationModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureBootstrapGlobals(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('keeps the root health route available without a global prefix', async () => {
    await request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('strips unknown query params and transforms known query params', async () => {
    const response = await request(app.getHttpServer())
      .get('/validation-probe?page=2&contentType=ARTICLE&tags=nestjs')
      .expect(200);

    expect(response.body).toEqual({ page: 2 });
  });

  it('does not reject non-whitelisted query params', async () => {
    await request(app.getHttpServer())
      .get('/validation-probe?contentType=ARTICLE&tags=nestjs')
      .expect(200)
      .expect({});
  });

  it('serializes unknown routes through the global exception filter', async () => {
    const response = await request(app.getHttpServer())
      .get('/does-not-exist')
      .expect(404);

    expect(response.body).toEqual({
      statusCode: 404,
      error: 'NOT_FOUND',
      message: expect.any(String),
      path: '/does-not-exist',
      timestamp: expect.any(String),
    });
    expect(new Date(response.body.timestamp).toISOString()).toBe(
      response.body.timestamp,
    );
  });

  it('serves the Swagger UI at /docs', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs')
      .expect(200);

    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('Swagger UI');
  });

  it('serves parseable OpenAPI JSON under /docs', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs/json')
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        openapi: expect.any(String),
        paths: expect.any(Object),
      }),
    );
  });
});
