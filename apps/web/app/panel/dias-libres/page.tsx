'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { useCancelAppointment, useCreateOverride, useDeleteOverride, useOverrides } from '@/lib/queries';
import { formatDateOnly, formatDateTime } from '@/lib/format';
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, PageHeader, Skeleton } from '@/components/ui';
import { AlertCircleIcon, CalendarOffIcon, CheckCircleIcon, TrashIcon } from '@/components/icons';
import type { Appointment, ScheduleOverride } from '@/lib/types';

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function describeDates(item: ScheduleOverride) {
  const days = item.date === item.endDate ? formatDateOnly(item.date) : `Del ${formatDateOnly(item.date)} al ${formatDateOnly(item.endDate)}`;
  return item.startTime ? `${days} · de ${item.startTime} a ${item.endTime} h` : `${days} · todo el día`;
}

export default function DaysOffPage() {
  const { data: overrides, isLoading } = useOverrides();
  const create = useCreateOverride();
  const remove = useDeleteOverride();
  const cancel = useCancelAppointment();

  const today = todayISO();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('13:00');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [conflicts, setConflicts] = useState<Appointment[]>([]);
  const [saved, setSaved] = useState(false);
  const [toDelete, setToDelete] = useState<ScheduleOverride | null>(null);
  const [toCancel, setToCancel] = useState<Appointment | null>(null);

  const badRange = to < from;
  const badHours = !allDay && startTime >= endTime;

  function touched() {
    setSaved(false);
    setError('');
    setConflicts([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    touched();
    try {
      await create.mutateAsync({
        type: 'BLOCKED',
        date: from,
        endDate: to,
        startTime: allDay ? null : startTime,
        endTime: allDay ? null : endTime,
        reason: reason.trim() || null,
      });
      setReason('');
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
      if (err instanceof ApiError && err.code === 'APPOINTMENTS_IN_RANGE') {
        const data = err.data as { appointments?: Appointment[] } | undefined;
        setConflicts(data?.appointments ?? []);
      }
    }
  }

  async function confirmCancel() {
    if (!toCancel) return;
    try {
      await cancel.mutateAsync(toCancel.id);
    } catch {
      return; // El aviso general ya muestra el error de la API; el turno sigue en la lista.
    }
    const remaining = conflicts.filter((a) => a.id !== toCancel.id);
    setConflicts(remaining);
    setToCancel(null);
    if (remaining.length === 0) setError('');
  }

  const blocked = (overrides ?? []).filter((item) => item.type === 'BLOCKED');

  return (
    <main>
      <PageHeader
        title="Días libres y vacaciones"
        subtitle="Bloqueá fechas en las que no atendés. En esos días los pacientes no ven turnos disponibles."
      />

      <Card className="mb-6 p-5">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Desde" htmlFor="from" required>
              <Input
                id="from"
                type="date"
                min={today}
                value={from}
                onChange={(e) => {
                  touched();
                  setFrom(e.target.value);
                  if (to < e.target.value) setTo(e.target.value);
                }}
                required
              />
            </Field>
            <Field label="Hasta (inclusive)" htmlFor="to" required error={badRange ? 'La fecha de fin no puede ser anterior a la de inicio.' : undefined}>
              <Input id="to" type="date" min={from} value={to} onChange={(e) => { touched(); setTo(e.target.value); }} required />
            </Field>
          </div>

          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => { touched(); setAllDay(e.target.checked); }}
              className="h-4 w-4 rounded border-slate-300"
            />
            Todo el día
          </label>

          {!allDay && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Desde la hora" htmlFor="start-time" error={badHours ? 'La hora de inicio debe ser anterior a la de fin.' : undefined}>
                <Input id="start-time" type="time" value={startTime} onChange={(e) => { touched(); setStartTime(e.target.value); }} className="tabular-nums" />
              </Field>
              <Field label="Hasta la hora" htmlFor="end-time">
                <Input id="end-time" type="time" value={endTime} onChange={(e) => { touched(); setEndTime(e.target.value); }} className="tabular-nums" />
              </Field>
            </div>
          )}

          <Field label="Motivo (opcional)" htmlFor="reason" helper="Solo lo ves vos. Por ejemplo: Vacaciones, Congreso.">
            <Input id="reason" maxLength={500} value={reason} onChange={(e) => { touched(); setReason(e.target.value); }} />
          </Field>

          {error && (
            <div role="alert" className="rounded-lg border border-danger-600/30 bg-danger-50 p-4 text-sm text-danger-600">
              <p className="flex items-center gap-2 font-medium">
                <AlertCircleIcon className="h-4 w-4 shrink-0" />
                {error}
              </p>
              {conflicts.length > 0 && (
                <ul className="mt-3 flex flex-col gap-2" aria-label="Turnos en esas fechas">
                  {conflicts.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-3 text-slate-700">
                      <span>
                        <span className="font-medium text-slate-900">
                          {a.patient ? `${a.patient.firstName} ${a.patient.lastName}` : 'Paciente'}
                        </span>{' '}
                        · {formatDateTime(a.startAt)}
                      </span>
                      <Button type="button" variant="danger" size="sm" onClick={() => setToCancel(a)}>
                        Cancelar turno
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {conflicts.length > 0 && (
                <p className="mt-3 text-xs text-slate-600">
                  Al cancelar, el paciente recibe un aviso y, si pagó seña, se le devuelve. Cuando no queden turnos, volvé a tocar «Bloquear fechas».
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            {saved && (
              <span className="flex items-center gap-1 text-sm text-success-600">
                <CheckCircleIcon className="h-4 w-4" />
                Fechas bloqueadas
              </span>
            )}
            <Button type="submit" loading={create.isPending} disabled={!from || !to || badRange || badHours}>
              Bloquear fechas
            </Button>
          </div>
        </form>
      </Card>

      <h2 className="mb-3 text-lg font-semibold text-slate-900">Próximos bloqueos</h2>
      {isLoading ? (
        <Skeleton className="h-32" />
      ) : blocked.length === 0 ? (
        <EmptyState
          icon={<CalendarOffIcon className="h-8 w-8" />}
          title="No tenés fechas bloqueadas"
          description="Cuando cargues vacaciones o días libres, aparecen acá."
        />
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Próximos bloqueos">
          {blocked.map((item) => (
            <li key={item.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium text-slate-900">{describeDates(item)}</p>
                  {item.reason && <Badge className="mt-1">{item.reason}</Badge>}
                </div>
                <button
                  type="button"
                  onClick={() => setToDelete(item)}
                  aria-label={`Quitar bloqueo: ${describeDates(item)}`}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-danger-50 hover:text-danger-600"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Quitar bloqueo"
        description={toDelete ? `${describeDates(toDelete)}. Los pacientes van a poder volver a sacar turno en esas fechas.` : ''}
        confirmLabel="Quitar bloqueo"
        loading={remove.isPending}
        onConfirm={async () => {
          if (!toDelete) return;
          try {
            await remove.mutateAsync(toDelete.id);
            setToDelete(null);
          } catch {
            // El aviso general ya muestra el error de la API.
          }
        }}
        onClose={() => setToDelete(null)}
      />

      <ConfirmDialog
        open={Boolean(toCancel)}
        title="Cancelar turno"
        description={
          toCancel
            ? `${toCancel.patient ? `${toCancel.patient.firstName} ${toCancel.patient.lastName}` : 'El paciente'} · ${formatDateTime(toCancel.startAt)}. Se le avisa al paciente y no se puede deshacer.`
            : ''
        }
        confirmLabel="Cancelar turno"
        loading={cancel.isPending}
        onConfirm={confirmCancel}
        onClose={() => setToCancel(null)}
      />
    </main>
  );
}
