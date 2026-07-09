import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { Appointment, DoctorProfile } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PAYMENT_PROVIDER, PaymentProvider } from './payment-provider.interface';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private provider: PaymentProvider,
  ) {}

  async createDepositPreference(appointment: Appointment, doctor: DoctorProfile) {
    const patient = await this.prisma.patientProfile.findUniqueOrThrow({
      where: { id: appointment.patientId },
      include: { user: true },
    });

    const payment = await this.prisma.payment.create({
      data: {
        appointmentId: appointment.id,
        provider: this.provider.name,
        amount: doctor.depositAmount!,
        currency: doctor.depositCurrency,
      },
    });

    const pref = await this.provider.createDepositPreference({
      paymentId: payment.id,
      title: `Seña turno — Dr/a. ${doctor.lastName}`,
      amount: Number(doctor.depositAmount),
      currency: doctor.depositCurrency,
      payerEmail: patient.user.email,
    });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { providerRef: pref.providerRef },
    });

    return { checkoutUrl: pref.checkoutUrl, paymentId: payment.id };
  }

  /**
   * Procesa webhook del proveedor. Idempotente: si el pago ya está APPROVED
   * no re-dispara efectos. Devuelve el appointmentId confirmado (o null).
   */
  async handleWebhook(headers: Record<string, string>, body: any): Promise<string | null> {
    const parsed = await this.provider.parseWebhook(headers, body);
    if (!parsed) return null;

    const payment = await this.prisma.payment.findUnique({
      where: { id: parsed.providerRef }, // usamos external_reference = payment.id
    });
    if (!payment || payment.status === 'APPROVED') return null;

    if (parsed.status === 'APPROVED') {
      await this.prisma.$transaction([
        this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'APPROVED', paidAt: new Date(), rawWebhookPayload: body },
        }),
        this.prisma.appointment.update({
          where: { id: payment.appointmentId },
          data: { status: 'CONFIRMED' },
        }),
      ]);
      return payment.appointmentId;
    }

    if (parsed.status === 'REJECTED') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'REJECTED', rawWebhookPayload: body },
      });
    }
    return null;
  }

  async refund(paymentId: string) {
    const payment = await this.prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (payment.providerRef) await this.provider.refund(payment.providerRef);
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'REFUNDED' },
    });
  }
}
