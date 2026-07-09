'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useCancelAppointment, useMyAppointments } from '@/lib/queries';
import { formatDateTime, initials } from '@/lib/format';
import { AppointmentStatusBadge } from '@/components/appointment-status';
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, PageHeader, Skeleton, cx } from '@/components/ui';
import { CalendarIcon, LockIcon } from '@/components/icons';
import type { Appointment } from '@/lib/types';

const CANCELLABLE: Appointment['status'][] = ['CONFIRMED', 'PENDING_PAYMENT'];

function AppointmentCard({ appt, onCancel }: { appt: Appointment; onCancel?: (a: Appointment) => void }) {
  const doctor = appt.doctor;
  return (
    <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
      <div className="flex flex-1 items-start gap-4">
        {doctor && <Avatar name={initials(doctor.firstName, doctor.lastName)} />}
        <div className="min-w-0">
          <p className="font-semibold capitalize text-slate-900">{formatDateTime(appt.startAt)}</p>
          {doctor && (
            <p className="mt-0.5 text-sm text-slate-600">
              {doctor.firstName} {doctor.lastName}
              {doctor.specialties?.[0] && <span className="text-slate-400"> · {doctor.specialties[0].name}</span>}
            </p>
          )}
          {appt.reason && <p className="mt-1 truncate text-sm text-slate-500">Motivo: {appt.reason}</p>}
          <div className="mt-2">
            <AppointmentStatusBadge status={appt.status} />
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-2 sm:items-end">
        {appt.status === 'PENDING_PAYMENT' && (
          <a
            href={appt.checkoutUrl ?? '#'}
            className="inline-flex min-h-9 items-center justify-center rounded-lg bg-success-600 px-4 text-sm font-medium text-white transition-colors hover:bg-success-700"
          >
            Pagar seña
          </a>
        )}
        {onCancel && CANCELLABLE.includes(appt.status) && (
          <Button variant="danger" size="sm" onClick={() => onCancel(appt)}>
            Cancelar turno
          </Button>
        )}
      </div>
    </Card>
  );
}

export default function MyAppointmentsPage() {
  const { session, ready } = useAuth();
  const { data: appointments, isLoading } = useMyAppointments();
  const cancel = useCancelAppointment();

  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [toCancel, setToCancel] = useState<Appointment | null>(null);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const list = appointments ?? [];
    return {
      upcoming: list
        .filter((a) => new Date(a.startAt).getTime() >= now && CANCELLABLE.includes(a.status))
        .sort((a, b) => a.startAt.localeCompare(b.startAt)),
      past: list
        .filter((a) => new Date(a.startAt).getTime() < now || !CANCELLABLE.includes(a.status))
        .sort((a, b) => b.startAt.localeCompare(a.startAt)),
    };
  }, [appointments]);

  if (ready && !session) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={<LockIcon className="h-8 w-8" />}
          title="Ingresá para ver tus turnos"
          description="Iniciá sesión con tu cuenta de paciente para ver y administrar tus turnos."
          action={
            <Link href="/login?volver=/mis-turnos">
              <Button>Ingresar</Button>
            </Link>
          }
        />
      </main>
    );
  }

  const list = tab === 'upcoming' ? upcoming : past;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Mis turnos"
        subtitle={session ? `Hola, ${session.name.split(' ')[0]}` : undefined}
        action={
          <Link href="/medicos">
            <Button>
              <CalendarIcon className="h-4 w-4" />
              Reservar turno
            </Button>
          </Link>
        }
      />

      {/* Tabs */}
      <div className="mb-5 flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Filtrar turnos">
        {(
          [
            ['upcoming', `Próximos${upcoming.length ? ` (${upcoming.length})` : ''}`],
            ['past', 'Historial'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cx(
              'min-h-10 flex-1 rounded-md text-sm font-medium transition-colors',
              tab === key ? 'bg-white text-slate-900 shadow-card' : 'text-slate-500 hover:text-slate-800',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3" aria-live="polite" aria-busy={isLoading}>
        {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}

        {!isLoading && list.length === 0 && (
          <EmptyState
            icon={<CalendarIcon className="h-8 w-8" />}
            title={tab === 'upcoming' ? 'No tenés turnos próximos' : 'Todavía no hay historial'}
            description={
              tab === 'upcoming' ? 'Buscá un especialista y reservá tu próximo turno en dos clics.' : undefined
            }
            action={
              tab === 'upcoming' ? (
                <Link href="/medicos">
                  <Button variant="secondary">Buscar médicos</Button>
                </Link>
              ) : undefined
            }
          />
        )}

        {list.map((a) => (
          <AppointmentCard key={a.id} appt={a} onCancel={tab === 'upcoming' ? setToCancel : undefined} />
        ))}
      </div>

      <ConfirmDialog
        open={!!toCancel}
        title="¿Cancelar este turno?"
        description={
          toCancel
            ? `Se cancelará el turno del ${formatDateTime(toCancel.startAt)}. Si pagaste seña y cancelás dentro de la ventana permitida, se reembolsa automáticamente.`
            : ''
        }
        confirmLabel="Sí, cancelar"
        loading={cancel.isPending}
        onConfirm={async () => {
          if (toCancel) {
            await cancel.mutateAsync(toCancel.id);
            setToCancel(null);
          }
        }}
        onClose={() => setToCancel(null)}
      />
    </main>
  );
}
