import { Logger } from '@nestjs/common';

import { TransientAiError } from '../ai.errors';
import { ENRICHMENT_SYSTEM_PROMPT } from '../prompts/enrichment.prompt';
import { GeminiProvider, MAX_ATTEMPTS } from './gemini.provider';
import { EnrichContentInput } from './llm-provider.interface';

const input: EnrichContentInput = {
  title: 'New compiler released',
  summary: 'Faster builds.',
  url: 'https://example.com/post',
  sourceName: 'Compiler News',
  language: 'pt-BR',
};

const validOutput = {
  translatedTitle: 'Novo compilador lançado',
  summary30s: 'Novo compilador. Mais rápido. Vale para quem sofre com build.',
  shortSummary: 'Builds mais rápidas.',
  whyItMatters: 'Reduz o tempo de feedback.',
  keyInsight: 'O gargalo era o tempo de build, não a linguagem.',
  keyPoints: ['Mais rápido', 'Compatível'],
  example: 'Build caiu de 12s para 7s.',
  whenToUse: 'Vale a pena em projetos grandes.',
  audienceFor: ['Backend', 'DevOps'],
  audienceIgnore: ['Frontend puro'],
  briefContent: 'Resumo breve e original em pt-BR.',
};

const fakeResponse = (body: unknown, ok = true, status = 200): Response =>
  ({
    ok,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as Response;

const generateContentResponse = (text: string): unknown => ({
  candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
});

const successfulResponse = (): Response =>
  fakeResponse(generateContentResponse(JSON.stringify(validOutput)));

const DEFAULT_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent';

describe('GeminiProvider', () => {
  let provider: GeminiProvider;
  let sleepSpy: jest.SpyInstance<Promise<void>, [number]>;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    provider = new GeminiProvider();
    // Evita agendar um timer real de timeout quando o fetch é mockado.
    jest
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(new AbortController().signal);
    // Retries instantâneos: sem esperar o backoff real nos testes.
    sleepSpy = jest
      .spyOn(
        provider as unknown as { sleep: (ms: number) => Promise<void> },
        'sleep',
      )
      .mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('isConfigured reflete a presença da chave', () => {
    delete process.env.GEMINI_API_KEY;
    expect(provider.isConfigured()).toBe(false);

    process.env.GEMINI_API_KEY = 'secret-key';
    expect(provider.isConfigured()).toBe(true);
  });

  it('lança erro claro sem chamar fetch quando a chave não está configurada', async () => {
    delete process.env.GEMINI_API_KEY;
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(provider.enrichContent(input)).rejects.toThrow(
      /GEMINI_API_KEY/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('chama generateContent com header x-goog-api-key e corpo Gemini, e parseia a resposta', async () => {
    process.env.GEMINI_API_KEY = 'secret-key';
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(successfulResponse());

    const result = await provider.enrichContent(input);

    expect(result).toEqual(validOutput);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(DEFAULT_ENDPOINT);
    expect(init?.method).toBe('POST');

    const headers = init?.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('secret-key');
    expect(headers.Authorization).toBeUndefined();

    const body = JSON.parse(init?.body as string);
    expect(body.systemInstruction.parts[0].text).toBe(ENRICHMENT_SYSTEM_PROMPT);
    expect(body.contents[0].role).toBe('user');
    expect(body.generationConfig.responseMimeType).toBe('application/json');

    // o prompt do usuário deve carregar os dados do input (wiring provider→prompt)
    const userText = body.contents[0].parts[0].text;
    expect(userText).toContain(input.title);
    expect(userText).toContain(input.url);
  });

  it('usa LLM_MODEL no path quando configurado', async () => {
    process.env.GEMINI_API_KEY = 'secret-key';
    process.env.LLM_MODEL = 'gemini-2.5-pro';
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(successfulResponse());

    await provider.enrichContent(input);

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
    );
  });

  it('usa gemini-3.5-flash-lite como modelo padrão quando LLM_MODEL não está configurado', async () => {
    process.env.GEMINI_API_KEY = 'secret-key';
    delete process.env.LLM_MODEL;
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(successfulResponse());

    await provider.enrichContent(input);

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe(DEFAULT_ENDPOINT);
  });

  it('usa LLM_TIMEOUT_MS no AbortSignal.timeout', async () => {
    process.env.GEMINI_API_KEY = 'secret-key';
    process.env.LLM_TIMEOUT_MS = '5000';
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
    jest.spyOn(global, 'fetch').mockResolvedValue(successfulResponse());

    await provider.enrichContent(input);

    expect(timeoutSpy).toHaveBeenCalledWith(5000);
  });

  it('usa 30000 como timeout padrão quando LLM_TIMEOUT_MS não está configurado', async () => {
    process.env.GEMINI_API_KEY = 'secret-key';
    delete process.env.LLM_TIMEOUT_MS;
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
    jest.spyOn(global, 'fetch').mockResolvedValue(successfulResponse());

    await provider.enrichContent(input);

    expect(timeoutSpy).toHaveBeenCalledWith(30000);
  });

  it('respeita GEMINI_BASE_URL customizado', async () => {
    process.env.GEMINI_API_KEY = 'secret-key';
    process.env.GEMINI_BASE_URL = 'https://gemini-proxy.local/v1beta';
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(successfulResponse());

    await provider.enrichContent(input);

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      'https://gemini-proxy.local/v1beta/models/gemini-3.5-flash-lite:generateContent',
    );
  });

  it('lança com o status e detalhe quando a resposta HTTP não é bem-sucedida', async () => {
    process.env.GEMINI_API_KEY = 'secret-key';
    jest.spyOn(global, 'fetch').mockResolvedValue(
      fakeResponse(
        {
          error: {
            code: 429,
            status: 'RESOURCE_EXHAUSTED',
            message: 'Quota exceeded',
          },
        },
        false,
        429,
      ),
    );

    const promise = provider.enrichContent(input);
    await expect(promise).rejects.toThrow(/429/);
    await expect(provider.enrichContent(input)).rejects.toThrow(
      /RESOURCE_EXHAUSTED/,
    );
  });

  it('lança quando a geração é bloqueada por segurança', async () => {
    process.env.GEMINI_API_KEY = 'secret-key';
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        fakeResponse({ promptFeedback: { blockReason: 'SAFETY' } }),
      );

    await expect(provider.enrichContent(input)).rejects.toThrow(/SAFETY/);
  });

  it('lança quando a resposta não contém conteúdo, citando o finishReason', async () => {
    process.env.GEMINI_API_KEY = 'secret-key';
    jest.spyOn(global, 'fetch').mockResolvedValue(
      fakeResponse({
        candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }],
      }),
    );

    await expect(provider.enrichContent(input)).rejects.toThrow(/MAX_TOKENS/);
  });

  it('lança erro de truncamento quando finishReason != STOP com texto parcial', async () => {
    process.env.GEMINI_API_KEY = 'secret-key';
    jest.spyOn(global, 'fetch').mockResolvedValue(
      fakeResponse({
        candidates: [
          {
            content: { parts: [{ text: '{"translatedTitle":"parcial' }] },
            finishReason: 'MAX_TOKENS',
          },
        ],
      }),
    );

    await expect(provider.enrichContent(input)).rejects.toThrow(/truncada/);
    await expect(provider.enrichContent(input)).rejects.toThrow(/MAX_TOKENS/);
  });

  it('lança mensagem clara quando o corpo de sucesso não é JSON', async () => {
    process.env.GEMINI_API_KEY = 'secret-key';
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.reject(new SyntaxError('Unexpected end of JSON input')),
    } as unknown as Response);

    await expect(provider.enrichContent(input)).rejects.toThrow(
      /não é um JSON válido/,
    );
  });

  it('não lança exceção secundária quando o corpo de erro HTTP não é JSON', async () => {
    process.env.GEMINI_API_KEY = 'secret-key';
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON')),
    } as unknown as Response);

    await expect(provider.enrichContent(input)).rejects.toThrow(/500/);
  });

  it('trata timeout do fetch com mensagem específica de tempo limite', async () => {
    process.env.GEMINI_API_KEY = 'secret-key';
    const timeoutError = new Error('The operation was aborted');
    timeoutError.name = 'TimeoutError';
    jest.spyOn(global, 'fetch').mockRejectedValue(timeoutError);

    await expect(provider.enrichContent(input)).rejects.toThrow(
      /tempo limite excedido/,
    );
  });

  it('trata throwable não-Error do fetch como erro desconhecido', async () => {
    process.env.GEMINI_API_KEY = 'secret-key';
    jest.spyOn(global, 'fetch').mockRejectedValue('boom');

    await expect(provider.enrichContent(input)).rejects.toThrow(
      /erro desconhecido/,
    );
  });

  it('reexecuta uma falha 5xx transitória e tem sucesso na tentativa seguinte', async () => {
    process.env.GEMINI_API_KEY = 'secret-key';
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        fakeResponse({ error: { status: 'UNAVAILABLE' } }, false, 503),
      )
      .mockResolvedValue(successfulResponse());

    await expect(provider.enrichContent(input)).resolves.toEqual(validOutput);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // uma espera de backoff (base) entre a falha 5xx e o sucesso
    expect(sleepSpy).toHaveBeenCalledTimes(1);
    expect(sleepSpy).toHaveBeenCalledWith(500);
  });

  it('desiste após MAX_ATTEMPTS em 5xx persistente e lança TransientAiError', async () => {
    process.env.GEMINI_API_KEY = 'secret-key';
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        fakeResponse({ error: { status: 'UNAVAILABLE' } }, false, 503),
      );

    await expect(provider.enrichContent(input)).rejects.toBeInstanceOf(
      TransientAiError,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    // espera entre as tentativas com backoff exponencial (500ms, 1000ms)
    expect(sleepSpy).toHaveBeenCalledTimes(MAX_ATTEMPTS - 1);
    expect(sleepSpy).toHaveBeenNthCalledWith(1, 500);
    expect(sleepSpy).toHaveBeenNthCalledWith(2, 1000);
  });

  it('reexecuta um 429 com janela curta (retryDelay) respeitando a espera informada', async () => {
    process.env.GEMINI_API_KEY = 'secret-key';
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        fakeResponse(
          {
            error: {
              code: 429,
              status: 'RESOURCE_EXHAUSTED',
              details: [
                {
                  '@type': 'type.googleapis.com/google.rpc.RetryInfo',
                  retryDelay: '1s',
                },
              ],
            },
          },
          false,
          429,
        ),
      )
      .mockResolvedValue(successfulResponse());

    await expect(provider.enrichContent(input)).resolves.toEqual(validOutput);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // usa a janela informada (1s), não o backoff exponencial
    expect(sleepSpy).toHaveBeenCalledWith(1000);
  });

  it('não reexecuta um 429 sem janela de retry (uma única chamada)', async () => {
    process.env.GEMINI_API_KEY = 'secret-key';
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      fakeResponse(
        {
          error: {
            code: 429,
            status: 'RESOURCE_EXHAUSTED',
            message: 'Quota exceeded',
          },
        },
        false,
        429,
      ),
    );

    const error: unknown = await provider.enrichContent(input).catch((e) => e);

    expect(error).toBeInstanceOf(TransientAiError);
    expect((error as TransientAiError).retryAfterMs).toBeUndefined();
    // 429 sem janela não deve martelar a quota: uma única tentativa, sem espera.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(sleepSpy).not.toHaveBeenCalled();
  });

  it('429 com janela longa (retryDelay) não é reexecutado e sobe como TransientAiError', async () => {
    process.env.GEMINI_API_KEY = 'secret-key';
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue(
      fakeResponse(
        {
          error: {
            code: 429,
            status: 'RESOURCE_EXHAUSTED',
            message: 'Quota exceeded',
            details: [
              {
                '@type': 'type.googleapis.com/google.rpc.RetryInfo',
                retryDelay: '59s',
              },
            ],
          },
        },
        false,
        429,
      ),
    );

    const error: unknown = await provider.enrichContent(input).catch((e) => e);

    expect(error).toBeInstanceOf(TransientAiError);
    expect((error as TransientAiError).retryAfterMs).toBe(59000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('erro de rede/timeout sobe como TransientAiError após as tentativas', async () => {
    process.env.GEMINI_API_KEY = 'secret-key';
    const timeoutError = new Error('aborted');
    timeoutError.name = 'TimeoutError';
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(timeoutError);

    await expect(provider.enrichContent(input)).rejects.toBeInstanceOf(
      TransientAiError,
    );
    expect(fetchSpy).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it('nunca registra a API key nos logs em caso de falha (error e warn)', async () => {
    process.env.GEMINI_API_KEY = 'super-secret-gemini-key';
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    // 500 reexecuta, então o canal warn (log de retry) também é exercitado.
    jest.spyOn(global, 'fetch').mockResolvedValue(fakeResponse({}, false, 500));

    await expect(provider.enrichContent(input)).rejects.toThrow();

    const logged = [...errorSpy.mock.calls, ...warnSpy.mock.calls]
      .flat()
      .join(' ');
    expect(warnSpy).toHaveBeenCalled();
    expect(logged).not.toContain('super-secret-gemini-key');
  });
});
