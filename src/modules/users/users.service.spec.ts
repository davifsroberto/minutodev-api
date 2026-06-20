import { Test, TestingModule } from '@nestjs/testing';

import { AuthProvider, Prisma, User } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { OAuthProfile, UsersService } from './users.service';

type UserDelegateMock = {
  upsert: jest.Mock<Promise<User>, [Prisma.UserUpsertArgs]>;
  findUnique: jest.Mock<Promise<User | null>, [Prisma.UserFindUniqueArgs]>;
};

type PrismaServiceMock = {
  user: UserDelegateMock;
};

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-1',
  email: 'ana@example.com',
  name: 'Ana Desenvolvedora',
  avatarUrl: 'https://cdn.example.test/ana.png',
  provider: AuthProvider.GOOGLE,
  providerId: 'google-sub-123',
  createdAt: new Date('2026-06-19T00:00:00.000Z'),
  updatedAt: new Date('2026-06-19T00:00:00.000Z'),
  ...overrides,
});

const profile: OAuthProfile = {
  provider: AuthProvider.GOOGLE,
  providerId: 'google-sub-123',
  email: 'ana@example.com',
  name: 'Ana Desenvolvedora',
  avatarUrl: 'https://cdn.example.test/ana.png',
};

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaServiceMock;

  beforeEach(async () => {
    prisma = {
      user: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  it('faz upsert pela identidade externa (provider, providerId)', async () => {
    const user = makeUser();
    prisma.user.upsert.mockResolvedValue(user);

    await expect(service.upsertFromOAuth(profile)).resolves.toBe(user);

    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: {
        provider_providerId: {
          provider: AuthProvider.GOOGLE,
          providerId: 'google-sub-123',
        },
      },
      create: {
        provider: AuthProvider.GOOGLE,
        providerId: 'google-sub-123',
        email: 'ana@example.com',
        name: 'Ana Desenvolvedora',
        avatarUrl: 'https://cdn.example.test/ana.png',
      },
      update: {
        email: 'ana@example.com',
        name: 'Ana Desenvolvedora',
        avatarUrl: 'https://cdn.example.test/ana.png',
      },
    });
  });

  it('atualiza nome/avatar/e-mail em logins seguintes sem tocar na identidade', async () => {
    prisma.user.upsert.mockResolvedValue(makeUser({ name: 'Ana D.' }));

    await service.upsertFromOAuth({ ...profile, name: 'Ana D.' });

    const args = prisma.user.upsert.mock.calls[0][0];
    expect(args.update).not.toHaveProperty('provider');
    expect(args.update).not.toHaveProperty('providerId');
  });

  it('reflete mudança de e-mail/avatar no payload de update', async () => {
    prisma.user.upsert.mockResolvedValue(
      makeUser({ email: 'novo@example.com', avatarUrl: null }),
    );

    await service.upsertFromOAuth({
      ...profile,
      email: 'novo@example.com',
      avatarUrl: null,
    });

    const args = prisma.user.upsert.mock.calls[0][0];
    expect(args.update).toEqual({
      email: 'novo@example.com',
      name: 'Ana Desenvolvedora',
      avatarUrl: null,
    });
  });

  it('busca usuário por id', async () => {
    const user = makeUser();
    prisma.user.findUnique.mockResolvedValue(user);

    await expect(service.findById('user-1')).resolves.toBe(user);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
    });
  });
});
