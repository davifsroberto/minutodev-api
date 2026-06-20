import { AUTH_COOKIE_NAME, loadAuthConfig } from './auth.config';

describe('loadAuthConfig', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('usa o JWT_SECRET do ambiente quando presente', () => {
    process.env.JWT_SECRET = 'segredo-do-env';

    expect(loadAuthConfig().jwt.secret).toBe('segredo-do-env');
  });

  it('lança em produção quando JWT_SECRET está ausente', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;

    expect(() => loadAuthConfig()).toThrow(/JWT_SECRET/);
  });

  it('gera um segredo aleatório por chamada em dev (nunca um valor fixo)', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.JWT_SECRET;

    const first = loadAuthConfig().jwt.secret;
    const second = loadAuthConfig().jwt.secret;

    expect(first.length).toBeGreaterThanOrEqual(32);
    expect(first).not.toBe(second);
  });

  it('COOKIE_SECURE=true torna o cookie seguro e SameSite=None', () => {
    process.env.JWT_SECRET = 'x';
    process.env.COOKIE_SECURE = 'true';

    const cookie = loadAuthConfig().cookie;
    expect(cookie.secure).toBe(true);
    expect(cookie.sameSite).toBe('none');
  });

  it('em dev sem override o cookie é inseguro e SameSite=Lax', () => {
    process.env.JWT_SECRET = 'x';
    process.env.NODE_ENV = 'development';
    delete process.env.COOKIE_SECURE;

    const cookie = loadAuthConfig().cookie;
    expect(cookie.secure).toBe(false);
    expect(cookie.sameSite).toBe('lax');
    expect(cookie.name).toBe(AUTH_COOKIE_NAME);
  });

  it('redirect malformado cai no fallback seguro', () => {
    process.env.JWT_SECRET = 'x';
    process.env.AUTH_SUCCESS_REDIRECT = 'isto-nao-e-uma-url';

    expect(loadAuthConfig().redirect.success).toBe('http://localhost:4500/app');
  });
});
