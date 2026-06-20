import { Logger } from '@nestjs/common';

import { randomBytes } from 'node:crypto';

/** Nome do cookie httpOnly que carrega o JWT de sessão. */
export const AUTH_COOKIE_NAME = 'md_session';

/** Token de injeção para a configuração resolvida de autenticação. */
export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

export type AuthConfig = {
  google: {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
  };
  jwt: {
    secret: string;
    ttlSeconds: number;
  };
  cookie: {
    name: string;
    secure: boolean;
    sameSite: 'lax' | 'none';
    domain?: string;
    maxAgeMs: number;
  };
  redirect: {
    success: string;
    failure: string;
  };
};

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 dias

// Placeholders não-vazios: o boot (e os testes que sobem o AppModule) nunca
// quebra por falta de credencial — a passport-google-oauth20 só exige um
// clientID truthy. Sem credencial real, o login simplesmente falha no Google.
const PLACEHOLDER = 'set-in-env';

const logger = new Logger('AuthConfig');

const resolveTtlSeconds = (): number => {
  const raw = process.env.SESSION_TTL_SECONDS;
  const parsed = raw ? Number(raw) : Number.NaN;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_SECONDS;
};

const resolveCookieSecure = (): boolean => {
  const raw = process.env.COOKIE_SECURE?.trim().toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;

  // Sem override explícito, segue o ambiente: seguro em produção.
  return process.env.NODE_ENV === 'production';
};

// Em produção o JWT_SECRET é obrigatório (boot falha sem ele). Em dev, na
// ausência, gera-se um segredo aleatório por processo — nunca um valor fixo
// conhecido (que permitiria forjar tokens); o efeito colateral é que as
// sessões não sobrevivem a um restart sem JWT_SECRET definido.
const resolveJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret) return secret;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      "JWT_SECRET é obrigatório em produção. Gere com: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"",
    );
  }

  logger.warn(
    'JWT_SECRET ausente — usando um segredo aleatório por processo (sessões não sobrevivem a restart). Defina JWT_SECRET no .env.',
  );

  return randomBytes(48).toString('base64url');
};

// Os redirects vêm de env (config do operador, não de input do usuário). Ainda
// assim validamos que são URLs bem-formadas; uma URL inválida cai no fallback
// seguro com aviso, evitando redirecionamento quebrado após o login.
const resolveRedirect = (raw: string | undefined, fallback: string): string => {
  const value = raw?.trim();
  if (!value) return fallback;

  try {
    new URL(value);
    return value;
  } catch {
    logger.warn(
      `Redirect de autenticação inválido ("${value}"); usando o padrão ${fallback}.`,
    );
    return fallback;
  }
};

export const loadAuthConfig = (): AuthConfig => {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || PLACEHOLDER;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || PLACEHOLDER;

  if (clientId === PLACEHOLDER || clientSecret === PLACEHOLDER) {
    logger.warn(
      'GOOGLE_CLIENT_ID/SECRET ausentes — o login com Google falhará até serem configurados no .env.',
    );
  }

  const jwtSecret = resolveJwtSecret();
  const ttlSeconds = resolveTtlSeconds();
  const secure = resolveCookieSecure();
  const domain = process.env.COOKIE_DOMAIN?.trim() || undefined;

  return {
    google: {
      clientId,
      clientSecret,
      callbackUrl:
        process.env.GOOGLE_CALLBACK_URL?.trim() ||
        'http://localhost:3500/auth/google/callback',
    },
    jwt: {
      secret: jwtSecret,
      ttlSeconds,
    },
    cookie: {
      name: AUTH_COOKIE_NAME,
      secure,
      // SameSite=None exige Secure; só faz sentido quando o cookie é seguro.
      sameSite: secure ? 'none' : 'lax',
      domain,
      maxAgeMs: ttlSeconds * 1000,
    },
    redirect: {
      success: resolveRedirect(
        process.env.AUTH_SUCCESS_REDIRECT,
        'http://localhost:4500/app',
      ),
      failure: resolveRedirect(
        process.env.AUTH_FAILURE_REDIRECT,
        'http://localhost:4500/?auth=error',
      ),
    },
  };
};
