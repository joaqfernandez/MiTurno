import { BadRequestException, Controller, ForbiddenException, Get, Header, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { CalendarSyncService } from './calendar-sync.service';
import { IcsService } from './ics.service';
import { OAuthStateService } from '../oauth/oauth-state.service';

@Controller('calendar')
export class CalendarController {
  constructor(
    private sync: CalendarSyncService,
    private ics: IcsService,
    private states: OAuthStateService,
  ) {}

  /** El médico inicia la conexión con Google Calendar. */
  @UseGuards(JwtAuthGuard)
  @Get('google/connect')
  async connect(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    if (!user.doctorProfileId) throw new ForbiddenException();
    res.setHeader('Cache-Control', 'no-store');
    const { state } = await this.states.create('calendar', res, user.doctorProfileId);
    return { url: this.sync.getAuthUrl(state) };
  }

  @Get('google/callback')
  async callback(@Query('code') code: unknown, @Query('state') state: unknown,
    @Query('error') error: unknown, @Req() req: Request, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const stored = await this.states.consume('calendar', state, req, res);
      if (error || typeof code !== 'string' || !code || !stored.subjectId) {
        throw new BadRequestException('Google no autorizó la conexión.');
      }
      await this.sync.handleOAuthCallback(code, stored.subjectId);
      return res.redirect(`${process.env.WEB_URL}/panel/configuracion?calendar=ok`);
    } catch {
      return res.redirect(`${process.env.WEB_URL}/panel/configuracion?calendar=error`);
    }
  }

  /**
   * Feed .ics público-por-token. Para Apple Calendar / Outlook:
   * webcal://api.tudominio.com/api/calendar/feed/{token}.ics
   */
  @Get('feed/:token.ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  feed(@Param('token') token: string) {
    return this.ics.buildDoctorFeed(token);
  }
}
