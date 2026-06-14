import { Test, TestingModule } from '@nestjs/testing';

import { AiModule } from './ai.module';
import { AiService } from './ai.service';
import {
  LLM_PROVIDER_NAMES,
  LLM_PROVIDER_REGISTRY,
  LlmProviderName,
  LlmProviderRegistry,
} from './ai.tokens';
import { DeepSeekProvider } from './providers/deepseek.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { LlmProvider } from './providers/llm-provider.interface';
import { MockLlmProvider } from './providers/mock-llm.provider';
import { OllamaProvider } from './providers/ollama.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';

const providerClasses = {
  mock: MockLlmProvider,
  deepseek: DeepSeekProvider,
  gemini: GeminiProvider,
  openrouter: OpenRouterProvider,
  ollama: OllamaProvider,
} satisfies Record<LlmProviderName, new (...args: never[]) => LlmProvider>;

describe('AiModule', () => {
  let moduleRef: TestingModule;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_MODEL;
    delete process.env.LLM_TIMEOUT_MS;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_BASE_URL;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_BASE_URL;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OLLAMA_BASE_URL;

    moduleRef = await Test.createTestingModule({
      imports: [AiModule],
    }).compile();
  });

  afterEach(async () => {
    await moduleRef?.close();
    process.env = originalEnv;
  });

  const registry = (): LlmProviderRegistry =>
    moduleRef.get<LlmProviderRegistry>(LLM_PROVIDER_REGISTRY);

  it('compila e inicializa sem variáveis de IA', async () => {
    await expect(moduleRef.init()).resolves.toBe(moduleRef);

    expect(moduleRef.get(AiService)).toBeDefined();
    expect(registry()).toBeDefined();
  });

  it('resolve o registry com exatamente os cinco nomes reconhecidos', () => {
    expect(Object.keys(registry()).sort()).toEqual(
      [...LLM_PROVIDER_NAMES].sort(),
    );
  });

  it.each(LLM_PROVIDER_NAMES)('mapeia %s para a classe esperada', (name) => {
    expect(registry()[name]).toBeInstanceOf(providerClasses[name]);
  });

  it.each(LLM_PROVIDER_NAMES)(
    'resolve %s como LlmProvider definido',
    (name) => {
      const provider = registry()[name];

      expect(provider).toBeDefined();
      expect(provider.enrichContent).toEqual(expect.any(Function));
    },
  );

  it.each(LLM_PROVIDER_NAMES)(
    'usa para %s a mesma instância injetada pelo módulo',
    (name) => {
      expect(registry()[name]).toBe(moduleRef.get(providerClasses[name]));
    },
  );
});
