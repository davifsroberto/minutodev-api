<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Database (PostgreSQL + Prisma)

A persistência usa **PostgreSQL** com **Prisma ORM** (Prisma 7). O schema, os
models (`Source`, `Content`), enums e migrations ficam em [`prisma/`](prisma/).

> **Prisma 7:** a conexão é feita por um _driver adapter_
> ([`@prisma/adapter-pg`](https://www.npmjs.com/package/@prisma/adapter-pg)).
> A connection string para as migrations/seed/Studio vive em
> [`prisma.config.ts`](prisma.config.ts) e, em runtime, é lida pelo
> `PrismaService` a partir de `DATABASE_URL`.

### 1. Configurar a `DATABASE_URL`

Copie o arquivo de exemplo e ajuste os valores para o seu Postgres local
(rodando via Docker):

```bash
$ cp .env.example .env
```

> ⚠️ **Crie o `.env` antes de qualquer comando `prisma:*`.** O
> [`prisma.config.ts`](prisma.config.ts) lê `DATABASE_URL` via `env()` e
> **falha** se a variável não existir — inclusive no `prisma:generate`, que por
> si só não usa o banco, mas avalia a configuração ao iniciar.

A `DATABASE_URL` segue o formato (o exemplo **não** é definitivo):

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/minutodev?schema=public"
```

No `.env` ela é composta a partir de partes (`DATABASE_HOST`, `DATABASE_PORT`,
`DATABASE_USERNAME`, `DATABASE_PASSWORD`, `DATABASE_NAME`) usando expansão de
variáveis (`${...}`), suportada pelo `dotenv-expand` e pelo Prisma.

### 2. Gerar o Prisma Client

Requer o `.env` do passo anterior.

```bash
$ npm run prisma:generate
```

### 3. Rodar as migrations

Cria/aplica as migrations no banco (a primeira migration é
`init_sources_and_contents`). Em ambiente de desenvolvimento:

```bash
$ npm run prisma:migrate
```

### 4. Popular as fontes iniciais (seed)

Cadastra as fontes RSS da V1. O seed é **idempotente** — pode ser executado
mais de uma vez sem duplicar fontes:

```bash
$ npm run prisma:seed
```

### 5. Abrir o Prisma Studio

Interface visual para inspecionar os dados:

```bash
$ npm run prisma:studio
```

## Ingestão de conteúdos (RSS)

O módulo [`ingestion`](src/modules/ingestion) busca os feeds das `Source`
habilitadas (`enabled = true` e `type = RSS`), normaliza cada item para o
modelo `Content` e grava no banco.

- **Deduplicação:** `Content.url` é único; itens já existentes são ignorados
  com segurança (não quebram a execução).
- **Resiliência:** a falha de uma source (ou de um item) é registrada e
  contabilizada, mas não interrompe as demais.
- **Imagem:** cada item resolve uma `imageUrl` na prioridade imagem do item RSS
  (`enclosure`/`media:content`/`media:thumbnail`/1ª `<img>` do corpo) →
  **og:image/twitter:image** da página original → imagem do canal do feed. Sem
  imagem, o frontend gera uma capa branded por fonte. Conteúdos antigos podem ser
  preenchidos com `npm run backfill:image` (reaplica a regra do RSS sobre o
  `rawData`, offline) e `npm run backfill:og-image` (busca o og:image, com rede).

### Fallback de imagem via og:image

Quando o RSS não traz imagem (ex.: Hacker News, OpenAI), o
[`OpenGraphImageService`](src/modules/images/open-graph.service.ts) busca o
`og:image`/`twitter:image` da página do artigo. É **sob demanda** — roda dentro
da geração do enrichment (em paralelo com a IA), **nunca na ingestão** — e
**best-effort**: qualquer falha vira `null` e cai no próximo fallback, sem
derrubar a geração. Defesas: só `http(s)` para hosts públicos, bloqueio de
IPs privados/reservados (anti-SSRF, com checagem de DNS e revalidação de cada
redirect), timeout curto, teto de bytes e cache em memória. Pode ser desligado
com `OG_IMAGE_ENABLED=false`. Fontes com anti-bot/paywall (ex.: 403) seguem na
capa branded.

Execução manual via terminal:

```bash
$ npm run ingestion:rss
```

> **Manual vs. produção:** o `ingestion:rss` roda via `ts-node` — ótimo para
> execução manual em desenvolvimento. Para agendador/produção, prefira o
> caminho compilado (mais robusto e rápido, sem transpilação em runtime):
>
> ```bash
> $ npm run build
> $ node dist/modules/ingestion/ingestion.cli.js
> ```

Ao final, é impresso um resumo da execução:

```text
┌──────────────────┬────────┐
│ (index)          │ Values │
├──────────────────┼────────┤
│ sourcesProcessed │ 6      │
│ itemsFound       │ 1075   │
│ created          │ 23     │
│ duplicates       │ 1052   │
│ errors           │ 0      │
└──────────────────┴────────┘
```

> Ainda **não** há endpoints públicos, agendamento (cron) nem cálculo de
> score/relevância — isso fica para etapas seguintes.

## Inteligência Artificial (IA)

O módulo [`ai`](src/modules/ai) fornece uma **camada de IA abstrata** para gerar
um **briefing editorial** em pt-BR **sob demanda**. A saída é estruturada para
leitura rápida (10s/1min/3min): resumo em 30 segundos, o que é, por que importa,
insight principal, principais aprendizados, exemplo citado, quando vale a pena
usar, para quem importa / pode ignorar, e conteúdo detalhado — com tradução
natural (não literal) e fatos concretos, para entender o conteúdo sem abrir a
fonte. O texto completo da fonte (`Content.rawSummary`, limitado em tamanho) é
enviado ao modelo como matéria-prima. O padrão é `mock`, então a aplicação inicia
e roda sem nenhuma chave de IA configurada, sem custo e sem chamada externa. As
regras de negócio dependem apenas da fachada `AiService`, nunca de um provedor
concreto.

Providers reconhecidos por `LLM_PROVIDER`:

| Provider | Status | Comportamento atual |
| --- | --- | --- |
| `mock` | Implementado | Padrão; não chama API externa e retorna saída determinística. |
| `deepseek` | Implementado | Usa `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `LLM_MODEL` e `LLM_TIMEOUT_MS`. |
| `gemini` | Implementado | Usa `GEMINI_API_KEY`, `GEMINI_BASE_URL`, `LLM_MODEL` (padrão `gemini-2.5-flash`) e `LLM_TIMEOUT_MS`. |
| `openrouter` | Placeholder, não implementado | O boot funciona, mas chamadas de IA falham com mensagem clara. |
| `ollama` | Placeholder, não implementado | O boot funciona, mas chamadas de IA falham com mensagem clara. |

Para ativar o DeepSeek, defina `LLM_PROVIDER=deepseek` e
`DEEPSEEK_API_KEY` no seu `.env`. `DEEPSEEK_BASE_URL` pode ficar no padrão
`https://api.deepseek.com`; `LLM_MODEL` é opcional e, quando vazio, usa o padrão
do provider (`deepseek-chat` para `deepseek`); `LLM_TIMEOUT_MS` é opcional e usa
`30000`.

Para ativar o Gemini (Google), defina `LLM_PROVIDER=gemini` e `GEMINI_API_KEY` no
seu `.env`. O modelo é controlado por `LLM_MODEL` (vazio usa `gemini-2.5-flash`);
`GEMINI_BASE_URL` é opcional (padrão: a API pública do Google,
`https://generativelanguage.googleapis.com/v1beta`). A geração continua sob
demanda: nada é chamado automaticamente.

O enriquecimento por IA é gerado **sob demanda** em `GET /contents/:id/enrichment`:
se já existe um registro `COMPLETED`, ele é servido do banco (sem IA); caso
contrário, o registro vai para `PROCESSING`, o `AiService` é chamado e o
resultado é persistido como `COMPLETED`. Uma requisição concorrente que pegue o
registro em `PROCESSING` **não** dispara uma segunda geração. Em caso de falha da
IA, o registro vira `FAILED` com uma `errorMessage` amigável (sem secrets) e o
fallback derivado do próprio conteúdo (título/resumo originais) permanece
visível — a resposta segue `200`, para o leitor sempre ter a fonte original.

Falhas de configuração têm dois momentos distintos:

- Valor inválido de `LLM_PROVIDER`, como `depseek` ou `openai`, falha no boot com
  `Invalid LLM provider "<valor>". Accepted providers: mock, deepseek, gemini, openrouter, ollama.`.
- Valor reconhecido, mas ainda placeholder (`openrouter`, `ollama`), permite o
  boot. A chamada de IA falha sob demanda com `LLM provider "<provider>" is not implemented yet.`.

O log de startup sempre informa o provider ativo. Para `deepseek`/`gemini` sem
chave, ele inclui o aviso `sem DEEPSEEK_API_KEY`/`sem GEMINI_API_KEY — as chamadas
falharão até a chave ser configurada`; para placeholders (`openrouter`, `ollama`),
inclui `não implementado — as chamadas falharão`.

> **Aviso de ruptura:** `DEEPSEEK_MODEL` → `LLM_MODEL` e
> `DEEPSEEK_TIMEOUT_MS` → `LLM_TIMEOUT_MS`. Os nomes antigos não são mais lidos;
> atualize qualquer `.env` local.

> **Controle de custo:** a única porta de entrada de IA é o enriquecimento sob
> demanda (`GET /contents/:id/enrichment`), disparado ao abrir um conteúdo e
> apenas quando ainda não existe um enriquecimento `COMPLETED` — a segunda
> abertura serve do banco, sem nova chamada. Não há job em lote, fila ou cron; a
> ingestão RSS e o `GET /radar/today` **não** chamam IA. Nenhuma chamada e nenhum
> custo ocorrem sem ação explícita do usuário.

### Variáveis de ambiente

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `LLM_PROVIDER` | `mock` | Provedor ativo: `mock`, `deepseek`, `gemini`, `openrouter` ou `ollama`. |
| `LLM_MODEL` | Padrão do provider | Modelo genérico de LLM; opcional. Para `deepseek`, vazio usa `deepseek-chat`. |
| `LLM_TIMEOUT_MS` | `30000` | Tempo limite genérico das chamadas de LLM, em ms. Opcional. |
| `DEEPSEEK_API_KEY` | _(vazio)_ | Chave da API DeepSeek. **Nunca** commite nem logue. |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | Base da API DeepSeek. |
| `GEMINI_API_KEY` | _(vazio)_ | Chave da API Gemini (Google). **Nunca** commite nem logue. |
| `GEMINI_BASE_URL` | `https://generativelanguage.googleapis.com/v1beta` | Base da API Gemini. Opcional. |
| `OPENROUTER_API_KEY` | _(vazio)_ | Placeholder para a futura chave OpenRouter; ainda não implementado. |
| `OLLAMA_BASE_URL` | _(vazio)_ | Placeholder para a futura base Ollama; ainda não implementado. |

A chave de API **nunca** é logada nem versionada (`.env` está no `.gitignore`;
veja o [`.env.example`](.env.example)). Campos `*_API_KEY` devem ficar vazios no
exemplo e só receber valor no `.env` local ou no ambiente de deploy.

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
