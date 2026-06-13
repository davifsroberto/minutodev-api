import { NestFactory } from '@nestjs/core';

import { config as loadEnv } from 'dotenv';
import { expand } from 'dotenv-expand';

import { AppModule } from './app.module';

// Carrega o .env e expande as referências `${VAR}` (usadas para compor a
// DATABASE_URL) antes de criar a aplicação, garantindo que o PrismaService
// tenha a connection string disponível ao instanciar o driver adapter.
expand(loadEnv());

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3500);
}

bootstrap();
