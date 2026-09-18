// Reproducciones de auditoría: ejecutan código real con persistencia simulada.
// No prueban PostgreSQL, HTTP, concurrencia real ni proveedores externos.
// Desde la raíz: node docs/audit-probes.cjs
const path = require('node:path');
const assert = require('node:assert/strict');
require('ts-node').register({ project: path.join(__dirname, '../apps/api/tsconfig.json'), transpileOnly: true });
require('reflect-metadata');
const { AvailabilityService } = require('../apps/api/src/modules/appointments/availability.service');
const { PatientsService } = require('../apps/api/src/modules/patients/patients.service');
const { MedicalRecordsService } = require('../apps/api/src/modules/medical-records/medical-records.service');
const { PaymentsService } = require('../apps/api/src/modules/payments/payments.service');
const { RegisterDto } = require('../apps/api/src/modules/auth/dto/register.dto');
const { ValidationPipe } = require('@nestjs/common');
const { withFallback, ApiError } = require('../apps/web/lib/api');

async function main() {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  await assert.rejects(pipe.transform({ email: 'audit@example.com', password: 'testpassword', firstName: 'A', lastName: 'B', role: 'PATIENT', phone: '123456789' }, { type: 'body', metatype: RegisterDto }), /Bad Request/);
  console.log('CONFIRMADO: registro con phone rechazado por ValidationPipe.');

  const day = new Date(2035, 0, 8);
  const at = (hour, minute = 0) => new Date(2035, 0, 8, hour, minute);
  let takenQuery;
  const availability = new AvailabilityService({
    doctorProfile: { findUniqueOrThrow: async () => ({ defaultSlotMinutes: 30 }) },
    doctorSchedule: { findMany: async () => [{ weekday: day.getDay(), startTime: '09:00', endTime: '12:00', validFrom: new Date(2036, 0, 1) }] },
    scheduleOverride: { findMany: async () => [] },
    appointment: { findMany: async (query) => { takenQuery = query; return []; } },
  });
  const slots = await availability.getAvailableSlots('doctor', at(10), at(10, 30));
  assert(slots.some(s => s.startAt < at(10)));
  assert(slots.some(s => s.startAt > at(10, 30)));
  assert(slots.length > 0);
  assert.equal(takenQuery.where.startAt.gte.getTime(), at(10).getTime());
  console.log('CONFIRMADO: disponibilidad fuera del rango y anterior a validFrom; filtro de ocupación omite inicios anteriores.');

  let forwarded;
  const patients = new PatientsService({ patientProfile: { update: async args => { forwarded = args.data; return args; } } });
  await patients.updateMe({ patientProfileId: 'patient' }, { user: { update: { roles: ['ADMIN'] } } });
  assert.equal(Object.hasOwn(forwarded, 'user'), false);
  console.log('CORREGIDO A03: actualización de paciente no propaga relaciones a Prisma.');

  let committed = false;
  const records = new MedicalRecordsService({
    appointment: { findFirst: async () => ({ id: 'appointment' }) },
    $transaction: async callback => callback({ medicalRecord: { upsert: async () => ({ id: 'record' }) }, medicalRecordEntry: { create: async () => { committed = true; return { id: 'entry' }; } } }),
    auditLog: { create: async () => { throw new Error('audit unavailable'); } },
  });
  await assert.rejects(records.addEntry({ userId: 'user', doctorProfileId: 'doctor' }, { patientId: 'patient', title: 'Title', content: 'Content' }), /audit unavailable/);
  assert(committed);
  console.log('CONFIRMADO: escritura clínica finaliza transacción antes de fallar AuditLog.');

  let nextStatus;
  const payments = new PaymentsService({
    payment: { findUnique: async () => ({ id: 'payment', status: 'EXPIRED', appointmentId: 'cancelled' }), update: async () => ({}) },
    appointment: { update: async args => { nextStatus = args.data.status; return {}; } },
    $transaction: async operations => Promise.all(operations),
  }, { parseWebhook: async () => ({ providerRef: 'payment', status: 'APPROVED' }) });
  assert.equal(await payments.handleWebhook({}, {}), 'cancelled');
  assert.equal(nextStatus, 'CONFIRMED');
  console.log('CONFIRMADO: webhook aprobado solicita confirmar turno de pago EXPIRED sin comprobar estado del turno.');

  assert.equal(await withFallback(async () => { throw new ApiError('Unauthorized', 401); }, () => 'demo mutation'), 'demo mutation');
  await assert.rejects(withFallback(async () => { throw new ApiError('Not found', 404); }, () => 'demo'), /Not found/);
  console.log('CONFIRMADO: 401 cae a demo; 404 se propaga.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
