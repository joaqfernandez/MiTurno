import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new BadRequestException('El email ya está registrado');
    if (dto.role === 'DOCTOR' && !dto.licenseNumber)
      throw new BadRequestException('La matrícula es obligatoria para médicos');

    const passwordHash = await argon2.hash(dto.password);

    // Usuario + perfil en una sola transacción.
    const user = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: dto.email, passwordHash, roles: [dto.role] },
      });
      if (dto.role === 'PATIENT') {
        await tx.patientProfile.create({
          data: { userId: user.id, firstName: dto.firstName, lastName: dto.lastName },
        });
      } else {
        await tx.doctorProfile.create({
          data: {
            userId: user.id,
            firstName: dto.firstName,
            lastName: dto.lastName,
            licenseNumber: dto.licenseNumber!,
            icsFeedToken: randomBytes(24).toString('hex'),
          },
        });
      }
      return user;
    });

    return this.issueTokens(user.id);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, dto.password)))
      throw new UnauthorizedException('Credenciales inválidas');
    return this.issueTokens(user.id);
  }

  async refresh(rawToken: string) {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date())
      throw new UnauthorizedException('Refresh token inválido');

    // Rotación: el token usado se revoca y se emite uno nuevo.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(stored.userId);
  }

  private async issueTokens(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { patientProfile: true, doctorProfile: true },
    });

    const accessToken = this.jwt.sign({
      sub: user.id,
      email: user.email,
      roles: user.roles,
      pid: user.patientProfile?.id,
      did: user.doctorProfile?.id,
    });

    const rawRefresh = randomBytes(48).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: createHash('sha256').update(rawRefresh).digest('hex'),
        expiresAt: new Date(
          Date.now() + Number(process.env.JWT_REFRESH_TTL_DAYS ?? 30) * 86_400_000,
        ),
      },
    });

    return { accessToken, refreshToken: rawRefresh };
  }
}
