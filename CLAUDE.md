# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Idioma: **interaja sempre com o usuário em pt-BR** — perguntas, brainstorming
> e confirmações, inclusive durante skills interativas do Compozy
> (`/cy-create-prd`, `/cy-create-techspec`, `/cy-create-tasks`). Comentários e
> mensagens de commit também em português.

## O que é

API backend do **minutoDev** (NestJS 11 + TypeScript): coleta conteúdos de
fontes (RSS/futuramente GitHub), normaliza e persiste em PostgreSQL via Prisma.
Ainda **não** há endpoints HTTP públicos, autenticação, cron, IA, score nem o
módulo `radar` — esses são passos futuros e não devem ser implementados sem
pedido explícito.

## Comandos

```bash
# Build (emite dist/main.js — ver nota em tsconfig.build.json abaixo)
npm run build

# Lint + autofix (NÃO cobre prisma/*.ts nem *.ts da raiz — ver gotcha abaixo)
npm run lint:fix
npm run format            # prettier em src/**/*.ts e test/**/*.ts

# Testes (Jest). O script usa jest.config.ts; cobertura é sempre coletada.
npm run test
npm run test -- src/app.controller.spec.ts   # rodar um único arquivo
npm run test:integration                      # *.integration.ts

# Prisma (exigem .env existente — ver gotcha)
npm run prisma:generate   # gera o client em node_modules/@prisma/client
npm run prisma:migrate    # prisma migrate dev
npm run prisma:seed       # popula as Sources RSS (idempotente)
npm run prisma:studio

# Ingestão RSS manual (ts-node). Para produção use o caminho compilado.
npm run ingestion:rss
```

## Arquitetura

NestJS modular. Cada feature é um módulo em `src/modules/<feature>/` com
`*.module.ts` + `*.service.ts` (sem controllers ainda). O `AppModule` apenas
compõe os módulos; lógica não fica nele.

**Camada de dados** — `src/database/`
- `DatabaseModule` é `@Global` e exporta `PrismaService`; por isso os feature
  modules injetam `PrismaService` direto, sem reimportar o `DatabaseModule`.
- Modelo: `Source` 1:N `Content`. Enums `SourceType` (RSS|GITHUB),
  `ContentType`, `ContentStatus`. `Source.url` e `Content.url` são únicos.
- `ContentsService.createIfNew()` é o ponto central de deduplicação: faz o
  `create` e trata o erro **P2002** (unique) como `'duplicate'` em vez de
  propagar — é o que permite a ingestão continuar em cima de URLs repetidas.

**Ingestão** — `src/modules/ingestion/`
- Fluxo (`IngestionService.ingestRss`): `SourcesService.findEnabledByType(RSS)`
  → `RssParserService` (wrapper de `rss-parser`) → `RssNormalizerService`
  (item RSS → `Prisma.ContentUncheckedCreateInput`, puro/sem DB) →
  `ContentsService.createIfNew`.
- Resiliência por níveis: falha ao ler um feed conta como erro e segue para a
  próxima source; falha ao salvar um item conta como erro e segue para o
  próximo item. Retorna `IngestionSummary` (sourcesProcessed, itemsFound,
  created, duplicates, errors).
- O `RssNormalizerService` retorna `null` quando o item não tem URL
  (`link`/`guid`) — sem ela não há como deduplicar/persistir.

**Execução fora do servidor HTTP** (seed, CLI de ingestão) usa
`NestFactory.createApplicationContext(AppModule)` ou um `PrismaClient` avulso, e
**sempre carrega o `.env` manualmente** no topo do arquivo (ver gotcha de env).
Padrão de CLI: `ts-node` para uso manual; em produção/agendador, rode
`npm run build` e `node dist/modules/ingestion/ingestion.cli.js` (mais robusto).

## Estilo de código

- **Early return / guard clauses** para reduzir aninhamento — desde que não
  deixe o código mais verboso (ex.: `if (!url) return null;` no
  `RssNormalizerService`).
- **Sem comentários**, salvo o genuinamente não-óbvio: um workaround, uma
  decisão fora da curva, um "porquê" que o código não revela (ex.: tratar o
  erro P2002 como duplicado; o header `Accept` que evita o 406 de alguns
  feeds). Não escreva JSDoc/comentários que só reafirmam o que o nome já diz.

## Convenções e gotchas (importantes)

**Prisma 7 — sem `url` no schema.** O `datasource` em `prisma/schema.prisma`
só tem `provider`. A connection string vive em dois lugares:
- CLI (migrate/seed/studio): [`prisma.config.ts`](prisma.config.ts), em
  `datasource.url = env('DATABASE_URL')`. O comando de seed também fica aqui
  (`migrations.seed`), **não** no bloco `prisma` do package.json (forma ≤6).
- Runtime: `PrismaService` conecta via driver adapter `@prisma/adapter-pg`
  (`new PrismaPg({ connectionString: process.env.DATABASE_URL })`). Não use
  TypeORM; o banco é exclusivamente PostgreSQL via Prisma.

**`.env` precisa existir antes de qualquer `prisma:*`** (inclusive
`prisma:generate`, que nem usa o banco): o `prisma.config.ts` chama
`env('DATABASE_URL')`, que **lança erro** se a variável faltar. O Prisma 7 não
auto-carrega `.env`, então `dotenv` + `dotenv-expand` são carregados à mão em
`main.ts`, `prisma.config.ts`, `prisma/seed.ts` e `ingestion.cli.ts`.
`DATABASE_URL` é composta a partir de partes (`DATABASE_HOST`, etc.) usando
expansão `${...}` — por isso o `dotenv-expand`. Veja `.env.example`.

**`tsconfig.build.json` fixa `include: ["src/**/*"]`** de propósito: sem isso,
ter `.ts` na raiz (`prisma.config.ts`, `jest*.config.ts`) faria o `tsc` inferir
o `rootDir` como a raiz e emitir `dist/src/main.js`, quebrando
`start:prod` (`node dist/main`). Não espere que arquivos `.ts` da raiz apareçam
em `dist/`.

**Ordenação de imports (ESLint `simple-import-sort`)** com **linha em branco
entre grupos**, nesta ordem: `@nestjs` → `@prisma` → outros pacotes →
`@src`/`@resource` → relativos. Rode `npm run lint:fix`. **Gotcha:** o glob do
`lint:fix` é `{src,apps,libs,test}/**/*.ts` e **não** cobre `prisma/*.ts` nem
`*.ts` da raiz — para esses, rode `npx eslint <arquivo> --fix` explicitamente.

**Artefatos de template a ignorar:** os aliases de path em `tsconfig.json`
(`@contentModule/*`, etc.) apontam para `../src/module/...` que **não existem** —
o código usa imports relativos. O `jest.config.ts` ainda traz o preset
`@shelf/jest-mongodb` herdado do template; o projeto usa Postgres, não Mongo.
