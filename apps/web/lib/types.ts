// Contratos JSON del backend Python (apps/api-python/app).

export type UserRole = 'PATIENT' | 'DOCTOR' | 'ADMIN';

export interface Session {
  accessToken: string;
  refreshToken?: string;
  patientProfileId?: string;
  role: UserRole;
  name: string;
  email: string;
  /** true cuando la sesión es simulada porque el backend no está disponible */
  demo?: boolean;
}

export interface Specialty {
  id: string;
  name: string;
  slug: string;
}

export interface Doctor {
  id: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  bio?: string;
  photoUrl?: string;
  specialties: Specialty[];
  requiresDeposit: boolean;
  depositAmount?: number;
  depositCurrency: string;
  defaultSlotMinutes: number;
  cancellationWindowHours: number;
  locations?: DoctorLocation[];
}

export interface DoctorLocation {
  id: string;
  /** Nombre del lugar: "Consultorio particular", "Hospital Italiano", etc. */
  name: string;
  address: string;
  /** Indicaciones para llegar: piso, entrada, consultorio, referencias. */
  notes?: string;
  /** Días en que atiende ahí. 0=domingo … 6=sábado. */
  weekdays: number[];
}

export interface Slot {
  startAt: string; // ISO UTC
  endAt: string;
}

export type AppointmentStatus =
  | 'PENDING_PAYMENT'
  | 'CONFIRMED'
  | 'CANCELLED_BY_PATIENT'
  | 'CANCELLED_BY_DOCTOR'
  | 'NO_SHOW'
  | 'COMPLETED';

export interface Appointment {
  id: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  reason?: string;
  doctor?: Pick<Doctor, 'id' | 'firstName' | 'lastName' | 'specialties'>;
  patient?: Pick<Patient, 'id' | 'firstName' | 'lastName'>;
  checkoutUrl?: string; // presente cuando status = PENDING_PAYMENT
}

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  documentId?: string;
  birthDate?: string;
  healthInsurance?: string;
  insuranceNumber?: string;
  /** Teléfono de contacto, cargado al registrarse. El médico lo ve para comunicarse ante una necesidad. */
  phone?: string;
  lastVisit?: string;
  visitCount?: number;
}

export interface MedicalRecordEntry {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  doctor: { firstName: string; lastName: string };
  amendsEntryId?: string;
}

export interface MedicalRecord {
  id: string;
  allergies?: string;
  chronicConditions?: string;
  currentMedication?: string;
  entries: MedicalRecordEntry[];
}

export interface WeeklyBlock {
  weekday: number; // 0=domingo ... 6=sábado
  startTime: string; // "09:00"
  endTime: string;
}

export interface DoctorSettings {
  requiresDeposit: boolean;
  depositAmount?: number;
  defaultSlotMinutes: number;
  cancellationWindowHours: number;
}
