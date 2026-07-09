import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import { MercadoPagoProvider } from './providers/mercadopago.provider';

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    // Cambiar de proveedor = cambiar esta línea. Nada más.
    { provide: PAYMENT_PROVIDER, useClass: MercadoPagoProvider },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
