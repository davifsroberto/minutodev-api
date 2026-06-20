import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';

import { User } from '@prisma/client';

import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { UsersService } from '../../users/users.service';
import { AUTH_CONFIG, AUTH_COOKIE_NAME, type AuthConfig } from '../auth.config';
import { JwtPayload } from '../auth.types';

// O JWT viaja no cookie httpOnly (nunca no header Authorization), então a
// extração lê o cookie. Depende do cookie-parser estar registrado no boot.
const cookieExtractor = (req: Request): string | null => {
  const cookies = req.cookies as Record<string, string> | undefined;

  return cookies?.[AUTH_COOKIE_NAME] ?? null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @Inject(AUTH_CONFIG) config: AuthConfig,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor]),
      ignoreExpiration: false,
      secretOrKey: config.jwt.secret,
    });
  }

  // Revalida no banco a cada request: se o usuário for removido, a sessão
  // deixa de funcionar mesmo com um JWT ainda válido.
  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.users.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException();
    }

    return user;
  }
}
