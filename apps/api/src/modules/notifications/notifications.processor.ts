import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Worker de envío. Implementaciones reales:
 *  - EMAIL: Resend (https://resend.com) — templates en /templates
 *  - SMS: Twilio
 * Mantener cada proveedor detrás de una función para poder cambiarlo.
 */
@Processor('notifications')
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(private prisma: PrismaService) {
    super();
  }

  async process(job: Job<{ notificationId: string }>) {
    const notification = await this.prisma.notification.findUniqueOrThrow({
      where: { id: job.data.notificationId },
      include: { user: true },
    });

    try {
      switch (notification.channel) {
        case 'EMAIL':
          await this.sendEmail(notification.user.email, notification.template, notification.payload);
          break;
        case 'SMS':
          await this.sendSms(notification.user.phone, notification.template, notification.payload);
          break;
      }
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
    } catch (e: any) {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'FAILED', error: String(e) },
      });
      throw e; // BullMQ reintenta
    }
  }

  private async sendEmail(to: string, template: string, payload: any) {
    // TODO: integrar Resend. Por ahora, log para desarrollo.
    this.logger.log(`[EMAIL → ${to}] template=${template} payload=${JSON.stringify(payload)}`);
  }

  private async sendSms(to: string | null, template: string, payload: any) {
    if (!to) return;
    // TODO: integrar Twilio.
    this.logger.log(`[SMS → ${to}] template=${template}`);
  }
}
