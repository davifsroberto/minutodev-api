import { Injectable, Logger } from '@nestjs/common';

import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { type Readable } from 'node:stream';

import { extractOgImageUrl } from './og-image.util';
import { isPrivateIp, parseSafeHttpUrl } from './url-safety.util';

export const REQUEST_TIMEOUT_MS = 6_000;
export const MAX_REDIRECTS = 3;
export const MAX_BYTES = 512 * 1024;
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const USER_AGENT = 'minutoDev-bot/1.0 (+https://minutodev.com)';

type CacheEntry = { value: string | null; expiresAt: number };

type FetchResult =
  | { kind: 'ok'; html: string }
  | { kind: 'redirect'; location: string }
  | { kind: 'stop' };

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * `lookup` para `http(s).request`: resolve o host e só deixa passar **IPs já
 * validados** — o mesmo conjunto usado para conectar. Fecha o gap de DNS
 * rebinding (TOCTOU): não há uma segunda resolução, independente, na conexão.
 *
 * Honra o modo `all` que o `autoSelectFamily` (padrão no Node ≥20) usa: devolve
 * o array dos IPs seguros (mantendo o happy-eyeballs entre eles); no modo single
 * prefere IPv4. Exportada para ser testada isoladamente.
 */
export function safeLookup(
  hostname: string,
  options: unknown,
  callback: LookupCallback,
): void {
  const wantsAll =
    typeof options === 'object' && options !== null && 'all' in options
      ? Boolean((options as { all?: unknown }).all)
      : false;

  dnsLookup(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(error, wantsAll ? [] : '', 0);

    const safe = addresses.filter((a) => !isPrivateIp(a.address, a.family));
    if (!safe.length) {
      const blocked: NodeJS.ErrnoException = new Error(
        `Host ${hostname} resolveu para um IP não permitido`,
      );
      blocked.code = 'ESSRFBLOCKED';

      return callback(blocked, wantsAll ? [] : '', 0);
    }

    if (wantsAll) return callback(null, safe);

    // modo single: prefere IPv4 (conectividade mais comum)
    const chosen = safe.find((a) => a.family === 4) ?? safe[0];
    callback(null, chosen.address, chosen.family);
  });
}

/** Lê um stream em texto, cortando em `maxBytes` (evita baixar páginas enormes). */
export function readStreamCapped(
  stream: Readable,
  maxBytes: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const finish = (): void => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    };

    stream.on('data', (chunk: Buffer) => {
      if (settled) return;
      const remaining = maxBytes - total;
      if (chunk.length >= remaining) {
        chunks.push(chunk.subarray(0, remaining));
        total = maxBytes;
        finish();
        stream.destroy();

        return;
      }
      chunks.push(chunk);
      total += chunk.length;
    });

    stream.on('end', finish);
    stream.on('close', finish);
    stream.on('error', (error) => {
      if (settled) return; // erro após cortar no teto: já temos o suficiente
      settled = true;
      reject(error);
    });
  });
}

/**
 * Resolve a imagem de capa (`og:image`/`twitter:image`) da página de um artigo.
 *
 * Fallback de imagem da Sprint 5D-3: só é chamado quando o RSS não trouxe
 * imagem. **Nunca lança** — qualquer falha (bloqueio anti-bot, paywall, timeout,
 * host inseguro) vira `null` e o chamador segue para o próximo fallback. Defesas:
 * só `http(s)` para host público, IP validado e **pinado** na conexão (anti-SSRF
 * com guarda de rebinding), timeout curto, teto de bytes, limite de redirects
 * (cada salto revalidado) e cache em memória. Desligável com `OG_IMAGE_ENABLED=false`.
 */
@Injectable()
export class OpenGraphImageService {
  private readonly logger = new Logger(OpenGraphImageService.name);
  private readonly cache = new Map<string, CacheEntry>();

  async resolveImageUrl(articleUrl: string): Promise<string | null> {
    if (!this.isEnabled()) return null;

    const cached = this.readCache(articleUrl);
    if (cached !== undefined) return cached;

    const value = await this.resolve(articleUrl);
    this.writeCache(articleUrl, value);

    return value;
  }

  private async resolve(articleUrl: string): Promise<string | null> {
    try {
      const page = await this.fetchHtml(articleUrl);
      if (!page) return null;

      const raw = extractOgImageUrl(page.html);
      if (!raw) return null;

      return this.toAbsoluteImageUrl(raw, page.finalUrl);
    } catch (error) {
      this.logger.warn(
        `Falha ao resolver og:image de ${this.label(articleUrl)}: ${this.describe(error)}`,
      );

      return null;
    }
  }

  private async fetchHtml(
    startUrl: string,
  ): Promise<{ html: string; finalUrl: string } | null> {
    // Um único deadline para toda a cadeia de redirects: limita a latência total.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      let current = startUrl;

      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const target = parseSafeHttpUrl(current);
        if (!target) return null;

        const result = await this.fetchOnce(target, controller.signal);

        if (result.kind === 'stop') return null;
        if (result.kind === 'ok') {
          return { html: result.html, finalUrl: target.toString() };
        }

        current = new URL(result.location, target).toString();
      }

      return null; // redirects em excesso
    } finally {
      clearTimeout(timer);
    }
  }

  /** Uma requisição GET com IP validado/pinado; nunca rejeita (vira `stop`). */
  private fetchOnce(target: URL, signal: AbortSignal): Promise<FetchResult> {
    const requester = target.protocol === 'https:' ? httpsRequest : httpRequest;
    const options: RequestOptions = {
      method: 'GET',
      signal,
      lookup: safeLookup as RequestOptions['lookup'],
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
    };

    return new Promise<FetchResult>((resolve) => {
      const req = requester(target, options, (res) => {
        const status = res.statusCode ?? 0;

        if (REDIRECT_STATUSES.has(status)) {
          res.resume(); // descarta o corpo do redirect
          const location = res.headers.location;
          resolve(location ? { kind: 'redirect', location } : { kind: 'stop' });

          return;
        }

        if (status < 200 || status >= 300) {
          res.resume();
          resolve({ kind: 'stop' });

          return;
        }

        const contentType = res.headers['content-type'] ?? '';
        if (contentType && !/html|xml/i.test(contentType)) {
          res.resume();
          resolve({ kind: 'stop' });

          return;
        }

        readStreamCapped(res, MAX_BYTES)
          .then((html) => resolve({ kind: 'ok', html }))
          .catch(() => resolve({ kind: 'stop' }));
      });

      req.on('error', () => resolve({ kind: 'stop' }));
      req.end();
    });
  }

  private toAbsoluteImageUrl(rawImage: string, baseUrl: string): string | null {
    let absolute: URL;
    try {
      absolute = new URL(rawImage, baseUrl);
    } catch {
      return null;
    }

    if (absolute.protocol !== 'http:' && absolute.protocol !== 'https:') {
      return null;
    }

    return absolute.toString();
  }

  private isEnabled(): boolean {
    return process.env.OG_IMAGE_ENABLED?.trim().toLowerCase() !== 'false';
  }

  private readCache(key: string): string | null | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);

      return undefined;
    }

    return entry.value;
  }

  private writeCache(key: string, value: string | null): void {
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }

    this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  /** Loga só origin + path (sem query) para manter o log enxuto. */
  private label(rawUrl: string): string {
    try {
      const url = new URL(rawUrl);

      return `${url.origin}${url.pathname}`;
    } catch {
      return 'url inválida';
    }
  }

  private describe(error: unknown): string {
    return error instanceof Error ? error.message : 'erro desconhecido';
  }
}
