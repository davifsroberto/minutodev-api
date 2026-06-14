import { isIP } from 'node:net';

/**
 * Validações de URL para mitigar SSRF ao buscar páginas externas (Sprint 5D-3):
 * só `http(s)`, sem credenciais embutidas, sem hosts locais/sem ponto e sem IPs
 * em faixas privadas/reservadas. A resolução de DNS (host → IP) e a validação
 * do IP efetivamente conectado ficam no serviço (`safeLookup`); aqui ficam as
 * checagens síncronas de forma da URL e a classificação de um IP.
 */

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

// CIDRs IPv4 privados/reservados que não devem ser alvo de fetch.
const PRIVATE_V4_CIDRS: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (inclui o metadata 169.254.169.254)
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reservado
];

/** Faz o parse de uma URL e a aceita só se for `http(s)` para um host público. */
export function parseSafeHttpUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return null;
  // credenciais embutidas (user:pass@host) são um vetor clássico de abuso
  if (url.username || url.password) return null;
  if (!isAllowedHostname(url.hostname.toLowerCase())) return null;

  return url;
}

function isAllowedHostname(host: string): boolean {
  if (!host) return false;

  // URL.hostname devolve literais IPv6 entre colchetes: `[::1]` → `::1`.
  const bare =
    host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;

  if (bare === 'localhost' || bare.endsWith('.localhost')) return false;
  if (
    bare.endsWith('.local') ||
    bare.endsWith('.internal') ||
    bare.endsWith('.lan')
  ) {
    return false;
  }

  const version = isIP(bare);
  if (version !== 0) return !isPrivateIp(bare, version);

  // Hostnames públicos têm ao menos um ponto — bloqueia nomes de intranet
  // (`router`, `intranet`) que poderiam resolver para a rede interna.
  return bare.includes('.');
}

export function isPrivateIp(ip: string, version: number = isIP(ip)): boolean {
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) return isPrivateIpv6(ip);

  return true; // não é um IP reconhecível → trate como inseguro
}

function isPrivateIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  if (value === null) return true;

  return PRIVATE_V4_CIDRS.some(([base, bits]) => {
    const baseInt = ipv4ToInt(base);
    if (baseInt === null) return false;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;

    return (value & mask) === (baseInt & mask);
  });
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;

  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    result = (result << 8) | octet;
  }

  return result >>> 0;
}

/**
 * Classifica um IPv6 convertendo-o para bytes (sem matching textual, que deixava
 * passar formas expandidas, `::ffff:` em hex, NAT64 e 6to4). Cobre loopback,
 * unspecified, ULA (fc00::/7), link-local (fe80::/10), multicast (ff00::/8) e os
 * IPv4 embutidos (mapeado, NAT64 64:ff9b::/96, 6to4 2002::/16).
 */
function isPrivateIpv6(ip: string): boolean {
  const bytes = ipv6ToBytes(ip);
  if (!bytes) return true;

  const isZeroRange = (from: number, to: number): boolean =>
    bytes.slice(from, to).every((byte) => byte === 0);
  const embeddedV4 = (from: number): boolean =>
    isPrivateIpv4(bytes.slice(from, from + 4).join('.'));

  // ::1 (loopback) e :: (unspecified)
  if (isZeroRange(0, 15) && (bytes[15] === 0 || bytes[15] === 1)) return true;
  if ((bytes[0] & 0xfe) === 0xfc) return true; // fc00::/7 (ULA)
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true; // fe80::/10
  if (bytes[0] === 0xff) return true; // ff00::/8 (multicast)

  // ::ffff:0:0/96 (IPv4 mapeado)
  if (isZeroRange(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) {
    return embeddedV4(12);
  }
  // 64:ff9b::/96 (NAT64)
  if (
    bytes[0] === 0x00 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b &&
    isZeroRange(4, 12)
  ) {
    return embeddedV4(12);
  }
  // 2002::/16 (6to4): IPv4 nos 32 bits seguintes
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return embeddedV4(2);

  return false;
}

/** Converte um IPv6 (com `::` e/ou IPv4 embutido) em 16 bytes; null se inválido. */
function ipv6ToBytes(ip: string): number[] | null {
  let text = ip.toLowerCase();

  const zone = text.indexOf('%'); // remove zona: fe80::1%eth0
  if (zone !== -1) text = text.slice(0, zone);

  // IPv4 embutido no sufixo (ex.: ::ffff:127.0.0.1) → dois grupos hex
  const embedded = text.match(/^(.*:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (embedded) {
    const v4 = ipv4ToInt(embedded[2]);
    if (v4 === null) return null;
    const high = ((v4 >>> 16) & 0xffff).toString(16);
    const low = (v4 & 0xffff).toString(16);
    text = `${embedded[1]}${high}:${low}`;
  }

  const parts = text.split('::');
  if (parts.length > 2) return null;

  const head = parts[0] === '' ? [] : parts[0].split(':');
  const tail =
    parts.length === 2 ? (parts[1] === '' ? [] : parts[1].split(':')) : null;

  let groups: string[];
  if (tail === null) {
    groups = head;
  } else {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null; // `::` precisa comprimir ao menos um grupo
    groups = [...head, ...Array<string>(missing).fill('0'), ...tail];
  }
  if (groups.length !== 8) return null;

  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    const value = parseInt(group, 16);
    bytes.push((value >>> 8) & 0xff, value & 0xff);
  }

  return bytes;
}
