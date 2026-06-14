import { resolveRssImageUrl } from './rss-image.util';
import { RssItem } from './rss-parser.service';

const item = (overrides: Partial<RssItem> = {}): RssItem =>
  ({ title: 'x', link: 'https://example.test/a', ...overrides }) as RssItem;

describe('resolveRssImageUrl', () => {
  it('prioriza enclosure (imagem) sobre media, corpo e feed', () => {
    const url = resolveRssImageUrl(
      item({
        enclosure: { url: 'https://cdn.test/enc.jpg', type: 'image/jpeg' },
        mediaContent: [{ $: { url: 'https://cdn.test/media.png' } }],
        content: '<img src="https://cdn.test/body.png">',
      }),
      'https://cdn.test/feed.png',
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

  it('cai para a imagem do feed e, por fim, null', () => {
    expect(resolveRssImageUrl(item({}), 'https://cdn.test/feed.png')).toBe(
      'https://cdn.test/feed.png',
    );
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
