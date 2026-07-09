import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Las notificaciones SIEMPRE pasan por cola (BullMQ + Redis):
 * un fallo de email/SMS jamás bloquea la reserva de un turno,
 * y los reintentos con backoff son automáticos.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('notifications') private queue: Queue,
  ) {}

  async enqueue(
    userId: string,
    channel: NotificationChannel,
    template: string,
    payload: Record<string, unknown>,
  ) {
    const notification = await this.prisma.notification.create({
      data: { userId, channel, template, payload: payload as any },
    });
    await this.queue.add(
      'send',
      { notificationId: notification.id },
      { attempts: 5, backoff: { type: 'exponential', delay: 5_000 } },
    );
    return notification;
  }
}
