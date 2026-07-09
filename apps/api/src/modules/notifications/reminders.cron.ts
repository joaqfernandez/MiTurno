import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { addHours } from 'date-fns';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

/**
 * Crons del dominio de turnos:
 * 1. Recordatorio 24h antes del turno (email al paciente).
 * 2. Liberación de slots con seña impaga (>30 min en PENDING_PAYMENT).
 */
@Injectable()
export class RemindersCron {
  private readonly logger = new Logger(RemindersCron.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async sendReminders() {
    const windowStart = addHours(new Date(), 24);
    const windowEnd = addHours(windowStart, 1);

    const upcoming = await this.prisma.appointment.findMany({
      where: {
        status: 'CONFIRMED',
        startAt: { gte: windowStart, lt: windowEnd },
      },
      include: { patient: { include: { user: true } } },
    });

    for (const appt of upcoming) {
      // Idempotencia: no mandar dos veces el mismo recordatorio
      const already = await this.prisma.notification.findFirst({
        where: {
          userId: appt.patient.user.id,
          template: 'reminder_24h',
          payload: { path: ['appointmentId'], equals: appt.id },
        },
      });
      if (already) continue;
      await this.notifications.enqueue(appt.patient.user.id, 'EMAIL', 'reminder_24h', {
        appointmentId: appt.id,
      });
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async expireUnpaidHolds() {
    const cutoff = new Date(Date.now() - 30 * 60_000);
    const { count } = await this.prisma.appointment.updateMany({
      where: { status: 'PENDING_PAYMENT', createdAt: { lt: cutoff } },
      data: { status: 'CANCELLED_BY_PATIENT', cancellationReason: 'Seña no abonada' },
    });
    if (count) this.logger.log(`Liberados ${count} turnos con seña vencida`);
  }
}
