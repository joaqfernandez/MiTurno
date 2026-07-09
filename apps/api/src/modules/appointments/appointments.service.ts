import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { addMinutes, differenceInHours } from 'date-fns';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { AvailabilityService } from './availability.service';
import { PaymentsService } from '../payments/payments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CalendarSyncService } from '../calendar/calendar-sync.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(
    private prisma: PrismaService,
    private availability: AvailabilityService,
    private payments: PaymentsService,
    private notifications: NotificationsService,
    private calendarSync: CalendarSyncService,
  ) {}

  /**
   * Reserva de turno. Flujo:
   * 1. Valida que el slot exista y esté libre (cálculo de disponibilidad).
   * 2. Crea el turno dentro de una transacción SERIALIZABLE — combinado con
   *    el unique(doctorId, startAt) del schema, hace imposible la doble reserva
   *    aunque dos pacientes confirmen en el mismo milisegundo.
   * 3. Si el médico exige seña: estado PENDING_PAYMENT + link de pago (MP).
   *    Si no: CONFIRMED directo + notificaciones + sync de calendario.
   */
  async book(user: AuthUser, dto: CreateAppointmentDto) {
    if (!user.patientProfileId)
      throw new ForbiddenException('Solo pacientes pueden reservar turnos');

    const doctor = await this.prisma.doctorProfile.findUnique({
      where: { id: dto.doctorId },
    });
    if (!doctor) throw new NotFoundException('Médico no encontrado');

    const startAt = new Date(dto.startAt);
    const endAt = addMinutes(startAt, doctor.defaultSlotMinutes);

    // Validar contra la disponibilidad real del médico
    const slots = await this.availability.getAvailableSlots(doctor.id, startAt, endAt);
    const valid = slots.some((s) => s.startAt.getTime() === startAt.getTime());
    if (!valid) throw new ConflictException('El horario ya no está disponible');

    const requiresDeposit = doctor.requiresDeposit && doctor.depositAmount;

    let appointment;
    try {
      appointment = await this.prisma.$transaction(
        async (tx) => {
          return tx.appointment.create({
            data: {
              patientId: user.patientProfileId!,
              doctorId: doctor.id,
              startAt,
              endAt,
              reason: dto.reason,
              status: requiresDeposit ? 'PENDING_PAYMENT' : 'CONFIRMED',
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (e: any) {
      // P2002 = violación de unique(doctorId, startAt): otro paciente ganó la carrera.
      if (e.code === 'P2002')
        throw new ConflictException('El horario acaba de ser tomado por otro paciente');
      throw e;
    }

    if (requiresDeposit) {
      const payment = await this.payments.createDepositPreference(appointment, doctor);
      return { appointment, payment };
    }

    await this.onConfirmed(appointment.id);
    return { appointment };
  }

  /** Efectos post-confirmación (también lo invoca el webhook de pagos). */
  async onConfirmed(appointmentId: string) {
    const appt = await this.prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      include: { patient: { include: { user: true } }, doctor: { include: { user: true } } },
    });
    await Promise.allSettled([
      this.notifications.enqueue(appt.patient.user.id, 'EMAIL', 'appointment_confirmed', {
        appointmentId: appt.id,
      }),
      this.notifications.enqueue(appt.doctor.user.id, 'EMAIL', 'new_appointment', {
        appointmentId: appt.id,
      }),
      this.calendarSync.pushAppointment(appt.id),
    ]);
  }

  async cancel(user: AuthUser, appointmentId: string, reason?: string) {
    const appt = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { doctor: true, payment: true },
    });
    if (!appt) throw new NotFoundException();

    const isPatient = user.patientProfileId === appt.patientId;
    const isDoctor = user.doctorProfileId === appt.doctorId;
    if (!isPatient && !isDoctor) throw new ForbiddenException();

    if (!['PENDING_PAYMENT', 'CONFIRMED'].includes(appt.status))
      throw new BadRequestException('El turno no se puede cancelar en su estado actual');

    // Política de reembolso de seña: dentro de la ventana → se reembolsa.
    const hoursLeft = differenceInHours(appt.startAt, new Date());
    const refundable =
      isDoctor || hoursLeft >= appt.doctor.cancellationWindowHours;

    const updated = await this.prisma.appointment.update({
      where: { id: appt.id },
      data: {
        status: isPatient ? 'CANCELLED_BY_PATIENT' : 'CANCELLED_BY_DOCTOR',
        cancelledAt: new Date(),
        cancellationReason: reason,
      },
    });

    if (appt.payment?.status === 'APPROVED' && refundable) {
      await this.payments.refund(appt.payment.id);
    }
    await this.calendarSync.removeAppointment(appt.id);

    return updated;
  }

  /** Agenda unificada: sirve para la vista calendario de paciente y de médico. */
  async myAgenda(user: AuthUser, from: Date, to: Date) {
    const where: Prisma.AppointmentWhereInput = {
      startAt: { gte: from, lte: to },
      OR: [
        user.patientProfileId ? { patientId: user.patientProfileId } : undefined,
        user.doctorProfileId ? { doctorId: user.doctorProfileId } : undefined,
      ].filter(Boolean) as Prisma.AppointmentWhereInput[],
    };

    return this.prisma.appointment.findMany({
      where,
      orderBy: { startAt: 'asc' },
      include: {
        doctor: { select: { firstName: true, lastName: true, specialties: true } },
        patient: { select: { firstName: true, lastName: true } },
        payment: { select: { status: true, amount: true } },
      },
    });
  }
}
