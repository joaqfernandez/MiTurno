import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class DoctorsService {
  constructor(private prisma: PrismaService) {}

  /** Búsqueda pública de médicos por especialidad/nombre. */
  search(specialtySlug?: string, q?: string) {
    return this.prisma.doctorProfile.findMany({
      where: {
        specialties: specialtySlug ? { some: { slug: specialtySlug } } : undefined,
        OR: q
          ? [
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
            ]
          : undefined,
        user: { status: 'ACTIVE' },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        bio: true,
        photoUrl: true,
        specialties: true,
        requiresDeposit: true,
        depositAmount: true,
        defaultSlotMinutes: true,
      },
    });
  }

  /** Configuración de agenda y seña — solo el propio médico. */
  async updateSettings(user: AuthUser, doctorId: string, data: Prisma.DoctorProfileUpdateInput) {
    if (user.doctorProfileId !== doctorId) throw new ForbiddenException();
    const allowed: (keyof Prisma.DoctorProfileUpdateInput)[] = [
      'bio', 'photoUrl', 'requiresDeposit', 'depositAmount',
      'defaultSlotMinutes', 'cancellationWindowHours',
    ];
    const safe = Object.fromEntries(
      Object.entries(data).filter(([k]) => allowed.includes(k as any)),
    );
    return this.prisma.doctorProfile.update({ where: { id: doctorId }, data: safe });
  }

  setSchedule(user: AuthUser, doctorId: string, schedules: { weekday: number; startTime: string; endTime: string; slotMinutes?: number }[]) {
    if (user.doctorProfileId !== doctorId) throw new ForbiddenException();
    return this.prisma.$transaction([
      this.prisma.doctorSchedule.deleteMany({ where: { doctorId } }),
      this.prisma.doctorSchedule.createMany({
        data: schedules.map((s) => ({ ...s, doctorId })),
      }),
    ]);
  }
}
