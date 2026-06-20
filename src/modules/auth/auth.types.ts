import { User } from '@prisma/client';

/** Conteúdo mínimo do JWT de sessão — só o id do usuário (sem PII). */
export type JwtPayload = {
  sub: string;
};

/** Usuário anexado à request após a validação do JWT (`req.user`). */
export type AuthenticatedUser = User;
