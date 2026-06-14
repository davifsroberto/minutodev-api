import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { config as loadEnv } from 'dotenv';
import { expand } from 'dotenv-expand';

import { AppModule } from '../../app.module';
import { summarizeContent } from '../../common/utils/summarize-content.util';
import { PrismaService } from '../../database/prisma.service';

// Carrega o .env (com expansão de `${VAR}`) antes de subir o contexto Nest,
// garantindo DATABASE_URL para o PrismaService.
expand(loadEnv());

const BATCH_SIZE = 200;

/**
 * Backfill do campo `Content.summary`: recalcula o teaser a partir do texto
 * original (`rawSummary`, com fallback no próprio `summary`) com o mesmo
 * `summarizeContent` da ingestão. Necessário porque conteúdos ingeridos antes
 * da truncagem guardaram o artigo inteiro em `summary`.
 *
 * Idempotente: só grava quando o valor recalculado difere do atual, então
 * re-rodar não toca linhas já encurtadas. Paginação por `id` é estável porque
 * o `update` não altera a ordenação.
 *
 * Uso manual via ts-node (`npm run backfill:summary`). Para produção, prefira o
 * caminho compilado: `npm run build` e então
 * `node dist/modules/contents/backfill-summary.cli.js`.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('BackfillSummaryCli');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const prisma = app.get(PrismaService);

  let scanned = 0;
  let updated = 0;

  try {
    for (let skip = 0; ; skip += BATCH_SIZE) {
      const batch = await prisma.content.findMany({
        select: { id: true, summary: true, rawSummary: true },
        orderBy: { id: 'asc' },
        skip,
        take: BATCH_SIZE,
      });

      if (!batch.length) break;

      for (const content of batch) {
        scanned += 1;
        const next = summarizeContent(content.rawSummary ?? content.summary);

        if (next === content.summary) continue;

        await prisma.content.update({
          where: { id: content.id },
          data: { summary: next },
        });
        updated += 1;
      }

      logger.log(`Processados ${scanned} conteúdo(s)…`);
    }

    logger.log(
      `Backfill concluído — analisados: ${scanned}, atualizados: ${updated}.`,
    );
  } finally {
    await app.close();
  }
}

bootstrap().catch((error) => {
  console.error('Backfill falhou:', error);
  process.exitCode = 1;
});
