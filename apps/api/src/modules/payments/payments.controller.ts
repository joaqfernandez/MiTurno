import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(
    private payments: PaymentsService,
    private moduleRef: ModuleRef,
  ) {}

  /**
   * Webhook de Mercado Pago. Responde 200 rápido (MP reintenta si no).
   * La confirmación del turno dispara efectos vía AppointmentsService,
   * resuelto de forma perezosa para no acoplar módulos en el import graph.
   */
  @Post('webhooks/mercadopago')
  @HttpCode(200)
  async mpWebhook(@Headers() headers: Record<string, string>, @Body() body: any) {
    const confirmedAppointmentId = await this.payments.handleWebhook(headers, body);
    if (confirmedAppointmentId) {
      const { AppointmentsService } = await import('../appointments/appointments.service');
      const appts = this.moduleRef.get(AppointmentsService, { strict: false });
      await appts.onConfirmed(confirmedAppointmentId);
    }
    return { received: true };
  }
}
