/**
 * Datos de demostración. Se usan SOLO cuando el backend no responde,
 * para poder visualizar y navegar todo el frontend sin API ni base de datos.
 * Las mutaciones (reservar, cancelar, guardar) operan sobre este store en memoria.
 */
import type {
  Appointment,
  Doctor,
  DoctorLocation,
  MedicalRecord,
  Patient,
  Slot,
  Specialty,
  WeeklyBlock,
  DoctorSettings,
} from './types';

/** El médico con sesión iniciada en modo demo (ver lib/auth.tsx: demoLogin). */
const CURRENT_DOCTOR_ID = 'd1';

export const demoSpecialties: Specialty[] = [
  { id: 's1', name: 'Cardiología', slug: 'cardiologia' },
  { id: 's2', name: 'Dermatología', slug: 'dermatologia' },
  { id: 's3', name: 'Pediatría', slug: 'pediatria' },
  { id: 's4', name: 'Clínica Médica', slug: 'clinica-medica' },
  { id: 's5', name: 'Ginecología', slug: 'ginecologia' },
  { id: 's6', name: 'Traumatología', slug: 'traumatologia' },
  { id: 's7', name: 'Oftalmología', slug: 'oftalmologia' },
  { id: 's8', name: 'Psiquiatría', slug: 'psiquiatria' },
];

const sp = (slug: string) => demoSpecialties.find((s) => s.slug === slug)!;

