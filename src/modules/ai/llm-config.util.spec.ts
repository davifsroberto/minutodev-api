import { resolveLlmModel, resolveLlmTimeoutMs } from './llm-config.util';

describe('llm-config.util', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.LLM_MODEL;
    delete process.env.LLM_TIMEOUT_MS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('resolveLlmModel', () => {
    it('retorna o fallback quando LLM_MODEL não está definido', () => {
      expect(resolveLlmModel('deepseek-chat')).toBe('deepseek-chat');
    });

    it('retorna o fallback quando LLM_MODEL está vazio após trim', () => {
      process.env.LLM_MODEL = '   ';

      expect(resolveLlmModel('deepseek-chat')).toBe('deepseek-chat');
    });

    it('retorna LLM_MODEL quando há valor não vazio', () => {
      process.env.LLM_MODEL = 'gpt-x';

      expect(resolveLlmModel('deepseek-chat')).toBe('gpt-x');
    });
  });

  describe('resolveLlmTimeoutMs', () => {
    it('retorna 30000 quando LLM_TIMEOUT_MS não está definido', () => {
      expect(resolveLlmTimeoutMs()).toBe(30_000);
    });

    it('retorna 30000 quando LLM_TIMEOUT_MS não é numérico', () => {
      process.env.LLM_TIMEOUT_MS = 'abc';

      expect(resolveLlmTimeoutMs()).toBe(30_000);
    });

    it('retorna 30000 quando LLM_TIMEOUT_MS é zero', () => {
      process.env.LLM_TIMEOUT_MS = '0';

      expect(resolveLlmTimeoutMs()).toBe(30_000);
    });

    it('retorna 30000 quando LLM_TIMEOUT_MS é negativo', () => {
      process.env.LLM_TIMEOUT_MS = '-1';

      expect(resolveLlmTimeoutMs()).toBe(30_000);
    });

    it('retorna o timeout configurado quando LLM_TIMEOUT_MS é positivo', () => {
      process.env.LLM_TIMEOUT_MS = '5000';

      expect(resolveLlmTimeoutMs()).toBe(5000);
    });
  });
});
