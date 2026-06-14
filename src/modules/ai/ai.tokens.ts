import { LlmProvider } from './providers/llm-provider.interface';

export const LLM_PROVIDER_NAMES = [
  'mock',
  'deepseek',
  'gemini',
  'openrouter',
  'ollama',
] as const;

export type LlmProviderName = (typeof LLM_PROVIDER_NAMES)[number];

export const DEFAULT_LLM_PROVIDER: LlmProviderName = 'mock';

export type LlmProviderRegistry = Record<LlmProviderName, LlmProvider>;

export const LLM_PROVIDER_REGISTRY = Symbol('LLM_PROVIDER_REGISTRY');
