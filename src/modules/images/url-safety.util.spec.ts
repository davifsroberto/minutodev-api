import { isPrivateIp, parseSafeHttpUrl } from './url-safety.util';

describe('parseSafeHttpUrl', () => {
  it('aceita URLs http(s) de hosts públicos', () => {
    expect(parseSafeHttpUrl('https://example.com/a')?.hostname).toBe(
      'example.com',
    );
    expect(parseSafeHttpUrl('http://thebaffler.com/x')?.protocol).toBe('http:');
  });

  it('rejeita esquemas que não sejam http(s)', () => {
    expect(parseSafeHttpUrl('ftp://example.com')).toBeNull();
    expect(parseSafeHttpUrl('file:///etc/passwd')).toBeNull();
    expect(parseSafeHttpUrl('data:text/html,<x>')).toBeNull();
    expect(parseSafeHttpUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejeita credenciais embutidas', () => {
    expect(parseSafeHttpUrl('https://user:pass@example.com')).toBeNull();
  });

  it('rejeita hosts locais e sem ponto', () => {
    expect(parseSafeHttpUrl('http://localhost/a')).toBeNull();
    expect(parseSafeHttpUrl('http://intranet/a')).toBeNull();
    expect(parseSafeHttpUrl('http://app.internal/a')).toBeNull();
    expect(parseSafeHttpUrl('http://printer.local/a')).toBeNull();
  });

  it('rejeita IPs literais privados/reservados', () => {
    expect(parseSafeHttpUrl('http://127.0.0.1/a')).toBeNull();
    expect(parseSafeHttpUrl('http://10.0.0.5/a')).toBeNull();
    expect(parseSafeHttpUrl('http://192.168.1.10/a')).toBeNull();
    expect(parseSafeHttpUrl('http://172.16.0.1/a')).toBeNull();
    expect(
      parseSafeHttpUrl('http://169.254.169.254/latest/meta-data'),
    ).toBeNull();
    expect(parseSafeHttpUrl('http://[::1]/a')).toBeNull();
    expect(parseSafeHttpUrl('http://[fe80::1]/a')).toBeNull();
    expect(parseSafeHttpUrl('http://[::ffff:127.0.0.1]/a')).toBeNull();
  });

  it('aceita IP público (IPv4 e IPv6 literal)', () => {
    expect(parseSafeHttpUrl('http://8.8.8.8/a')?.hostname).toBe('8.8.8.8');
    expect(parseSafeHttpUrl('http://[2606:4700:4700::1111]/a')).not.toBeNull();
  });

  it('rejeita string inválida', () => {
    expect(parseSafeHttpUrl('não é url')).toBeNull();
  });
});

describe('isPrivateIp', () => {
  it('detecta faixas privadas IPv4', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('10.1.2.3')).toBe(true);
    expect(isPrivateIp('172.31.255.255')).toBe(true);
    expect(isPrivateIp('169.254.169.254')).toBe(true);
    expect(isPrivateIp('100.64.0.1')).toBe(true);
  });

  it('detecta faixas privadas IPv6', () => {
    expect(isPrivateIp('::1')).toBe(true);
    expect(isPrivateIp('fe80::1')).toBe(true);
    expect(isPrivateIp('fc00::1')).toBe(true);
    expect(isPrivateIp('fd00::1')).toBe(true);
    expect(isPrivateIp('::ffff:127.0.0.1')).toBe(true);
  });

  it('detecta formas IPv6 que escapavam ao matching textual', () => {
    expect(isPrivateIp('0:0:0:0:0:0:0:1')).toBe(true); // loopback expandido
    expect(isPrivateIp('::ffff:7f00:1')).toBe(true); // 127.0.0.1 mapeado em hex
    expect(isPrivateIp('::ffff:a9fe:a9fe')).toBe(true); // 169.254.169.254 (metadata)
    expect(isPrivateIp('64:ff9b::7f00:1')).toBe(true); // NAT64 -> 127.0.0.1
    expect(isPrivateIp('2002:7f00:1::')).toBe(true); // 6to4 -> 127.0.0.1
  });

  it('aceita IPs públicos', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('1.1.1.1')).toBe(false);
    expect(isPrivateIp('2606:4700:4700::1111')).toBe(false);
    expect(isPrivateIp('2002:5db8::')).toBe(false); // 6to4 com IPv4 público
  });

  it('trata IPv6 malformado como inseguro', () => {
    expect(isPrivateIp('::ffff:127.0.0.1::1', 6)).toBe(true);
    expect(isPrivateIp('gggg::1', 6)).toBe(true);
  });

  it('trata entradas não-IP como inseguras', () => {
    expect(isPrivateIp('example.com')).toBe(true);
  });
});
