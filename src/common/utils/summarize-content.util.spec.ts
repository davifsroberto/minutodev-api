import { summarizeContent, SUMMARY_MAX_LENGTH } from './summarize-content.util';

describe('summarizeContent', () => {
  it('returns null for nullish or whitespace-only input', () => {
    expect(summarizeContent(null)).toBeNull();
    expect(summarizeContent(undefined)).toBeNull();
    expect(summarizeContent('   \n\t ')).toBeNull();
  });

  it('strips HTML tags and collapses whitespace', () => {
    const html = '<p>Olá   <strong>mundo</strong></p>\n<p>de novo</p>';

    expect(summarizeContent(html)).toBe('Olá mundo de novo');
  });

  it('keeps short text untouched (no ellipsis)', () => {
    const text = 'Resumo curto.';

    expect(summarizeContent(text)).toBe('Resumo curto.');
  });

  it('truncates long text at a word boundary with an ellipsis', () => {
    const result = summarizeContent('palavra '.repeat(100), 20);

    expect(result).toBe('palavra palavra…');
    expect(result!.length).toBeLessThanOrEqual(21); // 20 + reticências
  });

  it('hard-cuts a single token longer than the limit', () => {
    const result = summarizeContent('a'.repeat(50), 10);

    expect(result).toBe(`${'a'.repeat(10)}…`);
  });

  it('defaults to SUMMARY_MAX_LENGTH when no limit is given', () => {
    const long = 'lorem '.repeat(200);

    const result = summarizeContent(long)!;

    // o teaser nunca passa do limite + a reticência final
    expect(result.length).toBeLessThanOrEqual(SUMMARY_MAX_LENGTH + 1);
    expect(result.endsWith('…')).toBe(true);
  });
});
