import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { CookieOptions, Request, Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

export type OAuthPurpose = 'login' | 'calendar' | 'session';
const TTL = 10 * 60 * 1000;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('hex');

@Injectable()
export class OAuthStateService {
  constructor(private readonly prisma: PrismaService) {}

  private cookieName(purpose: OAuthPurpose) {
    return `miturno_oauth_${purpose}`;
  }

  private cookieOptions(purpose: OAuthPurpose): CookieOptions {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: purpose === 'calendar' ? '/api/calendar/google' : '/api/auth/google',
    };
  }

  private readCookie(req: Request, purpose: OAuthPurpose) {
    const prefix = `${this.cookieName(purpose)}=`;
    return req.headers.cookie?.split(';').map((part) => part.trim())
      .find((part) => part.startsWith(prefix))?.slice(prefix.length);
  }

  async create(purpose: OAuthPurpose, res: Response, subjectId?: string) {
    const state = random();
    const binding = purpose === 'session' ? state : random();
    const nonce = random();
    const ttl = purpose === 'session' ? 60_000 : TTL;
    await this.prisma.oAuthRequest.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    await this.prisma.oAuthRequest.create({ data: {
      tokenHash: hash(state), bindingHash: hash(binding), purpose, subjectId, nonce,
      expiresAt: new Date(Date.now() + ttl),
    } });
    res.cookie(this.cookieName(purpose), binding, { ...this.cookieOptions(purpose), maxAge: ttl });
    return { state, nonce };
  }

  async consume(purpose: OAuthPurpose, state: unknown, req: Request, res: Response) {
    const binding = this.readCookie(req, purpose);
    res.clearCookie(this.cookieName(purpose), this.cookieOptions(purpose));
    if (typeof state !== 'string' || !/^[a-f0-9]{64}$/.test(state) ||
        !binding || !/^[a-f0-9]{64}$/.test(binding)) {
      throw new BadRequestException('La solicitud OAuth no es válida. Volvé a iniciar el proceso.');
    }
    const where = {
      tokenHash: hash(state), bindingHash: hash(binding), purpose,
      expiresAt: { gt: new Date() },
    };
    const stored = await this.prisma.oAuthRequest.findFirst({ where });
    if (!stored) throw new BadRequestException('La solicitud OAuth venció o no es válida.');
    // El DELETE condicional permite un único ganador incluso entre varias instancias.
    const consumed = await this.prisma.oAuthRequest.deleteMany({
      where: { ...where, expiresAt: { gt: new Date() } },
    });
    if (consumed.count !== 1) throw new BadRequestException('La solicitud OAuth ya fue utilizada.');
    return stored;
  }

  consumeSession(req: Request, res: Response) {
    return this.consume('session', this.readCookie(req, 'session'), req, res);
  }
}
