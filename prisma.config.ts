import { config as loadEnv } from 'dotenv';
import { expand } from 'dotenv-expand';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 no longer auto-loads .env. We load it ourselves and expand the
// `${VAR}` references used to compose DATABASE_URL from its parts.
expand(loadEnv());

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
