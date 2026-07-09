import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { PrismaService } from '../../prisma/prisma.service';
import { CryptoService } from '../../common/services/crypto.service';

/**
 * Sincronización con Google Calendar (OAuth2, bidireccional saliente).
 * Cada turno confirmado se pushea a todas las cuentas conectadas del médico.
 * Los tokens OAuth se guardan CIFRADOS (nunca en texto plano).
 * Los fallos de sync NUNCA bloquean el flujo de turnos: son best-effort
 * con log; a futuro, mover a cola BullMQ con reintentos.
 */
@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name);

  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
  ) {}

  getOAuthClient() {
    return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
  }

  getAuthUrl(doctorId: string): string {
    return this.getOAuthClient().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/calendar.events'],
      state: doctorId,
    });
  }

  async handleOAuthCallback(code: string, doctorId: string) {
    const client = this.getOAuthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data: userInfo } = await oauth2.userinfo.get();

    await this.prisma.calendarAccount.upsert({
      where: {
        doctorId_provider_externalEmail: {
          doctorId,
          provider: 'google',
          externalEmail: userInfo.email!,
        },
      },
      create: {
        doctorId,
        provider: 'google',
        externalEmail: userInfo.email!,
        accessTokenEnc: this.crypto.encrypt(tokens.access_token!),
        refreshTokenEnc: this.crypto.encrypt(tokens.refresh_token!),
        tokenExpiresAt: new Date(tokens.expiry_date!),
      },
      update: {
        accessTokenEnc: this.crypto.encrypt(tokens.access_token!),
        refreshTokenEnc: tokens.refresh_token
          ? this.crypto.encrypt(tokens.refresh_token)
          : undefined,
        tokenExpiresAt: new Date(tokens.expiry_date!),
      },
    });
  }

  async pushAppointment(appointmentId: string) {
    const appt = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        doctor: { include: { calendarAccounts: true } },
      },
    });
    if (!appt) return;

    for (const account of appt.doctor.calendarAccounts) {
      try {
        const calendar = await this.calendarClient(account);
        const { data } = await calendar.events.insert({
          calendarId: account.calendarId,
          requestBody: {
            summary: `Turno: ${appt.patient.firstName} ${appt.patient.lastName}`,
            description: appt.reason ?? undefined,
            start: { dateTime: appt.startAt.toISOString() },
            end: { dateTime: appt.endAt.toISOString() },
          },
        });
        await this.prisma.calendarEvent.upsert({
          where: { appointmentId_accountId: { appointmentId: appt.id, accountId: account.id } },
          create: { appointmentId: appt.id, accountId: account.id, externalEventId: data.id! },
          update: { externalEventId: data.id! },
        });
      } catch (e) {
        this.logger.warn(`Sync Google falló para cuenta ${account.id}: ${e}`);
      }
    }
  }

  async removeAppointment(appointmentId: string) {
    const events = await this.prisma.calendarEvent.findMany({
      where: { appointmentId },
      include: { account: true },
    });
    for (const ev of events) {
      try {
        const calendar = await this.calendarClient(ev.account);
        await calendar.events.delete({
          calendarId: ev.account.calendarId,
          eventId: ev.externalEventId,
        });
        await this.prisma.calendarEvent.delete({ where: { id: ev.id } });
      } catch (e) {
        this.logger.warn(`Borrado en Google falló para evento ${ev.id}: ${e}`);
      }
    }
  }

  private async calendarClient(account: {
    accessTokenEnc: string;
    refreshTokenEnc: string;
  }) {
    const client = this.getOAuthClient();
    client.setCredentials({
      access_token: this.crypto.decrypt(account.accessTokenEnc),
      refresh_token: this.crypto.decrypt(account.refreshTokenEnc),
    });
    return google.calendar({ version: 'v3', auth: client });
  }
}
