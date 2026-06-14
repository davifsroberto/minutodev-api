import { LLM_PROVIDER_NAMES, LlmProviderName } from './ai.tokens';

export class InvalidLlmProviderError extends Error {
  constructor(provider: string) {
    super(
      `Invalid LLM provider "${provider}". Accepted providers: ${LLM_PROVIDER_NAMES.join(', ')}.`,
    );
    this.name = 'InvalidLlmProviderError';
  }
}

export class NotImplementedProviderError extends Error {
  constructor(provider: LlmProviderName) {
    super(`LLM provider "${provider}" is not implemented yet.`);
    this.name = 'NotImplementedProviderError';
  }
}
