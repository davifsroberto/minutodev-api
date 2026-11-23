import {
  Controller,
  Get,
  INestApplication,
  Module,
  Query,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

import {
  createHttpTestApp,
  type HttpTestClient,
} from '../test/support/http-test-app';
import { AppController } from './app.controller';
import { AppService } from './app.service';

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

describe('main.ts bootstrap globals', () => {
  let app: INestApplication;
  let http: HttpTestClient;
  let previousCorsOrigins: string | undefined;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [BootstrapIntegrationModule],
    }).compile();

    previousCorsOrigins = process.env.CORS_ORIGINS;
    delete process.env.CORS_ORIGINS;

    ({ app, http } = await createHttpTestApp(moduleFixture));
  });

  afterAll(async () => {
    await app.close();

    if (previousCorsOrigins === undefined) {
      delete process.env.CORS_ORIGINS;
    } else {
      process.env.CORS_ORIGINS = previousCorsOrigins;
    }
  });

  it('keeps the root health route available without a global prefix', async () => {
    await http.get('/').expect(200).expect('Hello World!');
  });

  it('strips unknown query params and transforms known query params', async () => {
    const response = await http
      .get('/validation-probe?page=2&contentType=ARTICLE&tags=nestjs')
      .expect(200);

    expect(response.body).toEqual({ page: 2 });
  });

  it('does not reject non-whitelisted query params', async () => {
    await http
      .get('/validation-probe?contentType=ARTICLE&tags=nestjs')
      .expect(200)
      .expect({});
  });

  it('serializes unknown routes through the global exception filter', async () => {
    const response = await http.get('/does-not-exist').expect(404);

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
    const response = await http.get('/docs').expect(200);

    expect(response.headers['content-type']).toContain('text/html');
    expect(response.text).toContain('Swagger UI');
  });

  it('serves parseable OpenAPI JSON under /docs', async () => {
    const response = await http.get('/docs/json').expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        openapi: expect.any(String),
        paths: expect.any(Object),
      }),
    );
  });

  it('bootstraps without cross-origin access when CORS_ORIGINS is empty', async () => {
    const response = await http
      .get('/')
      .set('Origin', 'http://localhost:4500')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
