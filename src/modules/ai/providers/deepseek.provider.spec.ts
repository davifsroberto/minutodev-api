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
  shortSummary: 'Builds mais rápidas.',
  whyItMatters: 'Reduz o tempo de feedback.',
  keyPoints: ['Mais rápido', 'Compatível'],
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
      .mockResolvedValue(
        fakeResponse(chatCompletion(JSON.stringify(validOutput))),
      );

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

  it('respeita DEEPSEEK_BASE_URL e DEEPSEEK_MODEL customizados', async () => {
    process.env.DEEPSEEK_API_KEY = 'secret-key';
    process.env.DEEPSEEK_BASE_URL = 'https://proxy.local';
    process.env.DEEPSEEK_MODEL = 'deepseek-reasoner';
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        fakeResponse(chatCompletion(JSON.stringify(validOutput))),
      );

    await provider.enrichContent(input);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://proxy.local/chat/completions');
    expect(JSON.parse(init?.body as string).model).toBe('deepseek-reasoner');
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
