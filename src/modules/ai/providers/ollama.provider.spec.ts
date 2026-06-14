import { NotImplementedProviderError } from '../ai.errors';
import { EnrichContentInput } from './llm-provider.interface';
import { OllamaProvider } from './ollama.provider';

const input: EnrichContentInput = {
  title: 'Ollama local model update',
  summary: 'Provider placeholder.',
  url: 'https://example.com/ollama',
  sourceName: 'Example',
  language: 'pt-BR',
};

describe('OllamaProvider', () => {
  it('instancia sem efeitos colaterais', () => {
    expect(() => new OllamaProvider()).not.toThrow();
  });

  it('rejeita enrichContent com NotImplementedProviderError nomeando ollama', async () => {
    const provider = new OllamaProvider();

    await expect(provider.enrichContent(input)).rejects.toThrow(
      NotImplementedProviderError,
    );
    await expect(provider.enrichContent(input)).rejects.toThrow('ollama');
  });

  it('não chama fetch antes de rejeitar', async () => {
    const provider = new OllamaProvider();
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(provider.enrichContent(input)).rejects.toThrow(
      NotImplementedProviderError,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
