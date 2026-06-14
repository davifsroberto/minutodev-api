import {
  DEFAULT_LLM_PROVIDER,
  LLM_PROVIDER_NAMES,
  LLM_PROVIDER_REGISTRY,
  LlmProviderName,
  LlmProviderRegistry,
} from './ai.tokens';
import { LlmProvider } from './providers/llm-provider.interface';

describe('ai tokens', () => {
  it('define o provedor padrão como mock', () => {
    expect(DEFAULT_LLM_PROVIDER).toBe('mock');
  });

  it('expõe exatamente os cinco nomes reconhecidos', () => {
    const expectedNames = [
      'mock',
      'deepseek',
      'gemini',
      'openrouter',
      'ollama',
    ];

    expect(LLM_PROVIDER_NAMES).toHaveLength(5);
    expect([...LLM_PROVIDER_NAMES].sort()).toEqual([...expectedNames].sort());
  });

  it('mantém a união de nomes alinhada à lista runtime', () => {
    const names: LlmProviderName[] = [...LLM_PROVIDER_NAMES];

    expect(names).toEqual([
      'mock',
      'deepseek',
      'gemini',
      'openrouter',
      'ollama',
    ]);
  });

  it('expõe um token Symbol distinto dos demais valores exportados', () => {
    expect(typeof LLM_PROVIDER_REGISTRY).toBe('symbol');
    expect(LLM_PROVIDER_REGISTRY).not.toBe(DEFAULT_LLM_PROVIDER);
    expect(LLM_PROVIDER_REGISTRY).not.toBe(LLM_PROVIDER_NAMES);
  });

  it('tipa o registry como um registro de provedores por nome', async () => {
    const provider: LlmProvider = {
      enrichContent: jest.fn(),
    };
    const registry: LlmProviderRegistry = {
      mock: provider,
      deepseek: provider,
      gemini: provider,
      openrouter: provider,
      ollama: provider,
    };

    expect(Object.keys(registry).sort()).toEqual(
      [...LLM_PROVIDER_NAMES].sort(),
    );
  });
});
