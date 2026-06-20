import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Dispara o fluxo OAuth do Google: redireciona para o consentimento em
 * `GET /auth/google` e processa o retorno em `GET /auth/google/callback`.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {}
