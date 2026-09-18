import { ConflictException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { google } from 'googleapis';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class GoogleAuthService {
  constructor(private readonly prisma: PrismaService) {}

  private client() {
    const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_LOGIN_REDIRECT_URI } = process.env;
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_LOGIN_REDIRECT_URI) {
      throw new ServiceUnavailableException('El inicio de sesión con Google no está configurado.');
    }
    return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_LOGIN_REDIRECT_URI);
  }

  getAuthUrl(state: string, nonce: string) {
    return this.client().generateAuthUrl({
      scope: ['openid', 'email', 'profile'], state, nonce, prompt: 'select_account',
    });
  }

  async authenticate(code: string, nonce: string, linkUserId?: string) {
    const client = this.client();
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) throw new UnauthorizedException('Google no devolvió una identidad.');
    // La biblioteca verifica firma, emisor, audiencia y vencimiento.
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email || !payload.email_verified ||
        (payload as typeof payload & { nonce?: string }).nonce !== nonce) {
      throw new UnauthorizedException('La identidad de Google no es válida.');
    }
    const email = payload.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { googleSubject: payload.sub } });
    if (user) {
      if (user.status === 'SUSPENDED') throw new UnauthorizedException('La cuenta está suspendida.');
      if (linkUserId && user.id !== linkUserId) throw new ConflictException('Google ya está vinculado a otra cuenta.');
      return user.id;
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
      if (existing) {
        // No vincular solo por email: una cuenta local puede no haberlo verificado.
        // El usuario debe demostrar acceso a su cuenta local antes de asociar Google.
        if (existing.status === 'SUSPENDED' || existing.googleSubject || existing.id !== linkUserId) {
          throw new ConflictException('Ingresá con email y contraseña para esta cuenta.');
        }
        const linked = await tx.user.updateMany({
          where: { id: existing.id, googleSubject: null, status: { not: 'SUSPENDED' } },
          data: { googleSubject: payload.sub },
        });
        if (linked.count !== 1) throw new ConflictException('Volvé a iniciar sesión.');
        return existing.id;
      }
      if (linkUserId) throw new ConflictException('Elegí la cuenta de Google con el mismo email que tu cuenta de MiTurno.');
      const created = await tx.user.create({ data: {
        email, googleSubject: payload.sub, roles: ['PATIENT'], status: 'ACTIVE',
        patientProfile: { create: {
          firstName: payload.given_name ?? payload.name ?? 'Paciente',
          lastName: payload.family_name ?? '',
        } },
      } });
      return created.id;
    });
  }
}
