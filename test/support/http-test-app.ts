import type { TestingModule } from '@nestjs/testing';

import request from 'supertest';

import { configureBootstrapGlobals } from '../../src/bootstrap';

export type HttpTestClient = ReturnType<typeof request>;

export async function createHttpTestApp(moduleFixture: TestingModule) {
  const app = moduleFixture.createNestApplication();
  configureBootstrapGlobals(app);
  await app.listen(0, '127.0.0.1');

  return { app, http: request(await app.getUrl()) };
}
