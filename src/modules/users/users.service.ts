import { Injectable } from '@nestjs/common';

import { AuthProvider, User } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

/** Perfil normalizado vindo do provedor OAuth, pronto para persistência. */
export type OAuthProfile = {
  provider: AuthProvider;
  providerId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cria o usuário no primeiro login e atualiza nome/avatar/e-mail nos
   * seguintes. A identidade externa `(provider, providerId)` é a chave do
   * upsert, tornando o login idempotente mesmo se o e-mail mudar no provedor.
   */
  upsertFromOAuth(profile: OAuthProfile): Promise<User> {
    const { provider, providerId, email, name, avatarUrl } = profile;

    return this.prisma.user.upsert({
      where: { provider_providerId: { provider, providerId } },
      create: { provider, providerId, email, name, avatarUrl },
      update: { email, name, avatarUrl },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
