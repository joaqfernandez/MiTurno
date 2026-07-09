import { Injectable } from '@nestjs/common';
import { MercadoPagoConfig, Preference, Payment as MPPayment, PaymentRefund } from 'mercadopago';
import { DepositPreference, PaymentProvider } from '../payment-provider.interface';

@Injectable()
export class MercadoPagoProvider implements PaymentProvider {
  readonly name = 'mercadopago';
  private client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! });

  async createDepositPreference(params: {
    paymentId: string;
    title: string;
    amount: number;
    currency: string;
    payerEmail: string;
  }): Promise<DepositPreference> {
    const pref = await new Preference(this.client).create({
      body: {
        items: [
          {
            id: params.paymentId,
            title: params.title,
            quantity: 1,
            unit_price: params.amount,
            currency_id: params.currency,
          },
        ],
        payer: { email: params.payerEmail },
        external_reference: params.paymentId,
        notification_url: `${process.env.API_URL}/api/payments/webhooks/mercadopago`,
        back_urls: {
          success: `${process.env.WEB_URL}/turnos/pago/exito`,
          failure: `${process.env.WEB_URL}/turnos/pago/error`,
        },
        auto_return: 'approved',
        // La seña expira: si no se paga en 30 min, el slot se libera (ver cron).
        expires: true,
        expiration_date_to: new Date(Date.now() + 30 * 60_000).toISOString(),
      },
    });
    return { providerRef: pref.id!, checkoutUrl: pref.init_point! };
  }

  async refund(providerRef: string): Promise<void> {
    await new PaymentRefund(this.client).create({ payment_id: providerRef });
  }

  async parseWebhook(_headers: Record<string, string>, body: any) {
    // TODO producción: validar firma x-signature con MP_WEBHOOK_SECRET.
    if (body?.type !== 'payment') return null;
    const mpPayment = await new MPPayment(this.client).get({ id: body.data.id });
    const map: Record<string, 'APPROVED' | 'REJECTED' | 'PENDING'> = {
      approved: 'APPROVED',
      rejected: 'REJECTED',
    };
    return {
      providerRef: mpPayment.external_reference!,
      status: map[mpPayment.status!] ?? 'PENDING',
    };
  }
}
