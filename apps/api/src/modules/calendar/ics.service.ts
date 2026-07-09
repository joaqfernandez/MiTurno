import { Injectable, NotFoundException } from '@nestjs/common';
import { createEvents, EventAttributes } from 'ics';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Feed .ics por suscripción (webcal://) — cubre Apple Calendar, Outlook y
 * cualquier cliente estándar sin necesidad de OAuth. El token es secreto y
 * rotable: si el médico lo regenera, la URL vieja deja de funcionar.
 */
@Injectable()
export class IcsService {
  constructor(private prisma: PrismaService) {}

  async buildDoctorFeed(feedToken: string): Promise<string> {
    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { icsFeedToken: feedToken },
      include: {
        appointments: {
          where: { status: { in: ['CONFIRMED', 'PENDING_PAYMENT'] } },
          include: { patient: { select: { firstName: true, lastName: true } } },
        },
      },
    });
    if (!doctor) throw new NotFoundException();

    const events: EventAttributes[] = doctor.appointments.map((a) => ({
      uid: `${a.id}@turnos-medicos`,
      title: `Turno: ${a.patient.firstName} ${a.patient.lastName}`,
      description: a.reason ?? undefined,
      start: this.toArr(a.startAt),
      end: this.toArr(a.endAt),
      startInputType: 'utc',
      endInputType: 'utc',
      status: a.status === 'CONFIRMED' ? 'CONFIRMED' : 'TENTATIVE',
    }));

    const { value, error } = createEvents(events);
    if (error) throw error;
    return value!;
  }

  private toArr(d: Date): [number, number, number, number, number] {
    return [
      d.getUTCFullYear(),
      d.getUTCMonth() + 1,
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
    ];
  }
}
