import { Logger } from '@nestjs/common';

import { DeepSeekProvider } from './deepseek.provider';
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

const chatCompletion = (content: string): unknown => ({
  choices: [{ message: { content } }],
});

const successfulChatCompletion = (): Response =>
  fakeResponse(chatCompletion(JSON.stringify(validOutput)));

const oldModelEnv = ['DEEPSEEK', 'MODEL'].join('_');
const oldTimeoutEnv = ['DEEPSEEK', 'TIMEOUT_MS'].join('_');

describe('DeepSeekProvider', () => {
  let provider: DeepSeekProvider;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    provider = new DeepSeekProvider();
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
    delete process.env.DEEPSEEK_API_KEY;
    expect(provider.isConfigured()).toBe(false);

    process.env.DEEPSEEK_API_KEY = 'secret-key';
    expect(provider.isConfigured()).toBe(true);
  });

  it('lança erro claro sem chamar fetch quando a chave não está configurada', async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(provider.enrichContent(input)).rejects.toThrow(
      /DEEPSEEK_API_KEY/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('chama o endpoint correto com Authorization e body, e parseia a resposta', async () => {
    process.env.DEEPSEEK_API_KEY = 'secret-key';
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(successfulChatCompletion());

    const result = await provider.enrichContent(input);

    expect(result).toEqual(validOutput);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect(init?.method).toBe('POST');

    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer secret-key');

    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe('deepseek-chat');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(Array.isArray(body.messages)).toBe(true);
  });

  it('usa LLM_MODEL quando configurado', async () => {
    process.env.DEEPSEEK_API_KEY = 'secret-key';
    process.env.LLM_MODEL = 'deepseek-reasoner';
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(successfulChatCompletion());

    await provider.enrichContent(input);

    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(init?.body as string).model).toBe('deepseek-reasoner');
  });

  it('usa deepseek-chat como fallback quando LLM_MODEL não está configurado', async () => {
    process.env.DEEPSEEK_API_KEY = 'secret-key';
    delete process.env.LLM_MODEL;
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(successfulChatCompletion());

    await provider.enrichContent(input);

    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(init?.body as string).model).toBe('deepseek-chat');
  });

  it('ignora a variável antiga de modelo quando LLM_MODEL não está configurado', async () => {
    process.env.DEEPSEEK_API_KEY = 'secret-key';
    process.env[oldModelEnv] = 'deepseek-reasoner';
    delete process.env.LLM_MODEL;
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(successfulChatCompletion());

    await provider.enrichContent(input);

    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(init?.body as string).model).toBe('deepseek-chat');
  });

  it('usa LLM_TIMEOUT_MS no AbortSignal.timeout', async () => {
    process.env.DEEPSEEK_API_KEY = 'secret-key';
    process.env.LLM_TIMEOUT_MS = '5000';
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
    jest.spyOn(global, 'fetch').mockResolvedValue(successfulChatCompletion());

    await provider.enrichContent(input);

    expect(timeoutSpy).toHaveBeenCalledWith(5000);
  });

  it('usa 30000 como timeout padrão quando LLM_TIMEOUT_MS não está configurado', async () => {
    process.env.DEEPSEEK_API_KEY = 'secret-key';
    delete process.env.LLM_TIMEOUT_MS;
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
    jest.spyOn(global, 'fetch').mockResolvedValue(successfulChatCompletion());

    await provider.enrichContent(input);

    expect(timeoutSpy).toHaveBeenCalledWith(30000);
  });

  it('ignora a variável antiga de timeout quando LLM_TIMEOUT_MS não está configurado', async () => {
    process.env.DEEPSEEK_API_KEY = 'secret-key';
    process.env[oldTimeoutEnv] = '1000';
    delete process.env.LLM_TIMEOUT_MS;
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
    jest.spyOn(global, 'fetch').mockResolvedValue(successfulChatCompletion());

    await provider.enrichContent(input);

    expect(timeoutSpy).toHaveBeenCalledWith(30000);
  });

  it('respeita DEEPSEEK_BASE_URL customizado', async () => {
    process.env.DEEPSEEK_API_KEY = 'secret-key';
    process.env.DEEPSEEK_BASE_URL = 'https://proxy.local';
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(successfulChatCompletion());

    await provider.enrichContent(input);

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://proxy.local/chat/completions');
  });

  it('lança quando a resposta HTTP não é bem-sucedida', async () => {
    process.env.DEEPSEEK_API_KEY = 'secret-key';
    jest.spyOn(global, 'fetch').mockResolvedValue(fakeResponse({}, false, 429));

    await expect(provider.enrichContent(input)).rejects.toThrow(/429/);
  });

  it('lança quando a resposta não contém conteúdo', async () => {
    process.env.DEEPSEEK_API_KEY = 'secret-key';
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(fakeResponse(chatCompletion('')));

    await expect(provider.enrichContent(input)).rejects.toThrow(
      /não contém conteúdo/,
    );
  });

  it('trata falha de rede/timeout do fetch com erro de provedor', async () => {
    process.env.DEEPSEEK_API_KEY = 'secret-key';
    const timeoutError = new Error('The operation was aborted');
    timeoutError.name = 'TimeoutError';
    jest.spyOn(global, 'fetch').mockRejectedValue(timeoutError);

    await expect(provider.enrichContent(input)).rejects.toThrow(/DeepSeek/);
  });

  it('nunca registra a API key nos logs em caso de falha', async () => {
    process.env.DEEPSEEK_API_KEY = 'super-secret-key';
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    jest.spyOn(global, 'fetch').mockResolvedValue(fakeResponse({}, false, 500));

    await expect(provider.enrichContent(input)).rejects.toThrow();

    const logged = errorSpy.mock.calls.flat().join(' ');
    expect(logged).not.toContain('super-secret-key');
  });
});
