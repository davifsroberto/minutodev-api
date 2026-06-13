import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { config as loadEnv } from 'dotenv';
import { expand } from 'dotenv-expand';

import { AppModule } from '../../app.module';
import { IngestionService } from './ingestion.service';

// Carrega o .env (com expansão de `${VAR}`) antes de subir o contexto Nest,
// garantindo DATABASE_URL para o PrismaService.
expand(loadEnv());

/**
 * Execução manual da ingestão RSS via terminal (`npm run ingestion:rss`).
 *
 * Sobe apenas o contexto de aplicação (sem servidor HTTP), roda a ingestão,
 * imprime o resumo e encerra.
 *
 * NOTA: o script `ingestion:rss` roda este arquivo via `ts-node`, o que é
 * ideal para execução manual em desenvolvimento. Para agendador/produção,
 * prefira o caminho compilado — `npm run build` e então
 * `node dist/modules/ingestion/ingestion.cli.js` —, que é mais robusto e
 * rápido (sem transpilação em tempo de execução).
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('IngestionCli');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const summary = await app.get(IngestionService).ingestRss();
    logger.log('Resumo da execução:');
    console.table(summary);
  } finally {
    await app.close();
  }
}

bootstrap().catch((error) => {
  console.error('Ingestão falhou:', error);
  process.exitCode = 1;
});
