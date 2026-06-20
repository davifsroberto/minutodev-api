import { Module } from '@nestjs/common';

import { AUTH_CONFIG, loadAuthConfig } from './auth.config';

/**
 * Provê a configuração de autenticação resolvida (`AUTH_CONFIG`) como um
 * singleton. Em módulo próprio para que tanto o `AuthModule` quanto o
 * `JwtModule.registerAsync` possam injetá-la a partir de uma única fonte.
 */
@Module({
  providers: [{ provide: AUTH_CONFIG, useFactory: loadAuthConfig }],
  exports: [AUTH_CONFIG],
})
export class AuthConfigModule {}
