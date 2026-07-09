import { Injectable } from '@nestjs/common';
import { addMinutes, eachDayOfInterval, format, getDay, isBefore } from 'date-fns';
import { PrismaService } from '../../prisma/prisma.service';

export interface Slot {
  startAt: Date;
  endAt: Date;
}

/**
 * Calcula slots disponibles en runtime a partir de:
 *   agenda recurrente (DoctorSchedule) + excepciones (ScheduleOverride)
 *   - turnos ya tomados (Appointment activos).
 * Los slots NO se materializan en DB: así un cambio de agenda del médico
 * se refleja al instante y no hay millones de filas que mantener.
 */
@Injectable()
export class AvailabilityService {
  constructor(private prisma: PrismaService) {}

  async getAvailableSlots(doctorId: string, from: Date, to: Date): Promise<Slot[]> {
    const [doctor, schedules, overrides, taken] = await Promise.all([
      this.prisma.doctorProfile.findUniqueOrThrow({ where: { id: doctorId } }),
      this.prisma.doctorSchedule.findMany({ where: { doctorId } }),
      this.prisma.scheduleOverride.findMany({
        where: { doctorId, date: { gte: from, lte: to } },
      }),
      this.prisma.appointment.findMany({
        where: {
          doctorId,
          startAt: { gte: from, lte: to },
          status: { in: ['PENDING_PAYMENT', 'CONFIRMED'] },
        },
        select: { startAt: true, endAt: true },
      }),
    ]);

    const slots: Slot[] = [];

    for (const day of eachDayOfInterval({ start: from, end: to })) {
      const dayKey = format(day, 'yyyy-MM-dd');
      const dayOverrides = overrides.filter(
        (o) => format(o.date, 'yyyy-MM-dd') === dayKey,
      );

      // Día completamente bloqueado (vacaciones/feriado)
      if (dayOverrides.some((o) => o.type === 'BLOCKED' && !o.startTime)) continue;

      const daySchedules = schedules.filter((s) => s.weekday === getDay(day));

      for (const sched of daySchedules) {
        const slotMin = sched.slotMinutes ?? doctor.defaultSlotMinutes;
        let cursor = this.at(day, sched.startTime);
        const end = this.at(day, sched.endTime);

        while (isBefore(addMinutes(cursor, slotMin - 1), end)) {
          const slotEnd = addMinutes(cursor, slotMin);
          const overlapsTaken = taken.some(
            (t) => cursor < t.endAt && slotEnd > t.startAt,
          );
          const blocked = dayOverrides.some(
            (o) =>
              o.type === 'BLOCKED' &&
              o.startTime &&
              cursor < this.at(day, o.endTime!) &&
              slotEnd > this.at(day, o.startTime),
          );
          if (!overlapsTaken && !blocked && isBefore(new Date(), cursor)) {
            slots.push({ startAt: cursor, endAt: slotEnd });
          }
          cursor = slotEnd;
        }
      }
    }

    return slots.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  }

  private at(day: Date, hhmm: string): Date {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date(day);
    d.setHours(h, m, 0, 0);
    return d;
  }
}
