import { UnauthorizedException } from '@nestjs/common';

import { AuthProvider, User } from '@prisma/client';

import { Profile } from 'passport-google-oauth20';

import { AuthConfig } from '../auth.config';
import { AuthService } from '../auth.service';
import { GoogleStrategy } from './google.strategy';

const config = {
  google: {
    clientId: 'client-id',
    clientSecret: 'client-secret',
    callbackUrl: 'http://localhost:3500/auth/google/callback',
  },
  cookie: { secure: false, sameSite: 'lax' as const, domain: undefined },
} as unknown as AuthConfig;

const user: User = {
  id: 'user-1',
  email: 'ana@example.com',
  name: 'Ana',
  avatarUrl: 'https://cdn.example.test/ana.png',
  provider: AuthProvider.GOOGLE,
  providerId: 'google-sub-123',
  createdAt: new Date('2026-06-19T00:00:00.000Z'),
  updatedAt: new Date('2026-06-19T00:00:00.000Z'),
};

const makeProfile = (overrides: Partial<Profile> = {}): Profile =>
  ({
    id: 'google-sub-123',
    displayName: 'Ana',
    emails: [{ value: 'ana@example.com', verified: 'true' }],
    photos: [{ value: 'https://cdn.example.test/ana.png' }],
    _json: { email_verified: true },
    ...overrides,
  }) as unknown as Profile;

describe('GoogleStrategy', () => {
  let authService: { validateOAuthLogin: jest.Mock };
  let strategy: GoogleStrategy;

  beforeEach(() => {
    authService = { validateOAuthLogin: jest.fn().mockResolvedValue(user) };
    strategy = new GoogleStrategy(
      config,
      authService as unknown as AuthService,
    );
  });

  it('normaliza o perfil do Google e delega o upsert', async () => {
    await expect(strategy.validate('at', 'rt', makeProfile())).resolves.toBe(
      user,
    );

    expect(authService.validateOAuthLogin).toHaveBeenCalledWith({
      provider: AuthProvider.GOOGLE,
      providerId: 'google-sub-123',
      email: 'ana@example.com',
      name: 'Ana',
      avatarUrl: 'https://cdn.example.test/ana.png',
    });
  });

  it('usa null quando não há foto de perfil', async () => {
    await strategy.validate('at', 'rt', makeProfile({ photos: undefined }));

    expect(authService.validateOAuthLogin).toHaveBeenCalledWith(
      expect.objectContaining({ avatarUrl: null }),
    );
  });

  it('rejeita quando o Google não retorna e-mail', async () => {
    await expect(
      strategy.validate('at', 'rt', makeProfile({ emails: [] })),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(authService.validateOAuthLogin).not.toHaveBeenCalled();
  });

  it('rejeita quando o e-mail não é verificado', async () => {
    await expect(
      strategy.validate(
        'at',
        'rt',
        makeProfile({ _json: { email_verified: false } } as Partial<Profile>),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejeita quando email_verified está ausente (undefined)', async () => {
    await expect(
      strategy.validate(
        'at',
        'rt',
        makeProfile({ _json: {} } as Partial<Profile>),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(authService.validateOAuthLogin).not.toHaveBeenCalled();
  });
});