export const demoDoctors: Doctor[] = [
  {
    id: 'd1',
    firstName: 'Valeria',
    lastName: 'Roldán',
    licenseNumber: 'MN 112233',
    bio: 'Cardióloga clínica. Ergometrías, ecocardiogramas y seguimiento de hipertensión. 15 años de experiencia en el Hospital Italiano.',
    specialties: [sp('cardiologia'), sp('clinica-medica')],
    requiresDeposit: true,
    depositAmount: 8000,
    depositCurrency: 'ARS',
    defaultSlotMinutes: 30,
    cancellationWindowHours: 24,
    locations: [
      {
        id: 'loc-d1-1',
        name: 'Consultorio particular',
        address: 'Av. Santa Fe 3253, piso 4° "A", CABA',
        notes: 'Timbre "4A". El edificio tiene ascensor; el consultorio queda frente al palier.',
        weekdays: [1, 3, 5],
      },
      {
        id: 'loc-d1-2',
        name: 'Hospital Italiano de Buenos Aires',
        address: 'Tte. Gral. Juan D. Perón 4190, CABA',
        notes:
          'Ingresar por Perón a la Torre de Consultorios Externos, planta baja. Preguntar en informes por Cardiología, consultorio 12.',
        weekdays: [2, 4],
      },
    ],
  },
  {
    id: 'd2',
    firstName: 'Martín',
    lastName: 'Aguirre',
    licenseNumber: 'MN 98721',
    bio: 'Dermatología general y oncológica. Dermatoscopía digital y control de lunares.',
    specialties: [sp('dermatologia')],
    requiresDeposit: false,
    depositCurrency: 'ARS',
    defaultSlotMinutes: 20,
    cancellationWindowHours: 12,
    locations: [
      {
        id: 'loc-d2-1',
        name: 'Consultorio particular',
        address: 'Av. Cabildo 1842, piso 2° "B", CABA',
        notes: 'Edificio con portero eléctrico. Subir por ascensor hasta el 2do piso.',
        weekdays: [1, 2, 3, 4, 5],
      },
    ],
  },
  {
    id: 'd3',
    firstName: 'Carolina',
    lastName: 'Bianchi',
    licenseNumber: 'MP 45012',
    bio: 'Pediatra. Controles de niño sano, vacunación y seguimiento de recién nacidos.',
    specialties: [sp('pediatria')],
    requiresDeposit: false,
    depositCurrency: 'ARS',
    defaultSlotMinutes: 30,
    cancellationWindowHours: 24,
    locations: [
      {
        id: 'loc-d3-1',
        name: 'Clínica del Niño',
        address: 'Av. Rivadavia 5820, CABA',
        notes: 'Entrada principal sobre Rivadavia. Sala de espera de Pediatría en planta baja.',
        weekdays: [1, 2, 3, 4, 5],
      },
    ],
  },
  {
    id: 'd4',
    firstName: 'Hernán',
    lastName: 'Sosa',
    licenseNumber: 'MN 76543',
    bio: 'Clínica médica y medicina preventiva. Chequeos anuales y certificados de aptitud física.',
    specialties: [sp('clinica-medica')],
    requiresDeposit: false,
    depositCurrency: 'ARS',
    defaultSlotMinutes: 30,
    cancellationWindowHours: 6,
    locations: [
      {
        id: 'loc-d4-1',
        name: 'Sanatorio Güemes',
        address: 'French 3170, CABA',
        notes: 'Ingresar por guardia y dirigirse a Consultorios Externos, 1er piso, sector B.',
        weekdays: [1, 2, 3, 4, 5],
      },
    ],
  },
  {
    id: 'd5',
    firstName: 'Lucía',
    lastName: 'Ferreyra',
    licenseNumber: 'MN 33445',
    bio: 'Ginecología y obstetricia. Controles anuales, PAP y colposcopía.',
    specialties: [sp('ginecologia')],
    requiresDeposit: true,
    depositAmount: 6500,
    depositCurrency: 'ARS',
    defaultSlotMinutes: 30,
    cancellationWindowHours: 48,
    locations: [
      {
        id: 'loc-d5-1',
        name: 'Consultorio particular',
        address: 'Av. Las Heras 2934, piso 6° "C", CABA',
        notes: 'Portero eléctrico "6C". El edificio tiene rampa de acceso.',
        weekdays: [2, 3, 4],
      },
    ],
  },
  {
    id: 'd6',
    firstName: 'Diego',
    lastName: 'Palacios',
    licenseNumber: 'MP 20981',
    bio: 'Traumatólogo. Lesiones deportivas, rodilla y hombro. Infiltraciones ecoguiadas.',
    specialties: [sp('traumatologia')],
    requiresDeposit: true,
    depositAmount: 10000,
    depositCurrency: 'ARS',
    defaultSlotMinutes: 20,
    cancellationWindowHours: 24,
    locations: [
      {
        id: 'loc-d6-1',
        name: 'Clínica del Deporte',
        address: 'Av. Cabildo 2721, CABA',
        notes: 'Consultorios de Traumatología en el 3er piso. Hay ascensor y escalera.',
        weekdays: [1, 2, 4, 5],
      },
    ],
  },
  {
    id: 'd7',
    firstName: 'Silvina',
    lastName: 'Kaplan',
    licenseNumber: 'MN 54321',
    bio: 'Oftalmóloga. Agudeza visual, fondo de ojo, control de glaucoma y recetas de lentes.',
    specialties: [sp('oftalmologia')],
    requiresDeposit: false,
    depositCurrency: 'ARS',
    defaultSlotMinutes: 15,
    cancellationWindowHours: 12,
    locations: [
      {
        id: 'loc-d7-1',
        name: 'Instituto de la Visión',
        address: 'Av. Córdoba 4890, CABA',
        notes: 'Recepción en planta baja; indican el consultorio según disponibilidad.',
        weekdays: [1, 2, 3, 4, 5],
      },
    ],
  },
  {
    id: 'd8',
    firstName: 'Federico',
    lastName: 'Morales',
    licenseNumber: 'MN 87654',
    bio: 'Psiquiatra. Primera consulta de evaluación, seguimiento farmacológico y terapia breve.',
    specialties: [sp('psiquiatria')],
    requiresDeposit: true,
    depositAmount: 12000,
    depositCurrency: 'ARS',
    defaultSlotMinutes: 45,
    cancellationWindowHours: 48,
    locations: [
      {
        id: 'loc-d8-1',
        name: 'Consultorio particular',
        address: 'Av. Pueyrredón 1435, piso 3° "D", CABA',
        notes: 'Timbre "3D". Por favor llegar 5 minutos antes del horario reservado.',
        weekdays: [1, 3, 5],
      },
    ],
  },
];

