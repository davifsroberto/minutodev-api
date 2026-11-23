import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaPg } from '@prisma/adapter-pg';
import { AuthProvider, PrismaClient, User } from '@prisma/client';

import { config as loadEnv } from 'dotenv';
import { expand } from 'dotenv-expand';

import {
  createHttpTestApp,
  type HttpTestClient,
} from '../../../test/support/http-test-app';
import { AppModule } from '../../app.module';
import { AUTH_COOKIE_NAME } from '../auth/auth.config';

expand(loadEnv());

type ErrorEnvelope = {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
};

describe('InterestsController integration', () => {
  // Slugs/labels com escopo do run para não colidir com o catálogo semeado
  // e poder limpar tudo no afterAll (a FK em cascata remove os user_interests).
  const runId = `interests-controller-${Date.now()}`;
  const email = `${runId}@example.test`;
  const slugA = `${runId}-alpha`;
  const slugB = `${runId}-beta`;
  const slugDisabled = `${runId}-disabled`;

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  let app: INestApplication;
  let http: HttpTestClient;
  let jwt: JwtService;
  let user: User;
  let sessionCookie: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    ({ app, http } = await createHttpTestApp(moduleFixture));

    jwt = app.get(JwtService);
    await prisma.$connect();
    await prisma.user.deleteMany({ where: { email } });
    await prisma.topic.deleteMany({
      where: { slug: { in: [slugA, slugB, slugDisabled] } },
    });

    user = await prisma.user.create({
      data: {
        email,
        name: 'Interesses Integração',
        avatarUrl: null,
        provider: AuthProvider.GOOGLE,
        providerId: runId,
      },
    });

    await prisma.topic.createMany({
      data: [
        { slug: slugA, label: 'Tópico Alfa', enabled: true },
        { slug: slugB, label: 'Tópico Beta', enabled: true },
        { slug: slugDisabled, label: 'Tópico Desabilitado', enabled: false },
      ],
    });

    sessionCookie = `${AUTH_COOKIE_NAME}=${jwt.sign({ sub: user.id })}`;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.topic.deleteMany({
      where: { slug: { in: [slugA, slugB, slugDisabled] } },
    });
    await prisma.$disconnect();
    await app.close();
  });

  it('rejeita GET /me/interests sem cookie com envelope 401', async () => {
    const response = await http.get('/me/interests').expect(401);

    expect(response.body as ErrorEnvelope).toEqual({
      statusCode: 401,
      error: 'UNAUTHORIZED',
      message: expect.anything(),
      path: '/me/interests',
      timestamp: expect.any(String),
    });
  });

  it('retorna lista vazia para um usuário sem interesses (Radar Geral)', async () => {
    const response = await http
      .get('/me/interests')
      .set('Cookie', sessionCookie)
      .expect(200);

    expect(response.body).toEqual({ interests: [] });
  });

  it('persiste interesses no PUT e os devolve ordenados por label', async () => {
    const response = await http
      .put('/me/interests')
      .set('Cookie', sessionCookie)
      .send({ interests: [slugB, slugA] })
      .expect(200);

    // Ordenado por label: "Tópico Alfa" antes de "Tópico Beta".
    expect(response.body).toEqual({ interests: [slugA, slugB] });

    const getAfter = await http
      .get('/me/interests')
      .set('Cookie', sessionCookie)
      .expect(200);
    expect(getAfter.body).toEqual({ interests: [slugA, slugB] });
  });

  it('faz replace total: um novo PUT substitui o conjunto anterior', async () => {
    const response = await http
      .put('/me/interests')
      .set('Cookie', sessionCookie)
      .send({ interests: [slugA] })
      .expect(200);

    expect(response.body).toEqual({ interests: [slugA] });
  });

  it('aceita array vazio limpando os interesses (volta ao Radar Geral)', async () => {
    const response = await http
      .put('/me/interests')
      .set('Cookie', sessionCookie)
      .send({ interests: [] })
      .expect(200);

    expect(response.body).toEqual({ interests: [] });
  });

  it('rejeita slug fora do catálogo com 400', async () => {
    const response = await http
      .put('/me/interests')
      .set('Cookie', sessionCookie)
      .send({ interests: [slugA, 'tema-que-nao-existe'] })
      .expect(400);

    expect((response.body as ErrorEnvelope).error).toBe('BAD_REQUEST');
  });

  it('rejeita tema desabilitado com 400 (catálogo só aceita habilitados)', async () => {
    await http
      .put('/me/interests')
      .set('Cookie', sessionCookie)
      .send({ interests: [slugDisabled] })
      .expect(400);
  });

  it('rejeita payload inválido (interests não-array) com 400 do ValidationPipe', async () => {
    await http
      .put('/me/interests')
      .set('Cookie', sessionCookie)
      .send({ interests: 'ai' })
      .expect(400);
  });

  it('expõe o catálogo de temas habilitados em GET /interests/catalog', async () => {
    const response = await http
      .get('/interests/catalog')
      .set('Cookie', sessionCookie)
      .expect(200);

    const body = response.body as Array<{ slug: string; label: string }>;
    const slugs = body.map((topic) => topic.slug);

    expect(slugs).toContain(slugA);
    expect(slugs).toContain(slugB);
    // Tema desabilitado nunca aparece no catálogo.
    expect(slugs).not.toContain(slugDisabled);
    expect(body.every((topic) => topic.slug && topic.label)).toBe(true);
  });

  it('rejeita GET /interests/catalog sem cookie com 401', async () => {
    await http.get('/interests/catalog').expect(401);
  });
});
