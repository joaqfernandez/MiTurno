/**
 * Abstracción de proveedor de pagos. Hoy: Mercado Pago.
 * Agregar Stripe = implementar esta interfaz y registrarla en el módulo.
 * Nada fuera de este módulo conoce al proveedor concreto.
 */
export interface DepositPreference {
  providerRef: string;
  checkoutUrl: string;
}

export interface PaymentProvider {
  readonly name: string;

  createDepositPreference(params: {
    paymentId: string;
    title: string;
    amount: number;
    currency: string;
    payerEmail: string;
  }): Promise<DepositPreference>;

  refund(providerRef: string): Promise<void>;

  /** Valida firma y devuelve el estado normalizado del pago referido. */
  parseWebhook(headers: Record<string, string>, body: any): Promise<{
    providerRef: string;
    status: 'APPROVED' | 'REJECTED' | 'PENDING';
  } | null>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
