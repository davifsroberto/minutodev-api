import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { Response } from 'express';

import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthUserDto } from './dto/auth-user.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly authService: AuthService,
  ) {}

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({
    summary: 'Inicia o login com Google (redireciona para o consentimento).',
  })
  googleLogin(): void {
    // O GoogleAuthGuard redireciona para o Google; este corpo nunca executa.
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiExcludeEndpoint()
  googleCallback(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ): void {
    const token = this.authService.createSessionToken(user);

    res.cookie(
      this.config.cookie.name,
      token,
      this.authService.cookieOptions(),
    );
    res.redirect(this.config.redirect.success);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Retorna os dados básicos do usuário autenticado.' })
  @ApiOkResponse({ description: 'Usuário autenticado.', type: AuthUserDto })
  @ApiUnauthorizedResponse({ description: 'Sessão ausente ou inválida.' })
  me(@CurrentUser() user: AuthenticatedUser): AuthUserDto {
    return AuthUserDto.fromUser(user);
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Encerra a sessão limpando o cookie.' })
  @ApiOkResponse({ description: 'Sessão encerrada.' })
  logout(@Res({ passthrough: true }) res: Response): { success: true } {
    res.clearCookie(
      this.config.cookie.name,
      this.authService.clearCookieOptions(),
    );

    return { success: true };
  }
}
