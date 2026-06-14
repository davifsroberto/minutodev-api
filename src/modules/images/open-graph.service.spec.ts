import { lookup } from 'node:dns';
import { Readable } from 'node:stream';

import {
  MAX_BYTES,
  MAX_REDIRECTS,
  OpenGraphImageService,
  readStreamCapped,
  safeLookup,
} from './open-graph.service';

jest.mock('node:dns', () => ({ lookup: jest.fn() }));

const dnsMock = lookup as unknown as jest.Mock;

const ogHtml = (image: string): string =>
  `<html><head><meta property="og:image" content="${image}"></head></html>`;

type FetchResult =
  | { kind: 'ok'; html: string }
  | { kind: 'redirect'; location: string }
  | { kind: 'stop' };

describe('OpenGraphImageService', () => {
  let service: OpenGraphImageService;
  let fetchOnce: jest.SpyInstance;
  let originalFlag: string | undefined;

  // Espiona a requisição de rede (fetchOnce) para não tocar em sockets reais.
  const stubFetch = (...results: FetchResult[]): void => {
    fetchOnce = jest.spyOn(
      service as unknown as { fetchOnce: () => Promise<FetchResult> },
      'fetchOnce',
    );
    for (const result of results) fetchOnce.mockResolvedValueOnce(result);
    if (results.length === 1) fetchOnce.mockResolvedValue(results[0]);
  };

  beforeEach(() => {
    service = new OpenGraphImageService();
    originalFlag = process.env.OG_IMAGE_ENABLED;
    delete process.env.OG_IMAGE_ENABLED;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalFlag === undefined) delete process.env.OG_IMAGE_ENABLED;
    else process.env.OG_IMAGE_ENABLED = originalFlag;
  });

  describe('resolveImageUrl', () => {
    it('resolve a og:image de uma página', async () => {
      stubFetch({ kind: 'ok', html: ogHtml('https://cdn.test/og.jpg') });

      await expect(
        service.resolveImageUrl('https://example.com/artigo'),
      ).resolves.toBe('https://cdn.test/og.jpg');
    });

    it('resolve URL de imagem relativa contra a página final', async () => {
      stubFetch({ kind: 'ok', html: ogHtml('/static/capa.png') });

      await expect(
        service.resolveImageUrl('https://example.com/blog/artigo'),
      ).resolves.toBe('https://example.com/static/capa.png');
    });

    it('está desligado quando OG_IMAGE_ENABLED=false (não bate na rede)', async () => {
      process.env.OG_IMAGE_ENABLED = 'false';
      stubFetch({ kind: 'ok', html: ogHtml('https://cdn.test/og.jpg') });

      await expect(
        service.resolveImageUrl('https://example.com/artigo'),
      ).resolves.toBeNull();
      expect(fetchOnce).not.toHaveBeenCalled();
    });

    it('rejeita host inseguro sem nem chegar à requisição', async () => {
      stubFetch({ kind: 'ok', html: ogHtml('https://cdn.test/og.jpg') });

      await expect(
        service.resolveImageUrl('http://localhost/a'),
      ).resolves.toBeNull();
      expect(fetchOnce).not.toHaveBeenCalled();
    });

    it('retorna null para resposta não-ok (403, paywall, anti-bot)', async () => {
      stubFetch({ kind: 'stop' });

      await expect(
        service.resolveImageUrl('https://example.com/artigo'),
      ).resolves.toBeNull();
    });

    it('segue redirect e extrai da página final', async () => {
      stubFetch(
        { kind: 'redirect', location: 'https://example.com/final' },
        { kind: 'ok', html: ogHtml('https://cdn.test/final.jpg') },
      );

      await expect(
        service.resolveImageUrl('https://example.com/inicio'),
      ).resolves.toBe('https://cdn.test/final.jpg');
      expect(fetchOnce).toHaveBeenCalledTimes(2);
    });

    it('bloqueia redirect para um host inseguro (revalida cada salto)', async () => {
      stubFetch({ kind: 'redirect', location: 'http://127.0.0.1/interno' });

      await expect(
        service.resolveImageUrl('https://example.com/inicio'),
      ).resolves.toBeNull();
      // só a 1ª requisição roda; o destino do redirect é barrado antes de buscar
      expect(fetchOnce).toHaveBeenCalledTimes(1);
    });

    it('para após o limite de redirects', async () => {
      stubFetch({ kind: 'redirect', location: 'https://example.com/loop' });

      await expect(
        service.resolveImageUrl('https://example.com/inicio'),
      ).resolves.toBeNull();
      expect(fetchOnce).toHaveBeenCalledTimes(MAX_REDIRECTS + 1);
    });

    it('nunca lança: erro na requisição vira null', async () => {
      fetchOnce = jest
        .spyOn(
          service as unknown as { fetchOnce: () => Promise<FetchResult> },
          'fetchOnce',
        )
        .mockRejectedValue(new Error('ECONNRESET'));

      await expect(
        service.resolveImageUrl('https://example.com/artigo'),
      ).resolves.toBeNull();
    });

    describe('cache', () => {
      it('cacheia o resultado positivo (não refaz a busca)', async () => {
        stubFetch({ kind: 'ok', html: ogHtml('https://cdn.test/og.jpg') });
        const url = 'https://example.com/artigo';

        await service.resolveImageUrl(url);
        await service.resolveImageUrl(url);

        expect(fetchOnce).toHaveBeenCalledTimes(1);
      });

      it('cacheia também o resultado negativo (null)', async () => {
        stubFetch({ kind: 'stop' });
        const url = 'https://example.com/sem-og';

        await expect(service.resolveImageUrl(url)).resolves.toBeNull();
        await expect(service.resolveImageUrl(url)).resolves.toBeNull();

        expect(fetchOnce).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('safeLookup (guarda anti-SSRF/rebinding)', () => {
    const runAll = (
      host: string,
    ): Promise<{ error: unknown; addresses: unknown }> =>
      new Promise((resolve) =>
        safeLookup(host, { all: true }, (error, addresses) =>
          resolve({ error, addresses }),
        ),
      );
    const runSingle = (
      host: string,
    ): Promise<{ error: unknown; address: unknown; family: unknown }> =>
      new Promise((resolve) =>
        safeLookup(host, {}, (error, address, family) =>
          resolve({ error, address, family }),
        ),
      );

    it('modo all: devolve só os IPs validados (happy-eyeballs entre seguros)', async () => {
      dnsMock.mockImplementation((_h, _o, cb) =>
        cb(null, [
          { address: '93.184.216.34', family: 4 },
          { address: '169.254.0.1', family: 4 }, // privado → filtrado
        ]),
      );

      const result = await runAll('example.com');

      expect(result.error).toBeNull();
      expect(result.addresses).toEqual([
        { address: '93.184.216.34', family: 4 },
      ]);
    });

    it('modo single: prefere IPv4 público', async () => {
      dnsMock.mockImplementation((_h, _o, cb) =>
        cb(null, [
          { address: '2606:4700::1', family: 6 },
          { address: '93.184.216.34', family: 4 },
        ]),
      );

      const result = await runSingle('example.com');

      expect(result.error).toBeNull();
      expect(result.address).toBe('93.184.216.34');
    });

    it('bloqueia host que resolve só para IP privado (rebinding)', async () => {
      dnsMock.mockImplementation((_h, _o, cb) =>
        cb(null, [{ address: '169.254.169.254', family: 4 }]),
      );

      const result = await runAll('metadata.example.com');

      expect(result.error).toBeTruthy();
      expect(result.addresses).toEqual([]);
    });

    it('propaga erro de DNS', async () => {
      dnsMock.mockImplementation((_h, _o, cb) =>
        cb(new Error('ENOTFOUND'), []),
      );

      const result = await runSingle('inexistente.example.com');

      expect(result.error).toBeTruthy();
    });
  });

  describe('readStreamCapped', () => {
    it('corta o corpo no teto de bytes', async () => {
      const stream = Readable.from([Buffer.from('a'.repeat(MAX_BYTES + 5000))]);

      const text = await readStreamCapped(stream, MAX_BYTES);

      expect(text.length).toBe(MAX_BYTES);
    });

    it('lê o corpo inteiro quando abaixo do teto', async () => {
      const stream = Readable.from([Buffer.from('abc'), Buffer.from('def')]);

      await expect(readStreamCapped(stream, 1024)).resolves.toBe('abcdef');
    });
  });
});
