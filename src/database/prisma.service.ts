import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaClient compartilhado pela aplicação.
 *
 * No Prisma 7 a conexão é feita através de um driver adapter (aqui o
 * `@prisma/adapter-pg`), recebendo a connection string via `DATABASE_URL`.
 * O ciclo de vida do client é amarrado ao ciclo de vida do módulo Nest.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
