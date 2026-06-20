import { CookieOptions, Request } from 'express';
import { randomBytes } from 'node:crypto';

/** Cookie httpOnly de curta duração que carrega o `state` do OAuth. */
export const STATE_COOKIE_NAME = 'md_oauth_state';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutos
// Restrito a /auth: o cookie só precisa existir no início do fluxo e no
// callback (/auth/google e /auth/google/callback).
const STATE_PATH = '/auth';

type StoreCallback = (err: Error | null, state?: string) => void;
type VerifyCallback = (
  err: Error | null,
  ok: boolean,
  state?: { message: string },
) => void;
type Meta = Record<string, unknown>;

type StateCookieFlags = {
  secure: boolean;
  sameSite: 'lax' | 'none';
  domain?: string;
};

/**
 * StateStore stateless do passport-oauth2.
 *
 * Em vez de guardar o `state` do OAuth numa sessão de servidor (express-session),
 * grava-o num cookie httpOnly de curta duração e o valida no callback — defesa
 * contra login-CSRF preservando o design stateless (sessão = JWT em cookie).
 *
 * O passport-oauth2 despacha pela aridade do método: como `store`/`verify`
 * declaram o parâmetro `meta`, ele chama `store(req, meta, cb)` e
 * `verify(req, state, meta, cb)`. As assinaturas em união cobrem ambas as
 * aridades e mantêm a compatibilidade com a interface `StateStore`.
 */
export class CookieStateStore {
  constructor(private readonly flags: StateCookieFlags) {}

  store(
    req: Request,
    metaOrCallback: Meta | StoreCallback,
    maybeCallback?: StoreCallback,
  ): void {
    const callback = (
      typeof metaOrCallback === 'function' ? metaOrCallback : maybeCallback
    ) as StoreCallback;

    const res = req.res;
    if (!res) {
      callback(new Error('CookieStateStore requer o Response na request.'));
      return;
    }

    const state = randomBytes(16).toString('hex');
    res.cookie(STATE_COOKIE_NAME, state, {
      ...this.baseOptions(),
      maxAge: STATE_TTL_MS,
    });
    callback(null, state);
  }

  verify(
    req: Request,
    providedState: string,
    metaOrCallback: Meta | VerifyCallback,
    maybeCallback?: VerifyCallback,
  ): void {
    const callback = (
      typeof metaOrCallback === 'function' ? metaOrCallback : maybeCallback
    ) as VerifyCallback;

    const cookies = req.cookies as Record<string, string> | undefined;
    const expected = cookies?.[STATE_COOKIE_NAME];

    // O state é de uso único: limpa o cookie independentemente do resultado.
    req.res?.clearCookie(STATE_COOKIE_NAME, this.baseOptions());

    if (!expected) {
      callback(null, false, { message: 'OAuth state ausente.' });
      return;
    }

    if (expected !== providedState) {
      callback(null, false, { message: 'OAuth state inválido.' });
      return;
    }

    callback(null, true);
  }

  private baseOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.flags.secure,
      sameSite: this.flags.sameSite,
      domain: this.flags.domain,
      path: STATE_PATH,
    };
  }
}
