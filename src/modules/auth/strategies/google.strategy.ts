import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';

import { AuthProvider, User } from '@prisma/client';

import { Profile, Strategy, StrategyOptions } from 'passport-google-oauth20';

import { OAuthProfile } from '../../users/users.service';
import { AUTH_CONFIG, type AuthConfig } from '../auth.config';
import { AuthService } from '../auth.service';
import { CookieStateStore } from '../cookie-state.store';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    @Inject(AUTH_CONFIG) config: AuthConfig,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: config.google.clientId,
      clientSecret: config.google.clientSecret,
      callbackURL: config.google.callbackUrl,
      scope: ['email', 'profile'],
      // Proteção CSRF (state) via cookie httpOnly — sem session store. O cast
      // é necessário porque as sobrecargas de StateStore do passport não casam
      // estruturalmente com uma única assinatura em união (o runtime é correto).
      store: new CookieStateStore({
        secure: config.cookie.secure,
        sameSite: config.cookie.sameSite,
        domain: config.cookie.domain,
      }) as unknown as StrategyOptions['store'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): Promise<User> {
    const email = profile.emails?.[0]?.value;
    const emailVerified = (profile._json as { email_verified?: boolean })
      .email_verified;

    // Exige verificação explícita: `undefined`/ausente é tratado como NÃO
    // verificado (o campo é opcional na resposta do Google).
    if (!email || emailVerified !== true) {
      throw new UnauthorizedException(
        'E-mail do Google ausente ou não verificado.',
      );
    }

    const oauthProfile: OAuthProfile = {
      provider: AuthProvider.GOOGLE,
      providerId: profile.id,
      email,
      name: profile.displayName || email,
      avatarUrl: profile.photos?.[0]?.value ?? null,
    };

    return this.authService.validateOAuthLogin(oauthProfile);
  }
}