// --- Agenda semanal demo del médico logueado -------------------------------

export let demoSchedule: WeeklyBlock[] = [
  { weekday: 1, startTime: '09:00', endTime: '13:00' },
  { weekday: 1, startTime: '14:00', endTime: '18:00' },
  { weekday: 2, startTime: '09:00', endTime: '13:00' },
  { weekday: 3, startTime: '09:00', endTime: '13:00' },
  { weekday: 3, startTime: '14:00', endTime: '18:00' },
  { weekday: 4, startTime: '14:00', endTime: '19:00' },
  { weekday: 5, startTime: '09:00', endTime: '13:00' },
];

export function setDemoSchedule(blocks: WeeklyBlock[]) {
  demoSchedule = blocks;
}

// --- Ubicaciones de atención del médico logueado ---------------------------
// Viven como parte del objeto Doctor (igual que en el modelo real) para que
// el perfil público y el panel de configuración lean siempre la misma fuente.

export function demoGetLocations(): DoctorLocation[] {
  return demoDoctors.find((d) => d.id === CURRENT_DOCTOR_ID)?.locations ?? [];
}

export function demoSaveLocations(locations: DoctorLocation[]) {
  const doctor = demoDoctors.find((d) => d.id === CURRENT_DOCTOR_ID);
  if (doctor) doctor.locations = locations;
}

// --- Foto de perfil del médico logueado -------------------------------------

export function demoGetPhoto(): string | undefined {
  return demoDoctors.find((d) => d.id === CURRENT_DOCTOR_ID)?.photoUrl;
}

export function demoSavePhoto(photoUrl: string | undefined) {
  const doctor = demoDoctors.find((d) => d.id === CURRENT_DOCTOR_ID);
  if (doctor) doctor.photoUrl = photoUrl;
}

export let demoSettings: DoctorSettings = {
  requiresDeposit: true,
  depositAmount: 8000,
  defaultSlotMinutes: 30,
  cancellationWindowHours: 24,
};

export function setDemoSettings(s: DoctorSettings) {
  demoSettings = s;
}

// --- Disponibilidad --------------------------------------------------------

/** Hash determinístico para que los "huecos ocupados" sean estables entre renders. */
function seeded(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h) / 2147483647;
}

/** Genera slots libres para los próximos `days` días, lun-vie 9-13 y 14-18. */
export function demoAvailability(doctorId: string, days = 14): Slot[] {
  const doctor = demoDoctors.find((d) => d.id === doctorId);
  const slotMin = doctor?.defaultSlotMinutes ?? 30;
  const slots: Slot[] = [];
  const now = new Date();

  for (let d = 0; d < days; d++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
    const wd = day.getDay();
    if (wd === 0 || wd === 6) continue; // fin de semana
    for (const [h0, h1] of [
      [9, 13],
      [14, 18],
    ]) {
      for (let m = h0 * 60; m + slotMin <= h1 * 60; m += slotMin) {
        const start = new Date(day);
        start.setMinutes(m);
        if (start <= now) continue;
        // ~45% de los huecos ya están tomados, de forma estable
        if (seeded(`${doctorId}-${start.toISOString()}`) < 0.45) continue;
        const end = new Date(start.getTime() + slotMin * 60_000);
        slots.push({ startAt: start.toISOString(), endAt: end.toISOString() });
      }
    }
  }
  return slots;
}

// --- Turnos ----------------------------------------------------------------

