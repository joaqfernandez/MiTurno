import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { CreateEntryDto } from './dto/create-entry.dto';

/**
 * Reglas de acceso a historia clínica (las más sensibles del sistema):
 *  - El paciente puede LEER su propia historia. Nunca escribirla.
 *  - Un médico puede LEER y ESCRIBIR solo si tiene relación asistencial
 *    con el paciente (al menos un turno entre ambos).
 *  - Las entradas son INMUTABLES: no hay update ni delete. Correcciones = enmiendas.
 *  - TODO acceso de lectura/escritura queda en AuditLog.
 */
@Injectable()
export class MedicalRecordsService {
  constructor(private prisma: PrismaService) {}

  async getRecord(user: AuthUser, patientId: string, ip?: string) {
    await this.assertCanRead(user, patientId);

    const record = await this.prisma.medicalRecord.findUnique({
      where: { patientId },
      include: {
        entries: {
          orderBy: { createdAt: 'desc' },
          include: {
            doctor: { select: { firstName: true, lastName: true, licenseNumber: true } },
            attachments: true,
            amendments: { select: { id: true, createdAt: true } },
          },
        },
      },
    });
    if (!record) throw new NotFoundException('Historia clínica no encontrada');

    await this.audit(user, 'medical_record.read', 'MedicalRecord', record.id, ip);
    return record;
  }

  async addEntry(user: AuthUser, dto: CreateEntryDto, ip?: string) {
    if (!user.doctorProfileId)
      throw new ForbiddenException('Solo médicos pueden escribir en la historia clínica');
    await this.assertClinicalRelationship(user.doctorProfileId, dto.patientId);

    const entry = await this.prisma.$transaction(async (tx) => {
      // La historia se crea lazy en la primera evolución
      const record = await tx.medicalRecord.upsert({
        where: { patientId: dto.patientId },
        create: { patientId: dto.patientId },
        update: {},
      });
      return tx.medicalRecordEntry.create({
        data: {
          recordId: record.id,
          doctorId: user.doctorProfileId!,
          title: dto.title,
          content: dto.content,
          appointmentId: dto.appointmentId,
          amendsEntryId: dto.amendsEntryId,
        },
      });
    });

    await this.audit(user, 'medical_record.write', 'MedicalRecordEntry', entry.id, ip);
    return entry;
  }

  private async assertCanRead(user: AuthUser, patientId: string) {
    if (user.roles.includes('ADMIN')) return;
    if (user.patientProfileId === patientId) return; // el paciente lee lo suyo
    if (user.doctorProfileId) {
      return this.assertClinicalRelationship(user.doctorProfileId, patientId);
    }
    throw new ForbiddenException();
  }

  private async assertClinicalRelationship(doctorId: string, patientId: string) {
    const relation = await this.prisma.appointment.findFirst({
      where: { doctorId, patientId },
      select: { id: true },
    });
    if (!relation)
      throw new ForbiddenException(
        'No existe relación asistencial con este paciente',
      );
  }

  private audit(user: AuthUser, action: string, entity: string, entityId: string, ip?: string) {
    return this.prisma.auditLog.create({
      data: { userId: user.userId, action, entity, entityId, ip },
    });
  }
}
