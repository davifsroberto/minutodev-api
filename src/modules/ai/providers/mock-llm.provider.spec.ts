import { EnrichContentInput } from './llm-provider.interface';
import { MockLlmProvider } from './mock-llm.provider';

const input: EnrichContentInput = {
  title: 'Rust 2.0 announced',
  summary: 'Big changes ahead.',
  url: 'https://example.com/rust',
  sourceName: 'Rust Blog',
  language: 'pt-BR',
};

describe('MockLlmProvider', () => {
  let provider: MockLlmProvider;

  beforeEach(() => {
    provider = new MockLlmProvider();
  });

  it('retorna todos os campos do contrato', async () => {
    const output = await provider.enrichContent(input);

    expect(typeof output.translatedTitle).toBe('string');
    expect(typeof output.summary30s).toBe('string');
    expect(typeof output.shortSummary).toBe('string');
    expect(typeof output.whyItMatters).toBe('string');
    expect(typeof output.keyInsight).toBe('string');
    expect(typeof output.briefContent).toBe('string');
    expect(typeof output.example).toBe('string');
    expect(typeof output.whenToUse).toBe('string');
    expect(Array.isArray(output.keyPoints)).toBe(true);
    expect(output.keyPoints.every((point) => typeof point === 'string')).toBe(
      true,
    );
    expect(output.audienceFor.length).toBeGreaterThan(0);
    expect(output.audienceIgnore.length).toBeGreaterThan(0);
  });

  it('não chama nenhuma API externa', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');

    await provider.enrichContent(input);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('deriva uma saída determinística a partir da entrada', async () => {
    const first = await provider.enrichContent(input);
    const second = await provider.enrichContent(input);

    expect(first).toEqual(second);
    expect(first.translatedTitle).toContain('Rust 2.0 announced');
    expect(first.keyPoints.join(' ')).toContain('Rust Blog');
  });

  it('usa o summary fornecido como resumo', async () => {
    const output = await provider.enrichContent(input);

    expect(output.shortSummary).toBe('Big changes ahead.');
  });

  it('gera um fallback derivado do título quando não há summary', async () => {
    const output = await provider.enrichContent({ ...input, summary: null });

    expect(output.shortSummary).toContain('Rust 2.0 announced');
    expect(output.briefContent).toContain('Rust 2.0 announced');
  });
});
