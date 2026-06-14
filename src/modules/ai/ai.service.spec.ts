import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AiService } from './ai.service';
import { DeepSeekProvider } from './providers/deepseek.provider';
import {
  EnrichContentInput,
  EnrichContentOutput,
} from './providers/llm-provider.interface';
import { MockLlmProvider } from './providers/mock-llm.provider';

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

describe('AiService', () => {
  let service: AiService;
  let mockProvider: ProviderMock;
  let deepseekProvider: ProviderMock & { isConfigured: jest.Mock<boolean, []> };
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };

    mockProvider = {
      enrichContent: jest
        .fn<Promise<EnrichContentOutput>, [EnrichContentInput]>()
        .mockResolvedValue(mockOutput),
    };
    deepseekProvider = {
      enrichContent: jest
        .fn<Promise<EnrichContentOutput>, [EnrichContentInput]>()
        .mockResolvedValue(deepseekOutput),
      isConfigured: jest.fn<boolean, []>().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: MockLlmProvider, useValue: mockProvider },
        { provide: DeepSeekProvider, useValue: deepseekProvider },
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

    it('usa mock quando LLM_PROVIDER=mock', () => {
      process.env.LLM_PROVIDER = 'mock';
      expect(service.resolveProviderName()).toBe('mock');
    });

    it('usa deepseek quando LLM_PROVIDER=deepseek (case-insensitive)', () => {
      process.env.LLM_PROVIDER = 'DeepSeek';
      expect(service.resolveProviderName()).toBe('deepseek');
    });

    it('cai para mock e emite aviso quando LLM_PROVIDER é desconhecido', () => {
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      process.env.LLM_PROVIDER = 'openai';

      expect(service.resolveProviderName()).toBe('mock');
      expect(warnSpy).toHaveBeenCalled();
    });
  });

  describe('enrichContent', () => {
    it('delega ao provedor mock por padrão', async () => {
      delete process.env.LLM_PROVIDER;

      await expect(service.enrichContent(input)).resolves.toBe(mockOutput);
      expect(mockProvider.enrichContent).toHaveBeenCalledWith(input);
      expect(deepseekProvider.enrichContent).not.toHaveBeenCalled();
    });

    it('delega ao DeepSeek quando selecionado por env', async () => {
      process.env.LLM_PROVIDER = 'deepseek';

      await expect(service.enrichContent(input)).resolves.toBe(deepseekOutput);
      expect(deepseekProvider.enrichContent).toHaveBeenCalledWith(input);
      expect(mockProvider.enrichContent).not.toHaveBeenCalled();
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

    it('sinaliza deepseek selecionado sem chave configurada', () => {
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      process.env.LLM_PROVIDER = 'deepseek';
      deepseekProvider.isConfigured.mockReturnValue(false);

      service.onModuleInit();

      expect(logSpy.mock.calls.flat().join(' ')).toMatch(/DEEPSEEK_API_KEY/);
    });
  });
});
