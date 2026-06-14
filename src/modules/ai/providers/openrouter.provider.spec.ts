import { NotImplementedProviderError } from '../ai.errors';
import { EnrichContentInput } from './llm-provider.interface';
import { OpenRouterProvider } from './openrouter.provider';

const input: EnrichContentInput = {
  title: 'OpenRouter API update',
  summary: 'Provider placeholder.',
  url: 'https://example.com/openrouter',
  sourceName: 'Example',
  language: 'pt-BR',
};

describe('OpenRouterProvider', () => {
  it('instancia sem efeitos colaterais', () => {
    expect(() => new OpenRouterProvider()).not.toThrow();
  });

  it('rejeita enrichContent com NotImplementedProviderError nomeando openrouter', async () => {
    const provider = new OpenRouterProvider();

    await expect(provider.enrichContent(input)).rejects.toThrow(
      NotImplementedProviderError,
    );
    await expect(provider.enrichContent(input)).rejects.toThrow('openrouter');
  });

  it('não chama fetch antes de rejeitar', async () => {
    const provider = new OpenRouterProvider();
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(provider.enrichContent(input)).rejects.toThrow(
      NotImplementedProviderError,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
