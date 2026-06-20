import { JwtService } from '@nestjs/jwt';

import { AuthProvider, User } from '@prisma/client';

import { OAuthProfile, UsersService } from '../users/users.service';
import { AuthConfig } from './auth.config';
import { AuthService } from './auth.service';

const config: AuthConfig = {
  google: {
    clientId: 'client-id',
    clientSecret: 'client-secret',
    callbackUrl: 'http://localhost:3500/auth/google/callback',
  },
  jwt: { secret: 'test-secret', ttlSeconds: 3600 },
  cookie: {
    name: 'md_session',
    secure: false,
    sameSite: 'lax',
    domain: undefined,
    maxAgeMs: 3_600_000,
  },
  redirect: {
    success: 'http://localhost:4500/app',
    failure: 'http://localhost:4500/?auth=error',
  },
};

const user: User = {
  id: 'user-1',
  email: 'ana@example.com',
  name: 'Ana',
  avatarUrl: null,
  provider: AuthProvider.GOOGLE,
  providerId: 'google-sub-123',
  createdAt: new Date('2026-06-19T00:00:00.000Z'),
  updatedAt: new Date('2026-06-19T00:00:00.000Z'),
};

describe('AuthService', () => {
  let jwt: { sign: jest.Mock };
  let users: { upsertFromOAuth: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    jwt = { sign: jest.fn().mockReturnValue('signed.jwt.token') };
    users = { upsertFromOAuth: jest.fn().mockResolvedValue(user) };
    service = new AuthService(
      config,
      jwt as unknown as JwtService,
      users as unknown as UsersService,
    );
  });

  it('assina o JWT de sessão apenas com o id do usuário (sem PII)', () => {
    const token = service.createSessionToken(user);

    expect(token).toBe('signed.jwt.token');
    expect(jwt.sign).toHaveBeenCalledWith({ sub: 'user-1' });
  });

  it('monta o cookie de sessão httpOnly com as flags do ambiente', () => {
    expect(service.cookieOptions()).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      domain: undefined,
      path: '/',
      maxAge: 3_600_000,
    });
  });

  it('limpa o cookie com as mesmas flags, sem maxAge', () => {
    const options = service.clearCookieOptions();

    expect(options).toEqual({
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      domain: undefined,
      path: '/',
    });
    expect(options).not.toHaveProperty('maxAge');
  });

  it('delega a validação do login OAuth para o UsersService', async () => {
    const profile: OAuthProfile = {
      provider: AuthProvider.GOOGLE,
      providerId: 'google-sub-123',
      email: 'ana@example.com',
      name: 'Ana',
      avatarUrl: null,
    };

    await expect(service.validateOAuthLogin(profile)).resolves.toBe(user);
    expect(users.upsertFromOAuth).toHaveBeenCalledWith(profile);
  });
});
