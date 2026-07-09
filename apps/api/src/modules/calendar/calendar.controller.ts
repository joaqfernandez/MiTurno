import { Controller, ForbiddenException, Get, Header, Param, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { CalendarSyncService } from './calendar-sync.service';
import { IcsService } from './ics.service';

@Controller('calendar')
export class CalendarController {
  constructor(
    private sync: CalendarSyncService,
    private ics: IcsService,
  ) {}

  /** El médico inicia la conexión con Google Calendar. */
  @UseGuards(JwtAuthGuard)
  @Get('google/connect')
  connect(@CurrentUser() user: AuthUser) {
    if (!user.doctorProfileId) throw new ForbiddenException();
    return { url: this.sync.getAuthUrl(user.doctorProfileId) };
  }

  @Get('google/callback')
  async callback(@Query('code') code: string, @Query('state') doctorId: string, @Res() res: Response) {
    await this.sync.handleOAuthCallback(code, doctorId);
    return res.redirect(`${process.env.WEB_URL}/panel/configuracion?calendar=ok`);
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
