import { Badge } from './ui';
import type { AppointmentStatus } from '@/lib/types';

const STATUS_CONFIG: Record<AppointmentStatus, { label: string; tone: 'brand' | 'success' | 'warn' | 'danger' | 'neutral' }> = {
  CONFIRMED: { label: 'Confirmado', tone: 'success' },
  PENDING_PAYMENT: { label: 'Esperando seña', tone: 'warn' },
  CANCELLED_BY_PATIENT: { label: 'Cancelado', tone: 'neutral' },
  CANCELLED_BY_DOCTOR: { label: 'Cancelado por el médico', tone: 'danger' },
  NO_SHOW: { label: 'Ausente', tone: 'danger' },
  COMPLETED: { label: 'Atendido', tone: 'brand' },
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  const { label, tone } = STATUS_CONFIG[status];
  return <Badge tone={tone}>{label}</Badge>;
}
