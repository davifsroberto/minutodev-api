import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { InvalidLlmProviderError } from './ai.errors';
import { AiService } from './ai.service';
import {
  LLM_PROVIDER_REGISTRY,
  LlmProviderName,
  LlmProviderRegistry,
} from './ai.tokens';
import {
  EnrichContentInput,
  EnrichContentOutput,
} from './providers/llm-provider.interface';

const input: EnrichContentInput = {
  title: 'A title',
  summary: 'A summary',
  url: 'https://example.com/x',
  sourceName: 'Source',
  language: 'pt-BR',
};

const mockOutput: EnrichContentOutput = {
  translatedTitle: 'from-mock',
  shortSummary: 's',
  whyItMatters: 'w',
  keyPoints: ['k'],
  briefContent: 'b',
};

const deepseekOutput: EnrichContentOutput = {
  ...mockOutput,
  translatedTitle: 'from-deepseek',
};

type ProviderMock = {
  enrichContent: jest.Mock<Promise<EnrichContentOutput>, [EnrichContentInput]>;
};

type ConfigurableProviderMock = ProviderMock & {
  isConfigured: jest.Mock<boolean, []>;
};

describe('AiService', () => {
  let service: AiService;
  let registry: LlmProviderRegistry;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };

    registry = createRegistry();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: LLM_PROVIDER_REGISTRY, useValue: registry },
      ],
    }).compile();

    service = module.get(AiService);
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('resolveProviderName', () => {
    it('usa mock por padrão quando LLM_PROVIDER não está definido', () => {
      delete process.env.LLM_PROVIDER;
      expect(service.resolveProviderName()).toBe('mock');
    });

    it('usa mock quando LLM_PROVIDER está vazio ou contém espaços', () => {
      process.env.LLM_PROVIDER = '   ';
      expect(service.resolveProviderName()).toBe('mock');
    });

    it('usa mock quando LLM_PROVIDER=mock', () => {
      process.env.LLM_PROVIDER = ' Mock ';
      expect(service.resolveProviderName()).toBe('mock');
    });

    it('usa deepseek quando LLM_PROVIDER=deepseek (case-insensitive)', () => {
      process.env.LLM_PROVIDER = 'DeepSeek';
      expect(service.resolveProviderName()).toBe('deepseek');
    });

    it.each<LlmProviderName>(['gemini', 'openrouter', 'ollama'])(
      'usa %s quando selecionado por env',
      (providerName) => {
        process.env.LLM_PROVIDER = providerName.toUpperCase();
        expect(service.resolveProviderName()).toBe(providerName);
      },
    );

    it('lança InvalidLlmProviderError para valor desconhecido listando os aceitos', () => {
      process.env.LLM_PROVIDER = 'depseek';

      expect(() => service.resolveProviderName()).toThrow(
        InvalidLlmProviderError,
      );
      expect(() => service.resolveProviderName()).toThrow(
        'Invalid LLM provider "depseek". Accepted providers: mock, deepseek, gemini, openrouter, ollama.',
      );
    });
  });

  describe('enrichContent', () => {
    it('delega ao provedor mock por padrão', async () => {
      delete process.env.LLM_PROVIDER;

      await expect(service.enrichContent(input)).resolves.toBe(mockOutput);
      expect(registry.mock.enrichContent).toHaveBeenCalledWith(input);
      expect(registry.deepseek.enrichContent).not.toHaveBeenCalled();
    });

    it('delega ao DeepSeek quando selecionado por env', async () => {
      process.env.LLM_PROVIDER = 'deepseek';

      await expect(service.enrichContent(input)).resolves.toBe(deepseekOutput);
      expect(registry.deepseek.enrichContent).toHaveBeenCalledWith(input);
      expect(registry.mock.enrichContent).not.toHaveBeenCalled();
    });

    it.each<LlmProviderName>(['gemini', 'openrouter', 'ollama'])(
      'delega ao registry.%s quando selecionado',
      async (providerName) => {
        process.env.LLM_PROVIDER = providerName;

        await expect(service.enrichContent(input)).resolves.toEqual(
          placeholderOutput(providerName),
        );
        expect(registry[providerName].enrichContent).toHaveBeenCalledWith(
          input,
        );
        expect(registry.mock.enrichContent).not.toHaveBeenCalled();
        expect(registry.deepseek.enrichContent).not.toHaveBeenCalled();
      },
    );

    it('propaga InvalidLlmProviderError no caminho de seleção', () => {
      process.env.LLM_PROVIDER = 'depseek';

      expect(() => service.enrichContent(input)).toThrow(
        InvalidLlmProviderError,
      );
    });
  });

  describe('onModuleInit', () => {
    it('registra o provedor ativo no boot', () => {
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      process.env.LLM_PROVIDER = 'mock';

      service.onModuleInit();

      expect(logSpy.mock.calls.flat().join(' ')).toContain('mock');
    });

    it('lança InvalidLlmProviderError no boot e não registra sucesso para provider inválido', () => {
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      process.env.LLM_PROVIDER = 'depseek';

      expect(() => service.onModuleInit()).toThrow(InvalidLlmProviderError);
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('sinaliza deepseek selecionado sem chave configurada', () => {
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      process.env.LLM_PROVIDER = 'deepseek';
      process.env.DEEPSEEK_API_KEY = 'super-secret-key';
      configurableProviderMock(registry).isConfigured.mockReturnValue(false);

      service.onModuleInit();

      const logs = logSpy.mock.calls.flat().join(' ');
      expect(logs).toMatch(/DEEPSEEK_API_KEY/);
      expect(logs).not.toContain('super-secret-key');
    });

    it('marca providers placeholder no log de boot', () => {
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      process.env.LLM_PROVIDER = 'gemini';

      service.onModuleInit();

      expect(logSpy.mock.calls.flat().join(' ')).toContain(
        '(não implementado — as chamadas falharão)',
      );
    });

    it('não registra valor de API key nos logs de seleção/startup', () => {
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      process.env.DEEPSEEK_API_KEY = 'super-secret-key';

      for (const providerName of ['mock', 'deepseek', 'gemini'] as const) {
        process.env.LLM_PROVIDER = providerName;
        service.onModuleInit();
        service.resolveProviderName();
      }

      expect(logSpy.mock.calls.flat().join(' ')).not.toContain(
        'super-secret-key',
      );
    });
  });
});

function createRegistry(): LlmProviderRegistry {
  return {
    mock: createProvider(mockOutput),
    deepseek: {
      ...createProvider(deepseekOutput),
      isConfigured: jest.fn<boolean, []>().mockReturnValue(true),
    },
    gemini: createProvider(placeholderOutput('gemini')),
    openrouter: createProvider(placeholderOutput('openrouter')),
    ollama: createProvider(placeholderOutput('ollama')),
  };
}

function createProvider(output: EnrichContentOutput): ProviderMock {
  return {
    enrichContent: jest
      .fn<Promise<EnrichContentOutput>, [EnrichContentInput]>()
      .mockResolvedValue(output),
  };
}

function configurableProviderMock(
  registry: LlmProviderRegistry,
): ConfigurableProviderMock {
  return registry.deepseek as ConfigurableProviderMock;
}

function placeholderOutput(providerName: LlmProviderName): EnrichContentOutput {
  return {
    ...mockOutput,
    translatedTitle: `from-${providerName}`,
  };
}
