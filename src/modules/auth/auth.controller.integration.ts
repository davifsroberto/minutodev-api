import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaPg } from '@prisma/adapter-pg';
import { AuthProvider, PrismaClient, User } from '@prisma/client';

import { config as loadEnv } from 'dotenv';
import { expand } from 'dotenv-expand';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { configureBootstrapGlobals } from '../../bootstrap';
import { AUTH_COOKIE_NAME } from './auth.config';
import { STATE_COOKIE_NAME } from './cookie-state.store';

expand(loadEnv());

type ErrorEnvelope = {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
};

const cookieHeader = (raw: string | string[] | undefined): string =>
  Array.isArray(raw) ? raw.join(';') : String(raw ?? '');

describe('AuthController integration', () => {
  const runId = `auth-controller-${Date.now()}`;
  const email = `${runId}@example.test`;
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  let app: INestApplication;
  let jwt: JwtService;
  let user: User;
  let sessionCookie: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureBootstrapGlobals(app);
    await app.init();

    jwt = app.get(JwtService);
    await prisma.$connect();
    await prisma.user.deleteMany({ where: { email } });

    user = await prisma.user.create({
      data: {
        email,
        name: 'Auth Integração',
        avatarUrl: null,
        provider: AuthProvider.GOOGLE,
        providerId: runId,
      },
    });

    sessionCookie = `${AUTH_COOKIE_NAME}=${jwt.sign({ sub: user.id })}`;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
    await app.close();
  });

  it('rejeita /auth/me sem cookie com envelope de erro 401', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .expect(401);

    expect(response.body as ErrorEnvelope).toEqual({
      statusCode: 401,
      error: 'UNAUTHORIZED',
      message: expect.anything(),
      path: '/auth/me',
      timestamp: expect.any(String),
    });
  });

  it('retorna os dados básicos em /auth/me com cookie de sessão válido', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', sessionCookie)
      .expect(200);

    expect(response.body).toEqual({
      id: user.id,
      email,
      name: 'Auth Integração',
      avatarUrl: null,
    });
  });

  it('rejeita /auth/me quando o usuário do token não existe mais', async () => {
    const ghost = `${AUTH_COOKIE_NAME}=${jwt.sign({ sub: 'nao-existe' })}`;

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', ghost)
      .expect(401);
  });

  it('rejeita /auth/me com token expirado', async () => {
    const expired = `${AUTH_COOKIE_NAME}=${jwt.sign(
      { sub: user.id },
      { expiresIn: -10 },
    )}`;

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', expired)
      .expect(401);
  });

  it('rejeita /auth/me com token malformado', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', `${AUTH_COOKIE_NAME}=isto-nao-e-um-jwt`)
      .expect(401);
  });

  it('encerra a sessão em /auth/logout limpando o cookie httpOnly', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/logout')
      .expect(200);

    expect(response.body).toEqual({ success: true });

    const header = cookieHeader(response.headers['set-cookie']);
    // Cookie zerado, com as mesmas flags de segurança e expiração no passado.
    expect(header).toContain(`${AUTH_COOKIE_NAME}=;`);
    expect(header.toLowerCase()).toContain('httponly');
    expect(header.toLowerCase()).toContain('path=/');
    expect(header).toContain('Expires=Thu, 01 Jan 1970');
  });

  it('continua negando /auth/me com o cookie já limpo pelo logout', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', `${AUTH_COOKIE_NAME}=`)
      .expect(401);
  });

  it('inicia o fluxo OAuth redirecionando para o Google com proteção de state', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth/google')
      .expect(302);

    const location = response.headers['location'] as string;
    expect(location).toContain('accounts.google.com');
    // Proteção CSRF: o state vai na URL e é ancorado num cookie httpOnly.
    expect(location).toContain('state=');

    const header = cookieHeader(response.headers['set-cookie']);
    expect(header).toContain(`${STATE_COOKIE_NAME}=`);
    expect(header.toLowerCase()).toContain('httponly');
  });
});