function at(daysFromNow: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

let nextId = 100;

export const demoMyAppointments: Appointment[] = [
  {
    id: 'a1',
    startAt: at(2, 10, 30),
    endAt: at(2, 11, 0),
    status: 'CONFIRMED',
    reason: 'Control anual',
    doctor: { id: 'd1', firstName: 'Valeria', lastName: 'Roldán', specialties: [sp('cardiologia')] },
  },
  {
    id: 'a2',
    startAt: at(9, 16, 0),
    endAt: at(9, 16, 20),
    status: 'PENDING_PAYMENT',
    reason: 'Dolor de rodilla al correr',
    doctor: { id: 'd6', firstName: 'Diego', lastName: 'Palacios', specialties: [sp('traumatologia')] },
    checkoutUrl: '#',
  },
  {
    id: 'a3',
    startAt: at(-20, 9, 0),
    endAt: at(-20, 9, 30),
    status: 'COMPLETED',
    reason: 'Chequeo general',
    doctor: { id: 'd4', firstName: 'Hernán', lastName: 'Sosa', specialties: [sp('clinica-medica')] },
  },
  {
    id: 'a4',
    startAt: at(-45, 11, 0),
    endAt: at(-45, 11, 20),
    status: 'CANCELLED_BY_PATIENT',
    reason: 'Control de lunares',
    doctor: { id: 'd2', firstName: 'Martín', lastName: 'Aguirre', specialties: [sp('dermatologia')] },
  },
];

export const demoDoctorAgenda: Appointment[] = [
  {
    id: 'b1',
    startAt: at(0, 9, 0),
    endAt: at(0, 9, 30),
    status: 'CONFIRMED',
    reason: 'Control post-operatorio',
    patient: { id: 'p1', firstName: 'Roberto', lastName: 'Giménez' },
  },
  {
    id: 'b2',
    startAt: at(0, 9, 30),
    endAt: at(0, 10, 0),
    status: 'CONFIRMED',
    reason: 'Primera consulta — dolor precordial',
    patient: { id: 'p2', firstName: 'Ana', lastName: 'Castro' },
  },
  {
    id: 'b3',
    startAt: at(0, 11, 0),
    endAt: at(0, 11, 30),
    status: 'PENDING_PAYMENT',
    reason: 'Ergometría',
    patient: { id: 'p3', firstName: 'Julián', lastName: 'Paz' },
  },
  {
    id: 'b4',
    startAt: at(0, 15, 0),
    endAt: at(0, 15, 30),
    status: 'CONFIRMED',
    reason: 'Control de presión — seguimiento',
    patient: { id: 'p4', firstName: 'Marta', lastName: 'Villalba' },
  },
  {
    id: 'b5',
    startAt: at(1, 10, 0),
    endAt: at(1, 10, 30),
    status: 'CONFIRMED',
    reason: 'Ecocardiograma',
    patient: { id: 'p5', firstName: 'Sofía', lastName: 'Duarte' },
  },
  {
    id: 'b6',
    startAt: at(2, 9, 0),
    endAt: at(2, 9, 30),
    status: 'CONFIRMED',
    reason: 'Resultados de laboratorio',
    patient: { id: 'p1', firstName: 'Roberto', lastName: 'Giménez' },
  },
];

export const demoPatients: Patient[] = [
  { id: 'p1', firstName: 'Roberto', lastName: 'Giménez', documentId: '22.456.789', healthInsurance: 'OSDE 310', phone: '11 4455-6677', lastVisit: at(-15, 9), visitCount: 8 },
  { id: 'p2', firstName: 'Ana', lastName: 'Castro', documentId: '30.111.222', healthInsurance: 'Swiss Medical', phone: '11 2233-4455', lastVisit: at(0, 9, 30), visitCount: 1 },
  { id: 'p3', firstName: 'Julián', lastName: 'Paz', documentId: '35.987.654', healthInsurance: 'IOMA', phone: '11 6677-8899', lastVisit: at(-60, 11), visitCount: 3 },
  { id: 'p4', firstName: 'Marta', lastName: 'Villalba', documentId: '14.222.333', healthInsurance: 'PAMI', phone: '11 3344-5566', lastVisit: at(-30, 15), visitCount: 12 },
  { id: 'p5', firstName: 'Sofía', lastName: 'Duarte', documentId: '38.444.555', healthInsurance: 'Galeno', phone: '11 5566-7788', lastVisit: at(-7, 10), visitCount: 2 },
];

export const demoRecords: Record<string, MedicalRecord> = {
  p1: {
    id: 'r1',
    allergies: 'Penicilina',
    chronicConditions: 'Hipertensión arterial (dx 2019)',
    currentMedication: 'Enalapril 10 mg/día',
    entries: [
      {
        id: 'e1',
        title: 'Consulta inicial',
        content:
          'Paciente de 58 años consulta por disnea de esfuerzo. TA 150/95. Se solicita ergometría y laboratorio completo. Se indica control de presión domiciliario.',
        createdAt: at(-120, 9),
        doctor: { firstName: 'Valeria', lastName: 'Roldán' },
      },
      {
        id: 'e2',
        title: 'Resultados de ergometría',
        content:
          'Ergometría negativa para isquemia. Capacidad funcional conservada (10 METs). Se ajusta enalapril a 10 mg/día. Control en 3 meses.',
        createdAt: at(-90, 10),
        doctor: { firstName: 'Valeria', lastName: 'Roldán' },
      },
      {
        id: 'e3',
        title: 'Enmienda: resultados de ergometría',
        content:
          'Corrección de la entrada anterior: la capacidad funcional registrada fue 9 METs, no 10. El resto de la evolución no se modifica.',
        createdAt: at(-89, 8),
        doctor: { firstName: 'Valeria', lastName: 'Roldán' },
        amendsEntryId: 'e2',
      },
      {
        id: 'e4',
        title: 'Control trimestral',
        content:
          'TA 130/80 en consultorio, registros domiciliarios dentro de objetivo. Asintomático. Continúa igual esquema. Próximo control en 6 meses con laboratorio.',
        createdAt: at(-15, 9),
        doctor: { firstName: 'Valeria', lastName: 'Roldán' },
      },
    ],
  },
  p4: {
    id: 'r4',
    allergies: 'No refiere',
    chronicConditions: 'Diabetes tipo 2, hipertensión',
    currentMedication: 'Metformina 850 mg c/12h, losartán 50 mg/día',
    entries: [
      {
        id: 'e10',
        title: 'Seguimiento de presión arterial',
        content: 'TA 140/85. Se refuerza dieta hiposódica. HbA1c 7.1%. Continúa esquema actual.',
        createdAt: at(-30, 15),
        doctor: { firstName: 'Valeria', lastName: 'Roldán' },
      },
    ],
  },
};

// --- Mutaciones demo --------------------------------------------------------

export function demoBook(doctorId: string, slot: Slot, reason?: string): Appointment {
  const doctor = demoDoctors.find((d) => d.id === doctorId)!;
  const appt: Appointment = {
    id: `demo-${nextId++}`,
    startAt: slot.startAt,
    endAt: slot.endAt,
    status: doctor.requiresDeposit ? 'PENDING_PAYMENT' : 'CONFIRMED',
    reason,
    doctor: {
      id: doctor.id,
      firstName: doctor.firstName,
      lastName: doctor.lastName,
      specialties: doctor.specialties,
    },
    ...(doctor.requiresDeposit ? { checkoutUrl: '#' } : {}),
  };
  demoMyAppointments.unshift(appt);
  return appt;
}

export function demoCancel(id: string) {
  const appt = demoMyAppointments.find((a) => a.id === id);
  if (appt) appt.status = 'CANCELLED_BY_PATIENT';
}

export function demoAddEntry(patientId: string, title: string, content: string, amendsEntryId?: string) {
  const record = (demoRecords[patientId] ??= {
    id: `r-${patientId}`,
    entries: [],
  });
  record.entries.push({
    id: `e-${nextId++}`,
    title,
    content,
    createdAt: new Date().toISOString(),
    doctor: { firstName: 'Valeria', lastName: 'Roldán' },
    amendsEntryId,
  });
}
