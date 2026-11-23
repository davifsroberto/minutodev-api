import { resolveRssImageUrl } from './rss-image.util';
import { RssItem } from './rss-parser.service';

const item = (overrides: Partial<RssItem> = {}): RssItem =>
  ({ title: 'x', link: 'https://example.test/a', ...overrides }) as RssItem;

describe('resolveRssImageUrl', () => {
  it('prioriza enclosure (imagem) sobre media e corpo', () => {
    const url = resolveRssImageUrl(
      item({
        enclosure: { url: 'https://cdn.test/enc.jpg', type: 'image/jpeg' },
        mediaContent: [{ $: { url: 'https://cdn.test/media.png' } }],
        content: '<img src="https://cdn.test/body.png">',
      }),
    );

    expect(url).toBe('https://cdn.test/enc.jpg');
  });

  it('usa media:content e depois media:thumbnail', () => {
    expect(
      resolveRssImageUrl(
        item({ mediaContent: [{ $: { url: 'https://cdn.test/mc.png' } }] }),
      ),
    ).toBe('https://cdn.test/mc.png');

    expect(
      resolveRssImageUrl(
        item({ mediaThumbnail: { $: { url: 'https://cdn.test/mt.png' } } }),
      ),
    ).toBe('https://cdn.test/mt.png');
  });

  it('extrai a 1ª <img> útil do content:encoded (feeds tipo Medium)', () => {
    const url = resolveRssImageUrl(
      item({
        contentEncoded:
          '<img alt="" src="https://cdn-images-1.medium.com/max/960/1*real.png"/>' +
          '<img src="https://medium.com/_/stat?event=post.clientViewed&postId=abc">',
      }),
    );

    expect(url).toBe('https://cdn-images-1.medium.com/max/960/1*real.png');
  });

  it('lê a chave crua content:encoded (rawData antigo do backfill)', () => {
    const url = resolveRssImageUrl(
      item({ 'content:encoded': '<img src="https://cdn.test/raw.png">' }),
    );

    expect(url).toBe('https://cdn.test/raw.png');
  });

  it('ignora pixels de tracking e pega a próxima <img> real', () => {
    const url = resolveRssImageUrl(
      item({
        content:
          '<img src="https://medium.com/_/stat?event=x"><img src="https://cdn.test/hero.jpg">',
      }),
    );

    expect(url).toBe('https://cdn.test/hero.jpg');
  });

  it('extrai a 1ª <img> do corpo (content)', () => {
    expect(
      resolveRssImageUrl(
        item({ content: '<img src="https://cdn.test/b.png">' }),
      ),
    ).toBe('https://cdn.test/b.png');
  });

  it('avalia summary quando content não é uma string (robustez do backfill)', () => {
    const url = resolveRssImageUrl(
      item({
        content: 123 as unknown as string,
        summary: '<img src="https://cdn.test/s.png">',
      }),
    );

    expect(url).toBe('https://cdn.test/s.png');
  });

  it('retorna null quando não há imagem por-artigo (NÃO usa a imagem do canal)', () => {
    expect(resolveRssImageUrl(item({}))).toBeNull();
  });

  it('rejeita data: URIs e protocolos não-http(s)', () => {
    expect(
      resolveRssImageUrl(
        item({
          enclosure: { url: 'data:image/png;base64,AA', type: 'image/png' },
        }),
      ),
    ).toBeNull();
  });
});
