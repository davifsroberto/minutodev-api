import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  AuthProvider,
  Content,
  ContentType,
  PrismaClient,
  User,
} from '@prisma/client';

import { config as loadEnv } from 'dotenv';
import { expand } from 'dotenv-expand';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { configureBootstrapGlobals } from '../../bootstrap';
import { AUTH_COOKIE_NAME } from '../auth/auth.config';
import { HistoryEntryDto } from './dto/history-entry.dto';
import { HistoryItemDto } from './dto/history-item.dto';

expand(loadEnv());

type PaginatedHistoryBody = {
  data: HistoryItemDto[];
  meta: { page: number; limit: number; total: number; totalPages: number };
};

describe('HistoryController integration', () => {
  // URLs/e-mails com escopo do run para não colidir entre execuções e poder
  // limpar tudo no afterAll (FKs em cascata removem o histórico junto).
  const runId = `history-controller-${Date.now()}`;
  const emailA = `${runId}-a@example.test`;
  const emailB = `${runId}-b@example.test`;

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  let app: INestApplication;
  let jwt: JwtService;
  let userA: User;
  let userB: User;
  let contentOne: Content;
  let contentTwo: Content;
  let cookieA: string;
  let cookieB: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureBootstrapGlobals(app);
    await app.init();

    jwt = app.get(JwtService);
    await prisma.$connect();
    await prisma.user.deleteMany({
      where: { email: { in: [emailA, emailB] } },
    });
    await prisma.source.deleteMany({ where: { url: `https://${runId}.test` } });

    const source = await prisma.source.create({
      data: {
        name: 'Fonte Histórico',
        type: 'RSS',
        url: `https://${runId}.test`,
        category: 'engineering',
      },
    });

    contentOne = await prisma.content.create({
      data: {
        sourceId: source.id,
        title: 'Conteúdo Um',
        url: `https://${runId}.test/one`,
        contentType: ContentType.ARTICLE,
        publishedAt: new Date('2026-07-01T09:00:00.000Z'),
        imageUrl: 'https://example.test/one.png',
      },
    });
    contentTwo = await prisma.content.create({
      data: {
        sourceId: source.id,
        title: 'Conteúdo Dois',
        url: `https://${runId}.test/two`,
        contentType: ContentType.ARTICLE,
        publishedAt: new Date('2026-07-02T09:00:00.000Z'),
      },
    });

    userA = await prisma.user.create({
      data: {
        email: emailA,
        name: 'Histórico Integração A',
        avatarUrl: null,
        provider: AuthProvider.GOOGLE,
        providerId: `${runId}-a`,
      },
    });
    userB = await prisma.user.create({
      data: {
        email: emailB,
        name: 'Histórico Integração B',
        avatarUrl: null,
        provider: AuthProvider.GOOGLE,
        providerId: `${runId}-b`,
      },
    });

    cookieA = `${AUTH_COOKIE_NAME}=${jwt.sign({ sub: userA.id })}`;
    cookieB = `${AUTH_COOKIE_NAME}=${jwt.sign({ sub: userB.id })}`;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: [emailA, emailB] } },
    });
    await prisma.source.deleteMany({ where: { url: `https://${runId}.test` } });
    await prisma.$disconnect();
    await app.close();
  });

  it('rejeita as rotas de histórico sem cookie com 401', async () => {
    await request(app.getHttpServer()).get('/me/history').expect(401);
    await request(app.getHttpServer())
      .post(`/me/history/contents/${contentOne.id}/open`)
      .expect(401);
    await request(app.getHttpServer())
      .post(`/me/history/contents/${contentOne.id}/read`)
      .expect(401);
  });

  it('cria o registro na primeira abertura com openCount 1', async () => {
    const response = await request(app.getHttpServer())
      .post(`/me/history/contents/${contentOne.id}/open`)
      .set('Cookie', cookieA)
      .expect(200);

    const body = response.body as HistoryEntryDto;
    expect(body.contentId).toBe(contentOne.id);
    expect(body.openCount).toBe(1);
    expect(body.readAt).toBeNull();
    expect(body.status).toBe('OPENED');
    expect(body.firstOpenedAt).toBe(body.lastOpenedAt);
  });

  it('reabrir incrementa openCount e avança lastOpenedAt sem duplicar registro', async () => {
    const response = await request(app.getHttpServer())
      .post(`/me/history/contents/${contentOne.id}/open`)
      .set('Cookie', cookieA)
      .expect(200);

    const body = response.body as HistoryEntryDto;
    expect(body.openCount).toBe(2);
    expect(new Date(body.lastOpenedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(body.firstOpenedAt).getTime(),
    );

    const rows = await prisma.userContentHistory.findMany({
      where: { userId: userA.id, contentId: contentOne.id },
    });
    expect(rows).toHaveLength(1);
  });

  it('marca como lido preenchendo readAt e mantendo as datas de abertura', async () => {
    const before = await prisma.userContentHistory.findUniqueOrThrow({
      where: {
        userId_contentId: { userId: userA.id, contentId: contentOne.id },
      },
    });

    const response = await request(app.getHttpServer())
      .post(`/me/history/contents/${contentOne.id}/read`)
      .set('Cookie', cookieA)
      .expect(200);

    const body = response.body as HistoryEntryDto;
    expect(body.status).toBe('READ');
    expect(body.readAt).not.toBeNull();
    expect(new Date(body.firstOpenedAt)).toEqual(before.firstOpenedAt);
    expect(new Date(body.lastOpenedAt)).toEqual(before.lastOpenedAt);
    expect(body.openCount).toBe(before.openCount);
  });

  it('é idempotente: repetir o read preserva o primeiro readAt', async () => {
    const first = await request(app.getHttpServer())
      .post(`/me/history/contents/${contentOne.id}/read`)
      .set('Cookie', cookieA)
      .expect(200);

    const second = await request(app.getHttpServer())
      .post(`/me/history/contents/${contentOne.id}/read`)
      .set('Cookie', cookieA)
      .expect(200);

    expect((second.body as HistoryEntryDto).readAt).toBe(
      (first.body as HistoryEntryDto).readAt,
    );
  });

  it('marca como lido sem abertura prévia criando o registro já lido', async () => {
    const response = await request(app.getHttpServer())
      .post(`/me/history/contents/${contentTwo.id}/read`)
      .set('Cookie', cookieA)
      .expect(200);

    const body = response.body as HistoryEntryDto;
    expect(body.contentId).toBe(contentTwo.id);
    expect(body.status).toBe('READ');
    expect(body.openCount).toBe(1);
  });

  it('retorna 404 para conteúdo inexistente', async () => {
    await request(app.getHttpServer())
      .post('/me/history/contents/nao-existe/open')
      .set('Cookie', cookieA)
      .expect(404);
    await request(app.getHttpServer())
      .post('/me/history/contents/nao-existe/read')
      .set('Cookie', cookieA)
      .expect(404);
  });

  it('lista o histórico ordenado por último acesso com dados do conteúdo', async () => {
    const response = await request(app.getHttpServer())
      .get('/me/history')
      .set('Cookie', cookieA)
      .expect(200);

    const body = response.body as PaginatedHistoryBody;
    expect(body.meta).toEqual({
      page: 1,
      limit: 20,
      total: 2,
      totalPages: 1,
    });

    // contentTwo foi acessado por último, então vem primeiro.
    expect(body.data.map((item) => item.contentId)).toEqual([
      contentTwo.id,
      contentOne.id,
    ]);

    const [latest, oldest] = body.data;
    expect(latest.title).toBe('Conteúdo Dois');
    expect(latest.sourceName).toBe('Fonte Histórico');
    expect(latest.status).toBe('READ');
    expect(oldest.title).toBe('Conteúdo Um');
    expect(oldest.imageUrl).toBe('https://example.test/one.png');
    expect(oldest.publishedAt).toBe('2026-07-01T09:00:00.000Z');
    expect(oldest.lastOpenedAt).toEqual(expect.any(String));
  });

  it('isola o histórico por usuário: user B não vê o histórico de A', async () => {
    const response = await request(app.getHttpServer())
      .get('/me/history')
      .set('Cookie', cookieB)
      .expect(200);

    const body = response.body as PaginatedHistoryBody;
    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);

    await request(app.getHttpServer())
      .post(`/me/history/contents/${contentOne.id}/open`)
      .set('Cookie', cookieB)
      .expect(200);

    const afterOpen = await request(app.getHttpServer())
      .get('/me/history')
      .set('Cookie', cookieB)
      .expect(200);

    const afterBody = afterOpen.body as PaginatedHistoryBody;
    expect(afterBody.meta.total).toBe(1);
    expect(afterBody.data[0].status).toBe('OPENED');

    // O histórico de A permanece intacto (registros independentes por usuário).
    const rowsA = await prisma.userContentHistory.count({
      where: { userId: userA.id },
    });
    expect(rowsA).toBe(2);
  });

  it('respeita a paginação do GET /me/history', async () => {
    const response = await request(app.getHttpServer())
      .get('/me/history')
      .query({ page: 1, limit: 1 })
      .set('Cookie', cookieA)
      .expect(200);

    const body = response.body as PaginatedHistoryBody;
    expect(body.data).toHaveLength(1);
    expect(body.meta).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
  });
});
