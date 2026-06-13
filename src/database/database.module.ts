import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * Módulo de infraestrutura de banco de dados.
 *
 * É `@Global()` para que o `PrismaService` fique disponível em toda a
 * aplicação sem que cada feature module precise reimportá-lo.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
