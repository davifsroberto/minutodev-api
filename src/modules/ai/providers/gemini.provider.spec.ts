import { Logger } from '@nestjs/common';

import { ENRICHMENT_SYSTEM_PROMPT } from '../prompts/enrichment.prompt';
import { GeminiProvider } from './gemini.provider';
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
  shortSummary: 'Builds mais rápidas.',
  whyItMatters: 'Reduz o tempo de feedback.',
  keyPoints: ['Mais rápido', 'Compatível'],
  example: 'Build caiu de 12s para 7s.',
  whenToUse: 'Vale a pena em projetos grandes.',
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
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

describe('GeminiProvider', () => {
  let provider: GeminiProvider;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    provider = new GeminiProvider();
    // Evita agendar um timer real de timeout quando o fetch é mockado.
    jest
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(new AbortController().signal);
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

  it('usa gemini-2.5-flash como modelo padrão quando LLM_MODEL não está configurado', async () => {
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
      'https://gemini-proxy.local/v1beta/models/gemini-2.5-flash:generateContent',
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

  it('nunca registra a API key nos logs em caso de falha', async () => {
    process.env.GEMINI_API_KEY = 'super-secret-gemini-key';
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    jest.spyOn(global, 'fetch').mockResolvedValue(fakeResponse({}, false, 500));

    await expect(provider.enrichContent(input)).rejects.toThrow();

    const logged = errorSpy.mock.calls.flat().join(' ');
    expect(logged).not.toContain('super-secret-gemini-key');
  });
});
