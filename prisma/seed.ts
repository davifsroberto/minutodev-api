import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, SourceType } from '@prisma/client';

import { config as loadEnv } from 'dotenv';
import { expand } from 'dotenv-expand';

// Garante DATABASE_URL ao rodar o seed isoladamente (`npm run prisma:seed`).
expand(loadEnv());

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/**
 * Fontes RSS iniciais escolhidas para a V1 do minutoDev.
 *
 * Observação: mesmo o "GitHub Trending RSS" vindo do GitHub é cadastrado
 * como `RSS` nesta etapa — não como `GITHUB`.
 */
const initialSources: ReadonlyArray<{
  name: string;
  url: string;
  category: string;
}> = [
  { name: 'OpenAI', url: 'https://openai.com/news/rss.xml', category: 'ai' },
  {
    name: 'Angular Blog',
    url: 'https://blog.angular.dev/feed',
    category: 'frontend',
  },
  { name: 'InfoQ', url: 'https://feed.infoq.com/', category: 'engineering' },
  { name: 'Dev.to', url: 'https://dev.to/feed/', category: 'community' },
  {
    name: 'GitHub Trending RSS',
    url: 'https://mshibanami.github.io/GitHubTrendingRSS/daily/all.xml',
    category: 'opensource',
  },
  {
    name: 'Hacker News Newest',
    url: 'https://hnrss.org/newest',
    category: 'community',
  },
];

async function main(): Promise<void> {
  // Idempotente: a URL é única, então o upsert evita duplicar fontes em
  // execuções repetidas. Mantemos `enabled` intocado no update para não
  // reverter fontes que tenham sido desativadas manualmente.
  for (const source of initialSources) {
    await prisma.source.upsert({
      where: { url: source.url },
      update: {
        name: source.name,
        category: source.category,
        type: SourceType.RSS,
      },
      create: {
        name: source.name,
        url: source.url,
        category: source.category,
        type: SourceType.RSS,
        enabled: true,
      },
    });
  }

  console.log(`Seed concluído: ${initialSources.length} fontes garantidas.`);
}

main()
  .catch((error) => {
    console.error('Seed falhou:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
