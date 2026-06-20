import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Protege rotas exigindo um JWT de sessão válido (lido do cookie httpOnly).
 *
 * Base reutilizável para as futuras rotas autenticadas da V2
 * (`/me/favorites`, `/me/history`, `/me/preferences`). Aplicar com
 * `@UseGuards(JwtAuthGuard)`; o usuário fica disponível via `@CurrentUser()`.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
