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

/**
 * Falha transitória de um provedor de IA — rate limit (HTTP 429), indisponível
 * (5xx), timeout ou erro de rede — depois de esgotadas as tentativas. Sinaliza
 * ao chamador que a geração pode ser repetida mais tarde (não é um erro
 * definitivo), para não marcar o conteúdo como falho de forma permanente.
 */
export class TransientAiError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'TransientAiError';
  }
}
