import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { User } from '@prisma/client';

import { CookieOptions } from 'express';

import { OAuthProfile, UsersService } from '../users/users.service';
import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { JwtPayload } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly jwt: JwtService,
    private readonly users: UsersService,
  ) {}

  /** Cria/atualiza o usuário a partir do perfil OAuth validado. */
  validateOAuthLogin(profile: OAuthProfile): Promise<User> {
    return this.users.upsertFromOAuth(profile);
  }

  /** Assina o JWT de sessão para o usuário (payload mínimo: só o id). */
  createSessionToken(user: User): string {
    const payload: JwtPayload = { sub: user.id };

    return this.jwt.sign(payload);
  }

  /** Opções do cookie de sessão (httpOnly + flags de segurança por ambiente). */
  cookieOptions(): CookieOptions {
    const { secure, sameSite, domain, maxAgeMs } = this.config.cookie;

    return {
      httpOnly: true,
      secure,
      sameSite,
      domain,
      path: '/',
      maxAge: maxAgeMs,
    };
  }

  /** Mesmas flags do cookie de sessão, sem maxAge — para `clearCookie`. */
  clearCookieOptions(): CookieOptions {
    const { secure, sameSite, domain } = this.config.cookie;

    return { httpOnly: true, secure, sameSite, domain, path: '/' };
  }
}
