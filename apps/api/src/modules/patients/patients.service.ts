import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  async getMe(user: AuthUser) {
    if (!user.patientProfileId) throw new ForbiddenException();
    return this.prisma.patientProfile.findUnique({
      where: { id: user.patientProfileId },
    });
  }

  async updateMe(user: AuthUser, data: { firstName?: string; lastName?: string; documentId?: string; birthDate?: string; healthInsurance?: string; insuranceNumber?: string }) {
    if (!user.patientProfileId) throw new ForbiddenException();
    return this.prisma.patientProfile.update({
      where: { id: user.patientProfileId },
      data: { ...data, birthDate: data.birthDate ? new Date(data.birthDate) : undefined },
    });
  }

  /**
   * Historial de pacientes atendidos por un médico
   * (para el panel del doctor: "mis pacientes").
   */
  async patientsOfDoctor(user: AuthUser) {
    if (!user.doctorProfileId) throw new ForbiddenException();
    return this.prisma.patientProfile.findMany({
      where: { appointments: { some: { doctorId: user.doctorProfileId } } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        healthInsurance: true,
        appointments: {
          where: { doctorId: user.doctorProfileId },
          orderBy: { startAt: 'desc' },
          take: 5,
          select: { id: true, startAt: true, status: true, reason: true },
        },
      },
      orderBy: { lastName: 'asc' },
    });
  }
}
