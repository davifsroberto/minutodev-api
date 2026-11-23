import { Source, SourceType } from '@prisma/client';

import { RssNormalizerService } from './rss-normalizer.service';
import { RssItem } from './rss-parser.service';

const source: Source = {
  category: 'backend',
  createdAt: new Date('2026-06-14T12:00:00.000Z'),
  enabled: true,
  id: 'source-1',
  name: 'Compiler News',
  type: SourceType.RSS,
  updatedAt: new Date('2026-06-14T12:00:00.000Z'),
  url: 'https://example.test/source',
};

const baseItem = (overrides: Partial<RssItem> = {}): RssItem =>
  ({
    title: 'Um artigo',
    link: 'https://example.test/article',
    content: 'Conteúdo.',
    ...overrides,
  }) as RssItem;

describe('RssNormalizerService', () => {
  let normalizer: RssNormalizerService;

  beforeEach(() => {
    normalizer = new RssNormalizerService();
  });

  it('retorna null quando o item não tem URL (link/guid)', () => {
    const result = normalizer.normalize(
      baseItem({ link: undefined, guid: undefined }),
      source,
    );

    expect(result).toBeNull();
  });

  describe('resolução de imagem', () => {
    it('usa a enclosure quando o type indica imagem', () => {
      const result = normalizer.normalize(
        baseItem({
          enclosure: {
            url: 'https://cdn.example.test/cover.jpg',
            type: 'image/jpeg',
          },
        }),
        source,
      );

      expect(result?.imageUrl).toBe('https://cdn.example.test/cover.jpg');
    });

    it('ignora enclosure que não é imagem (ex.: áudio de podcast)', () => {
      const result = normalizer.normalize(
        baseItem({
          content: 'Sem imagem.',
          enclosure: {
            url: 'https://cdn.example.test/audio.mp3',
            type: 'audio/mpeg',
          },
        }),
        source,
      );

      expect(result?.imageUrl).toBeNull();
    });

    it('usa media:content com medium=image', () => {
      const result = normalizer.normalize(
        baseItem({
          mediaContent: [
            {
              $: { url: 'https://cdn.example.test/media.png', medium: 'image' },
            },
          ],
        }),
        source,
      );

      expect(result?.imageUrl).toBe('https://cdn.example.test/media.png');
    });

    it('usa media:thumbnail quando não há enclosure nem media:content', () => {
      const result = normalizer.normalize(
        baseItem({
          mediaThumbnail: { $: { url: 'https://cdn.example.test/thumb.webp' } },
        }),
        source,
      );

      expect(result?.imageUrl).toBe('https://cdn.example.test/thumb.webp');
    });

    it('extrai a primeira <img> do corpo HTML como fallback', () => {
      const result = normalizer.normalize(
        baseItem({
          content:
            '<p>Texto</p><img src="https://cdn.example.test/body.png" alt="x">',
        }),
        source,
      );

      expect(result?.imageUrl).toBe('https://cdn.example.test/body.png');
    });

    it('NÃO usa a imagem do canal do feed: sem imagem por-artigo, fica null', () => {
      const result = normalizer.normalize(
        baseItem({ content: 'Sem imagem.' }),
        source,
      );

      // A imagem do canal (genérica, igual em todos os posts) não entra mais —
      // o chamador tenta og:image e, por fim, a capa gerada pelo título.
      expect(result?.imageUrl).toBeNull();
    });

    it('retorna null quando não há imagem em lugar nenhum', () => {
      const result = normalizer.normalize(
        baseItem({ content: 'Texto puro, sem imagem.' }),
        source,
      );

      expect(result?.imageUrl).toBeNull();
    });

    it('rejeita data: URIs e protocolos não-http(s)', () => {
      const result = normalizer.normalize(
        baseItem({
          enclosure: { url: 'data:image/png;base64,AAAA', type: 'image/png' },
        }),
        source,
      );

      expect(result?.imageUrl).toBeNull();
    });

    it('prioriza a enclosure sobre media e corpo', () => {
      const result = normalizer.normalize(
        baseItem({
          enclosure: {
            url: 'https://cdn.example.test/enclosure.jpg',
            type: 'image/jpeg',
          },
          mediaContent: [
            {
              $: { url: 'https://cdn.example.test/media.png', medium: 'image' },
            },
          ],
          content: '<img src="https://cdn.example.test/body.png">',
        }),
        source,
      );

      expect(result?.imageUrl).toBe('https://cdn.example.test/enclosure.jpg');
    });
  });
});
