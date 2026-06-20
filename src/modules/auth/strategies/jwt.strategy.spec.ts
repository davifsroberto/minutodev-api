import { UnauthorizedException } from '@nestjs/common';

import { AuthProvider, User } from '@prisma/client';

import { UsersService } from '../../users/users.service';
import { AuthConfig } from '../auth.config';
import { JwtStrategy } from './jwt.strategy';

const config = {
  jwt: { secret: 'test-secret', ttlSeconds: 3600 },
  cookie: { name: 'md_session' },
} as unknown as AuthConfig;

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

describe('JwtStrategy', () => {
  let users: { findById: jest.Mock };
  let strategy: JwtStrategy;

  beforeEach(() => {
    users = { findById: jest.fn() };
    strategy = new JwtStrategy(config, users as unknown as UsersService);
  });

  it('resolve o usuário do payload pelo id', async () => {
    users.findById.mockResolvedValue(user);

    await expect(strategy.validate({ sub: 'user-1' })).resolves.toBe(user);
    expect(users.findById).toHaveBeenCalledWith('user-1');
  });

  it('lança 401 quando o usuário do token não existe mais', async () => {
    users.findById.mockResolvedValue(null);

    await expect(strategy.validate({ sub: 'ghost' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
