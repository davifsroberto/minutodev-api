import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { Request } from 'express';

import { AuthenticatedUser } from '../auth.types';

/**
 * Injeta o usuário autenticado (`req.user`) populado pela JwtStrategy.
 * Use apenas em rotas protegidas por `JwtAuthGuard`.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<Request>();

    return request.user as AuthenticatedUser;
  },
);
