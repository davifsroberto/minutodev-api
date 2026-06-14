import { NotImplementedProviderError } from '../ai.errors';
import { GeminiProvider } from './gemini.provider';
import { EnrichContentInput } from './llm-provider.interface';

const input: EnrichContentInput = {
  title: 'Gemini API update',
  summary: 'Provider placeholder.',
  url: 'https://example.com/gemini',
  sourceName: 'Example',
  language: 'pt-BR',
};

describe('GeminiProvider', () => {
  it('instancia sem efeitos colaterais', () => {
    expect(() => new GeminiProvider()).not.toThrow();
  });

  it('rejeita enrichContent com NotImplementedProviderError nomeando gemini', async () => {
    const provider = new GeminiProvider();

    await expect(provider.enrichContent(input)).rejects.toThrow(
      NotImplementedProviderError,
    );
    await expect(provider.enrichContent(input)).rejects.toThrow('gemini');
  });

  it('não chama fetch antes de rejeitar', async () => {
    const provider = new GeminiProvider();
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(provider.enrichContent(input)).rejects.toThrow(
      NotImplementedProviderError,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
