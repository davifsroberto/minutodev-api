import { Request } from 'express';

import { CookieStateStore, STATE_COOKIE_NAME } from './cookie-state.store';

type ResMock = { cookie: jest.Mock; clearCookie: jest.Mock };

const makeReq = (
  cookies: Record<string, string> = {},
): { req: Request; res: ResMock } => {
  const res: ResMock = { cookie: jest.fn(), clearCookie: jest.fn() };

  return { req: { cookies, res } as unknown as Request, res };
};

// passport-oauth2 chama com o argumento `meta` (aridade 3/4).
const meta = {};

describe('CookieStateStore', () => {
  const store = new CookieStateStore({ secure: false, sameSite: 'lax' });

  it('store: gera o state, grava o cookie httpOnly e o devolve', () => {
    const { req, res } = makeReq();
    const callback = jest.fn();

    store.store(req, meta, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    const [err, state] = callback.mock.calls[0] as [Error | null, string];
    expect(err).toBeNull();
    expect(state).toHaveLength(32);
    expect(res.cookie).toHaveBeenCalledWith(
      STATE_COOKIE_NAME,
      state,
      expect.objectContaining({
        httpOnly: true,
        path: '/auth',
        sameSite: 'lax',
        maxAge: expect.any(Number),
      }),
    );
  });

  it('verify: aceita quando o state confere e limpa o cookie', () => {
    const { req, res } = makeReq({ [STATE_COOKIE_NAME]: 'abc123' });
    const callback = jest.fn();

    store.verify(req, 'abc123', meta, callback);

    expect(res.clearCookie).toHaveBeenCalledWith(
      STATE_COOKIE_NAME,
      expect.objectContaining({ httpOnly: true, path: '/auth' }),
    );
    expect(callback).toHaveBeenCalledWith(null, true);
  });

  it('verify: rejeita quando o cookie de state está ausente', () => {
    const { req } = makeReq({});
    const callback = jest.fn();

    store.verify(req, 'abc123', meta, callback);

    expect(callback).toHaveBeenCalledWith(
      null,
      false,
      expect.objectContaining({ message: expect.any(String) }),
    );
  });

  it('verify: rejeita quando o state retornado diverge (CSRF)', () => {
    const { req } = makeReq({ [STATE_COOKIE_NAME]: 'esperado' });
    const callback = jest.fn();

    store.verify(req, 'forjado', meta, callback);

    expect(callback).toHaveBeenCalledWith(
      null,
      false,
      expect.objectContaining({ message: expect.any(String) }),
    );
  });

  it('verify: rejeita quando o state é omitido na volta', () => {
    const { req } = makeReq({ [STATE_COOKIE_NAME]: 'esperado' });
    const callback = jest.fn();

    store.verify(req, undefined as unknown as string, meta, callback);

    expect(callback).toHaveBeenCalledWith(null, false, expect.anything());
  });

  it('store: também funciona quando chamado sem meta (aridade 2)', () => {
    const { req, res } = makeReq();
    const callback = jest.fn();

    store.store(req, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(res.cookie).toHaveBeenCalled();
  });
});
