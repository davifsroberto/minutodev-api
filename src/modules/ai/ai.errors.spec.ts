import {
  InvalidLlmProviderError,
  NotImplementedProviderError,
} from './ai.errors';
import { LLM_PROVIDER_NAMES, LlmProviderName } from './ai.tokens';

const expectMessageToListAcceptedNames = (message: string) => {
  for (const providerName of LLM_PROVIDER_NAMES) {
    expect(message).toContain(providerName);
  }
};

describe('ai errors', () => {
  describe('InvalidLlmProviderError', () => {
    it('nomeia o valor inválido e todos os provedores aceitos', () => {
      const error = new InvalidLlmProviderError('depseek');

      expect(error.message).toContain('depseek');
      expectMessageToListAcceptedNames(error.message);
    });

    it('interpola diferentes valores inválidos', () => {
      const error = new InvalidLlmProviderError('openai');

      expect(error.message).toContain('openai');
      expectMessageToListAcceptedNames(error.message);
    });

    it('define nome estável e estende Error', () => {
      const error = new InvalidLlmProviderError('x');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('InvalidLlmProviderError');
    });
  });

  describe('NotImplementedProviderError', () => {
    it('nomeia o provedor gemini', () => {
      expect(new NotImplementedProviderError('gemini').message).toContain(
        'gemini',
      );
    });

    it('interpola outros provedores reconhecidos', () => {
      expect(new NotImplementedProviderError('ollama').message).toContain(
        'ollama',
      );
    });

    it('define nome estável e estende Error', () => {
      const error = new NotImplementedProviderError('gemini');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('NotImplementedProviderError');
    });
  });

  it('não ecoa uma chave representativa nas mensagens', () => {
    const apiKey = 'super-secret-key';
    const provider = 'deepseek' satisfies LlmProviderName;

    expect(new InvalidLlmProviderError(provider).message).not.toContain(apiKey);
    expect(new NotImplementedProviderError(provider).message).not.toContain(
      apiKey,
    );
  });
});
