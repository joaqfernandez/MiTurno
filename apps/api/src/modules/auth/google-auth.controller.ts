import { BadRequestException, ConflictException, Controller, ForbiddenException, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { OAuthStateService } from '../oauth/oauth-state.service';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('auth/google')
export class GoogleAuthController {
  constructor(private readonly google: GoogleAuthService, private readonly states: OAuthStateService,
    private readonly auth: AuthService) {}

  @Get('start')
  async start(@Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    const { state, nonce } = await this.states.create('login', res);
    return res.redirect(this.google.getAuthUrl(state, nonce));
  }

  @Get('callback')
  async callback(@Query('code') code: unknown, @Query('state') state: unknown,
    @Query('error') error: unknown, @Req() req: Request, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const stored = await this.states.consume('login', state, req, res);
      if (error || typeof code !== 'string' || !code || !stored.nonce) {
        throw new BadRequestException('Google no autorizó el inicio de sesión.');
      }
      const userId = await this.google.authenticate(code, stored.nonce, stored.subjectId ?? undefined);
      // Entrega de un solo uso por cookie HttpOnly. Nunca enviar JWTs en la URL.
      await this.states.create('session', res, userId);
      return res.redirect(`${process.env.WEB_URL}/auth/google/callback`);
    } catch (err) {
      const reason = err instanceof ConflictException ? 'account' : 'failed';
      return res.redirect(`${process.env.WEB_URL}/login?google=${reason}`);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('link')
  async link(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    const { state, nonce } = await this.states.create('login', res, user.userId);
    return { url: this.google.getAuthUrl(state, nonce) };
  }

  @Post('complete')
  async complete(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    if (!process.env.WEB_URL || req.headers.origin !== new URL(process.env.WEB_URL).origin) {
      throw new ForbiddenException('Origen no permitido.');
    }
    const stored = await this.states.consumeSession(req, res);
    if (!stored.subjectId) throw new BadRequestException('La sesión no es válida.');
    return this.auth.issueTokens(stored.subjectId);
  }
}
