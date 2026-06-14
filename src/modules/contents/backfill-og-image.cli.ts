import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { config as loadEnv } from 'dotenv';
import { expand } from 'dotenv-expand';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../database/prisma.service';
import { OpenGraphImageService } from '../images/open-graph.service';
import { runOgImageBackfill } from './og-image-backfill';

// Carrega o .env (com expansão de `${VAR}`) antes de subir o contexto Nest,
// garantindo DATABASE_URL para o PrismaService.
expand(loadEnv());

/**
 * Backfill de `Content.imageUrl` via og:image para conteúdos sem imagem.
 *
 * Complementa o `backfill:image` (que só reaplica a imagem do RSS, offline):
 * aqui buscamos a página original e extraímos og:image/twitter:image, com as
 * mesmas salvaguardas do `OpenGraphImageService` (timeout, anti-SSRF, teto de
 * bytes, cache). Best-effort: fontes com anti-bot/paywall seguem sem imagem.
 *
 * A varredura vive em `runOgImageBackfill` (testável). Faz requisições externas;
 * uso manual (`npm run backfill:og-image`). Em produção, rode o build:
 * `node dist/modules/contents/backfill-og-image.cli.js`.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('BackfillOgImageCli');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const prisma = app.get(PrismaService);
  const openGraph = app.get(OpenGraphImageService);

  try {
    const summary = await runOgImageBackfill(prisma, openGraph, (progress) =>
      logger.log(
        `Processados ${progress.scanned} sem imagem… (resolvidos: ${progress.updated})`,
      ),
    );

    logger.log(
      `Backfill og:image concluído — analisados: ${summary.scanned}, atualizados: ${summary.updated}.`,
    );
  } finally {
    await app.close();
  }
}

bootstrap().catch((error) => {
  console.error('Backfill og:image falhou:', error);
  process.exitCode = 1;
});
