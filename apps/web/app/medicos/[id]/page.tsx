'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useAvailability, useBookAppointment, useDoctor } from '@/lib/queries';
import { formatDayLong, formatDayShort, formatMoney, formatTime, initials } from '@/lib/format';
import { Avatar, Badge, Button, Card, EmptyState, Field, Skeleton, Textarea, cx } from '@/components/ui';
import {
  CalendarIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ClockIcon,
  CreditCardIcon,
  InfoIcon,
} from '@/components/icons';
import type { Appointment, Slot } from '@/lib/types';

export default function DoctorDetailPage({ params }: { params: { id: string } }) {
  const { data: doctor, isLoading, isError } = useDoctor(params.id);
  const { data: slots, isLoading: loadingSlots } = useAvailability(params.id);
  const { session } = useAuth();
  const router = useRouter();
  const book = useBookAppointment();

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [reason, setReason] = useState('');
  const [booked, setBooked] = useState<Appointment | null>(null);

  // Agrupa slots por día (clave YYYY-MM-DD local)
  const days = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots ?? []) {
      const d = new Date(s.startAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [slots]);

  const activeDay = selectedDay ?? days[0]?.[0] ?? null;
  const activeSlots = days.find(([k]) => k === activeDay)?.[1] ?? [];

  async function confirm() {
    if (!selectedSlot) return;
    const appt = await book.mutateAsync({ doctorId: params.id, slot: selectedSlot, reason: reason || undefined });
    setBooked(appt);
  }

  if (isLoading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <Skeleton className="h-40" />
        <Skeleton className="mt-6 h-96" />
      </main>
    );
  }

  if (isError || !doctor) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <EmptyState
          title="No encontramos este médico"
          action={
            <Link href="/medicos">
              <Button variant="secondary">Volver a la búsqueda</Button>
            </Link>
          }
        />
      </main>
    );
  }

  // --- Estado de éxito -------------------------------------------------------
  if (booked) {
    const pending = booked.status === 'PENDING_PAYMENT';
    return (
      <main className="mx-auto max-w-lg px-4 py-16 sm:px-6">
        <Card className="animate-fade-up p-8 text-center">
          <div
            className={cx(
              'mx-auto flex h-14 w-14 items-center justify-center rounded-full',
              pending ? 'bg-warn-50 text-warn-600' : 'bg-success-50 text-success-600',
            )}
          >
            {pending ? <CreditCardIcon className="h-7 w-7" /> : <CheckCircleIcon className="h-7 w-7" />}
          </div>
          <h1 className="mt-4 text-xl font-semibold text-slate-900">
            {pending ? 'Falta un paso: pagá la seña' : '¡Turno confirmado!'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {formatDayLong(booked.startAt)} a las {formatTime(booked.startAt)} h con {doctor.firstName}{' '}
            {doctor.lastName}.
          </p>
          {pending && doctor.depositAmount && (
            <p className="mt-2 rounded-lg bg-warn-50 px-4 py-3 text-sm text-warn-800">
              Tenés 30 minutos para pagar la seña de {formatMoney(doctor.depositAmount, doctor.depositCurrency)}; si
              no, el horario se libera automáticamente.
            </p>
          )}
          <div className="mt-6 flex flex-col gap-3">
            {pending && (
              <a
                href={booked.checkoutUrl ?? '#'}
                className="inline-flex min-h-12 items-center justify-center rounded-lg bg-success-600 px-6 text-sm font-medium text-white transition-colors hover:bg-success-700"
              >
                Pagar seña con Mercado Pago
              </a>
            )}
            <Link href="/mis-turnos">
              <Button variant={pending ? 'secondary' : 'primary'} className="w-full">
                Ver mis turnos
              </Button>
            </Link>
          </div>
        </Card>
      </main>
    );
  }

  // --- Perfil + agenda ---------------------------------------------------------
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link
        href="/medicos"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Volver a la búsqueda
      </Link>

      {/* Perfil */}
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Avatar name={initials(doctor.firstName, doctor.lastName)} className="h-16 w-16 text-lg" />
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-slate-900">
              {doctor.firstName} {doctor.lastName}
            </h1>
            <p className="text-sm text-slate-500">{doctor.licenseNumber}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {doctor.specialties.map((s) => (
                <Badge key={s.id} tone="brand">
                  {s.name}
                </Badge>
              ))}
            </div>
            {doctor.bio && <p className="mt-3 text-sm leading-relaxed text-slate-600">{doctor.bio}</p>}
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
              <span className="flex items-center gap-1.5">
                <ClockIcon className="h-4 w-4 text-slate-400" />
                Consulta de {doctor.defaultSlotMinutes} min
              </span>
              <span className="flex items-center gap-1.5">
                <CreditCardIcon className="h-4 w-4 text-slate-400" />
                {doctor.requiresDeposit && doctor.depositAmount
                  ? `Seña de ${formatMoney(doctor.depositAmount, doctor.depositCurrency)}`
                  : 'Sin seña'}
              </span>
              <span className="flex items-center gap-1.5">
                <InfoIcon className="h-4 w-4 text-slate-400" />
                Cancelación gratis hasta {doctor.cancellationWindowHours} h antes
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Agenda */}
      <section className="mt-6" aria-label="Elegir horario">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <CalendarIcon className="h-5 w-5 text-brand-600" />
          Elegí un horario
        </h2>

        {loadingSlots && <Skeleton className="mt-4 h-64" />}

        {!loadingSlots && days.length === 0 && (
          <div className="mt-4">
            <EmptyState
              icon={<CalendarIcon className="h-8 w-8" />}
              title="Sin horarios disponibles en los próximos 14 días"
              description="El médico puede habilitar nuevos horarios en cualquier momento. Volvé a consultar más tarde."
            />
          </div>
        )}

        {!loadingSlots && days.length > 0 && (
          <Card className="mt-4 p-5">
            {/* Selector de día */}
            <div className="flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Días disponibles">
              {days.map(([key, daySlots]) => {
                const active = key === activeDay;
                return (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setSelectedDay(key);
                      setSelectedSlot(null);
                    }}
                    className={cx(
                      'flex min-h-16 min-w-24 shrink-0 flex-col items-center justify-center rounded-lg border px-3 py-2 transition-colors',
                      active
                        ? 'border-brand-500 bg-brand-50 text-brand-900'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    <span className="text-sm font-medium capitalize">{formatDayShort(daySlots[0].startAt)}</span>
                    <span className="mt-0.5 text-xs text-slate-500">{daySlots.length} horarios</span>
                  </button>
                );
              })}
            </div>

            {/* Slots del día */}
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
              {activeSlots.map((slot) => {
                const active = selectedSlot?.startAt === slot.startAt;
                return (
                  <button
                    key={slot.startAt}
                    onClick={() => setSelectedSlot(slot)}
                    aria-pressed={active}
                    className={cx(
                      'min-h-11 rounded-lg border text-sm font-medium tabular-nums transition-colors',
                      active
                        ? 'border-brand-500 bg-brand-500 text-white'
                        : 'border-slate-200 text-slate-700 hover:border-brand-200 hover:bg-brand-50',
                    )}
                  >
                    {formatTime(slot.startAt)}
                  </button>
                );
              })}
            </div>

            {/* Confirmación */}
            {selectedSlot && (
              <div className="mt-6 animate-fade-up border-t border-slate-200 pt-5">
                <p className="text-sm text-slate-600">
                  Turno seleccionado:{' '}
                  <strong className="capitalize text-slate-900">
                    {formatDayLong(selectedSlot.startAt)} · {formatTime(selectedSlot.startAt)} h
                  </strong>
                </p>

                {session?.role === 'PATIENT' || session === null ? (
                  <>
                    <div className="mt-4">
                      <Field
                        label="Motivo de consulta"
                        htmlFor="reason"
                        helper="Opcional — ayuda al médico a preparar la consulta"
                      >
                        <Textarea
                          id="reason"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Ej: control anual, dolor de espalda…"
                          maxLength={300}
                        />
                      </Field>
                    </div>

                    {doctor.requiresDeposit && doctor.depositAmount && (
                      <p className="mt-4 flex items-start gap-2 rounded-lg bg-warn-50 px-4 py-3 text-sm text-warn-800">
                        <CreditCardIcon className="mt-0.5 h-4 w-4 shrink-0" />
                        Este médico pide una seña de {formatMoney(doctor.depositAmount, doctor.depositCurrency)} para
                        confirmar. Se paga con Mercado Pago y se reembolsa si cancelás con más de{' '}
                        {doctor.cancellationWindowHours} h de anticipación.
                      </p>
                    )}

                    {book.isError && (
                      <p role="alert" className="mt-4 rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">
                        {book.error instanceof Error && book.error.message !== 'Failed to fetch'
                          ? book.error.message
                          : 'No pudimos reservar el turno. Probá con otro horario.'}
                      </p>
                    )}

                    <div className="mt-5">
                      {session ? (
                        <Button size="lg" onClick={confirm} loading={book.isPending} className="w-full sm:w-auto">
                          {doctor.requiresDeposit ? 'Reservar y pagar seña' : 'Confirmar turno'}
                        </Button>
                      ) : (
                        <div className="flex flex-col items-start gap-2">
                          <Button
                            size="lg"
                            onClick={() => router.push(`/login?volver=/medicos/${params.id}`)}
                            className="w-full sm:w-auto"
                          >
                            Ingresar para reservar
                          </Button>
                          <p className="text-xs text-slate-500">Necesitás una cuenta de paciente para reservar.</p>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="mt-4 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">
                    Estás con una cuenta de médico: para reservar un turno necesitás una cuenta de paciente.
                  </p>
                )}
              </div>
            )}
          </Card>
        )}
      </section>
    </main>
  );
}
