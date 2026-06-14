import { extractOgImageUrl } from './og-image.util';

describe('extractOgImageUrl', () => {
  it('extrai a og:image', () => {
    const html =
      '<head><meta property="og:image" content="https://cdn.test/og.jpg"></head>';

    expect(extractOgImageUrl(html)).toBe('https://cdn.test/og.jpg');
  });

  it('prioriza og:image sobre twitter:image', () => {
    const html = [
      '<meta name="twitter:image" content="https://cdn.test/tw.jpg">',
      '<meta property="og:image" content="https://cdn.test/og.jpg">',
    ].join('');

    expect(extractOgImageUrl(html)).toBe('https://cdn.test/og.jpg');
  });

  it('cai para twitter:image quando não há og:image', () => {
    const html =
      '<meta name="twitter:image" content="https://cdn.test/tw.jpg">';

    expect(extractOgImageUrl(html)).toBe('https://cdn.test/tw.jpg');
  });

  it('tolera atributos fora de ordem (content antes de property)', () => {
    const html =
      '<meta content="https://cdn.test/og.jpg" property="og:image" />';

    expect(extractOgImageUrl(html)).toBe('https://cdn.test/og.jpg');
  });

  it('tolera aspas simples', () => {
    const html = "<meta property='og:image' content='https://cdn.test/og.jpg'>";

    expect(extractOgImageUrl(html)).toBe('https://cdn.test/og.jpg');
  });

  it('decodifica entidades HTML na URL (&amp; → &)', () => {
    const html =
      '<meta property="og:image" content="https://cdn.test/og.jpg?a=1&amp;b=2">';

    expect(extractOgImageUrl(html)).toBe('https://cdn.test/og.jpg?a=1&b=2');
  });

  it('ignora content vazio e usa a próxima chave válida', () => {
    const html = [
      '<meta property="og:image" content="   ">',
      '<meta name="twitter:image" content="https://cdn.test/tw.jpg">',
    ].join('');

    expect(extractOgImageUrl(html)).toBe('https://cdn.test/tw.jpg');
  });

  it('retorna null quando não há meta de imagem', () => {
    expect(
      extractOgImageUrl('<meta property="og:title" content="Olá">'),
    ).toBeNull();
    expect(extractOgImageUrl('')).toBeNull();
    expect(extractOgImageUrl('<html><body>nada</body></html>')).toBeNull();
  });
});
