import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { config as loadEnv } from 'dotenv';
import { expand } from 'dotenv-expand';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../database/prisma.service';
import { resolveRssImageUrl } from '../ingestion/rss/rss-image.util';
import { RssItem } from '../ingestion/rss/rss-parser.service';

// Carrega o .env (com expansão de `${VAR}`) antes de subir o contexto Nest,
// garantindo DATABASE_URL para o PrismaService.
expand(loadEnv());

const BATCH_SIZE = 200;

/**
 * Backfill do campo `Content.imageUrl`: reaplica a resolução de imagem da
 * ingestão (`resolveRssImageUrl`) sobre o `rawData` já persistido. Útil para
 * conteúdos ingeridos antes da Sprint 5D-1, que não têm imagem.
 *
 * Best-effort: o `rawData` antigo não capturou `media:content`/`media:thumbnail`
 * (campos novos), então recupera o que dá (enclosure / 1ª `<img>` do corpo). A
 * imagem do canal do feed não fica no `rawData`, então não é usada aqui.
 *
 * Idempotente: só preenche linhas com `imageUrl` nulo; re-rodar não toca o que
 * já foi resolvido. Uso manual via ts-node (`npm run backfill:image`); em
 * produção prefira o build: `node dist/modules/contents/backfill-image.cli.js`.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('BackfillImageCli');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const prisma = app.get(PrismaService);

  let scanned = 0;
  let updated = 0;

  try {
    for (let skip = 0; ; skip += BATCH_SIZE) {
      const batch = await prisma.content.findMany({
        select: { id: true, imageUrl: true, rawData: true },
        orderBy: { id: 'asc' },
        skip,
        take: BATCH_SIZE,
      });

      if (!batch.length) break;

      for (const content of batch) {
        scanned += 1;

        // só preenche o que está vazio e tem item bruto para reprocessar
        if (content.imageUrl !== null) continue;
        if (!content.rawData || typeof content.rawData !== 'object') continue;

        const next = resolveRssImageUrl(content.rawData as unknown as RssItem);
        if (!next) continue;

        await prisma.content.update({
          where: { id: content.id },
          data: { imageUrl: next },
        });
        updated += 1;
      }

      logger.log(`Processados ${scanned} conteúdo(s)…`);
    }

    logger.log(
      `Backfill de imagem concluído — analisados: ${scanned}, atualizados: ${updated}.`,
    );
  } finally {
    await app.close();
  }
}

bootstrap().catch((error) => {
  console.error('Backfill de imagem falhou:', error);
  process.exitCode = 1;
});
