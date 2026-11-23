import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { config as loadEnv } from 'dotenv';
import { expand } from 'dotenv-expand';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../database/prisma.service';
import { OpenGraphImageService } from '../images/open-graph.service';
import { resolveRssImageUrl } from '../ingestion/rss/rss-image.util';
import { RssItem } from '../ingestion/rss/rss-parser.service';

expand(loadEnv());

const BATCH_SIZE = 200;
const OG_CONCURRENCY = 4;
/** A partir de quantas repetições uma mesma URL é tratada como genérica (do feed). */
const GENERIC_MIN_COUNT = 5;

/**
 * Reconcilia `Content.imageUrl` dos conteúdos já ingeridos, aplicando a nova
 * regra de imagem (lê `content:encoded`, ignora a imagem genérica do canal).
 *
 * Para cada conteúdo:
 *  1. Recalcula pela regra do RSS sobre o `rawData` (recupera, p.ex., a imagem
 *     real de posts do Medium via `content:encoded`) — sem rede.
 *  2. Se não houver imagem forte e a atual for **genérica** (a mesma URL repetida
 *     em ≥ `GENERIC_MIN_COUNT` posts, ex.: `alura.jpg`) ou nula, tenta o
 *     `og:image` da página.
 *  3. Se mesmo assim nada resolver e a atual for genérica, zera (`null`) para a
 *     capa gerada entrar no lugar do banner errado.
 *
 * Idempotente e seguro: só sobrescreve quando o candidato difere; nunca troca
 * uma imagem única por-artigo já existente (só mexe em genéricas/nulas).
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('ReconcileImagesCli');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const prisma = app.get(PrismaService);
  const openGraph = app.get(OpenGraphImageService);

  // Filtro opcional por fonte: `backfill:reconcile-images -- Alura "Angular Blog"`.
  // Útil para validar em fontes específicas antes de rodar em todo o acervo.
  const sourceNames = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const sourceFilter =
    sourceNames.length > 0 ? { source: { name: { in: sourceNames } } } : {};
  if (sourceNames.length) {
    logger.log(`Filtrando pelas fontes: ${sourceNames.join(', ')}`);
  }

  const generic = await loadGenericImageUrls(prisma);
  logger.log(
    `URLs genéricas detectadas (≥${GENERIC_MIN_COUNT} posts): ${generic.size}`,
  );

  let scanned = 0;
  let updated = 0;
  let cleared = 0;
  let cursor: string | undefined;

  try {
    for (;;) {
      const batch = await prisma.content.findMany({
        where: sourceFilter,
        select: { id: true, url: true, imageUrl: true, rawData: true },
        orderBy: { id: 'asc' },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        take: BATCH_SIZE,
      });

      if (!batch.length) break;
      cursor = batch[batch.length - 1].id;

      for (let i = 0; i < batch.length; i += OG_CONCURRENCY) {
        const slice = batch.slice(i, i + OG_CONCURRENCY);
        const results = await Promise.all(
          slice.map((row) => resolveNext(row, generic, openGraph)),
        );

        for (let j = 0; j < slice.length; j++) {
          scanned += 1;
          const row = slice[j];
          const next = results[j];
          if (next === undefined) continue; // nada a mudar

          await prisma.content.update({
            where: { id: row.id },
            data: { imageUrl: next },
          });
          if (next === null) cleared += 1;
          else updated += 1;
        }
      }

      logger.log(
        `Processados ${scanned}… (atualizados: ${updated}, zerados: ${cleared})`,
      );
    }

    logger.log(
      `Reconciliação concluída — analisados: ${scanned}, atualizados: ${updated}, zerados: ${cleared}.`,
    );
  } finally {
    await app.close();
  }
}

/** Decide a nova imagem de um conteúdo; `undefined` = manter como está. */
async function resolveNext(
  row: { url: string; imageUrl: string | null; rawData: unknown },
  generic: Set<string>,
  openGraph: OpenGraphImageService,
): Promise<string | null | undefined> {
  const isGeneric = row.imageUrl !== null && generic.has(row.imageUrl);
  const strong =
    row.rawData && typeof row.rawData === 'object'
      ? resolveRssImageUrl(row.rawData as RssItem)
      : null;

  if (strong) return strong !== row.imageUrl ? strong : undefined;

  // Sem imagem forte: só mexe em genéricas/nulas (nunca em imagem única já boa).
  if (!isGeneric && row.imageUrl !== null) return undefined;

  const og = await openGraph.resolveImageUrl(row.url);
  if (og && og !== row.imageUrl && !generic.has(og)) return og;

  // og:image falhou/igual/genérico: zera a genérica para a capa entrar.
  if (isGeneric) return null;

  return undefined;
}

async function loadGenericImageUrls(
  prisma: PrismaService,
): Promise<Set<string>> {
  const rows = await prisma.content.groupBy({
    by: ['imageUrl'],
    where: { imageUrl: { not: null } },
    _count: { imageUrl: true },
    having: { imageUrl: { _count: { gte: GENERIC_MIN_COUNT } } },
  });

  return new Set(
    rows
      .map((r) => r.imageUrl)
      .filter((url): url is string => typeof url === 'string'),
  );
}

bootstrap().catch((error) => {
  console.error('Reconciliação de imagens falhou:', error);
  process.exitCode = 1;
});
