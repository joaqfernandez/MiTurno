'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { addDays, addWeeks, format, startOfDay, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/lib/auth';
import { useAvailability, useBookAppointment, useDoctor } from '@/lib/queries';
import { formatDayLong, formatMoney, formatTime, formatWeekdays, initials, WEEKDAYS_SHORT } from '@/lib/format';
import { Avatar, Badge, Button, Card, EmptyState, Field, Skeleton, Textarea, cx } from '@/components/ui';
import {
  CalendarIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  CreditCardIcon,
  InfoIcon,
  LockIcon,
  MapPinIcon,
  NavigationIcon,
} from '@/components/icons';
import type { Appointment, DoctorLocation, Slot } from '@/lib/types';

/** Convierte una clave "yyyy-MM-dd" (día local) al ISO del mediodía local, para formatDayLong/formatDayShort. */
function localDayKeyToIso(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
}

function DoctorLocations({
  locations,
  activeId,
  onSelect,
}: {
  locations: DoctorLocation[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (locations.length === 0) return null;

  const active = locations.find((l) => l.id === activeId) ?? locations[0];

  const mapSrc = `https://www.google.com/maps?q=${encodeURIComponent(active.address)}&output=embed`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(active.address)}`;

  return (
    <section aria-label="Dónde atiende">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
        <MapPinIcon className="h-5 w-5 text-brand-600" />
        Dónde atiende
      </h2>

      <Card className="mt-3 overflow-hidden p-0">
        {locations.length > 1 && (
          <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3" role="tablist" aria-label="Ubicaciones">
            {locations.map((loc) => {
              const isActive = loc.id === active.id;
              return (
                <button
                  key={loc.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onSelect(loc.id)}
                  className={cx(
                    'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                    isActive
                      ? 'border-brand-500 bg-brand-50 text-brand-900'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                  )}
                >
                  <span className="block font-medium">{loc.name}</span>
                  <span className="block text-xs text-slate-500">{formatWeekdays(loc.weekdays)}</span>
                </button>
              );
            })}
          </div>
        )}

        <iframe
          key={active.id}
          title={`Mapa: ${active.name}`}
          src={mapSrc}
          className="h-64 w-full border-0 sm:h-80"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />

        <div className="p-5">
          <p className="font-medium text-slate-900">{active.name}</p>
          <p className="mt-1 text-sm text-slate-600">{active.address}</p>
          <p className="mt-1 text-xs text-slate-500">Atiende ahí: {formatWeekdays(active.weekdays)}</p>
          {active.notes && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 px-3.5 py-3 text-sm text-slate-600">
              <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              {active.notes}
            </p>
          )}
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
          >
            <NavigationIcon className="h-4 w-4" />
            Cómo llegar
          </a>
        </div>
      </Card>
    </section>
  );
}

function WeeklyAvailability({
  daysMap,
  activeLocation,
  loading,
  selectedDay,
  onSelectDay,
}: {
  daysMap: Map<string, Slot[]>;
  activeLocation: DoctorLocation | null;
  loading: boolean;
  selectedDay: string | null;
  onSelectDay: (day: string) => void;
}) {
  const today = startOfDay(new Date());
  const maxDate = addDays(today, 13); // ventana de disponibilidad: próximos 14 días
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today, { weekStartsOn: 1 }));

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const canGoPrev = weekStart.getTime() > startOfWeek(today, { weekStartsOn: 1 }).getTime();
  const canGoNext = addWeeks(weekStart, 1).getTime() <= maxDate.getTime();

  return (
    <section aria-label="Elegí un día">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
        <CalendarIcon className="h-5 w-5 text-brand-600" />
        Elegí un día
      </h2>

      <Card className="mt-3 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-medium capitalize text-slate-700">
            {format(weekStart, "d MMM", { locale: es })} – {format(addDays(weekStart, 6), "d MMM", { locale: es })}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={!canGoPrev}
              onClick={() => setWeekStart((w) => addWeeks(w, -1))}
              aria-label="Semana anterior"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!canGoNext}
              onClick={() => setWeekStart((w) => addWeeks(w, 1))}
              aria-label="Semana siguiente"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {weekDays.map((date) => {
              const key = format(date, 'yyyy-MM-dd');
              const isPast = date.getTime() < today.getTime();
              const attends = !activeLocation || activeLocation.weekdays.includes(date.getDay());
              const blocked = isPast || !attends;
              const daySlots = daysMap.get(key) ?? [];
              const selected = key === selectedDay;

              return (
                <button
                  key={key}
                  type="button"
                  disabled={blocked}
                  aria-pressed={selected}
                  aria-label={
                    blocked
                      ? `${format(date, "EEEE d", { locale: es })}, no disponible`
                      : `${format(date, "EEEE d", { locale: es })}, ${daySlots.length} horarios`
                  }
                  onClick={() => onSelectDay(key)}
                  className={cx(
                    'flex min-h-20 flex-col items-center justify-center gap-1 rounded-lg border px-1 py-2 text-center transition-colors',
                    blocked && 'cursor-not-allowed border-dashed border-slate-200 bg-slate-50 text-slate-300',
                    !blocked && !selected &&
                      'border-slate-200 text-slate-700 hover:border-brand-300 hover:bg-brand-50',
                    !blocked && selected && 'border-brand-500 bg-brand-500 text-white',
                  )}
                >
                  <span className="text-[11px] font-medium uppercase tracking-wide opacity-80">
                    {WEEKDAYS_SHORT[date.getDay()]}
                  </span>
                  <span className="text-base font-semibold tabular-nums">{format(date, 'd')}</span>
                  {blocked ? (
                    <LockIcon className="h-3 w-3" />
                  ) : (
                    <span className="text-[10px] tabular-nums opacity-80">
                      {daySlots.length > 0 ? `${daySlots.length} hs` : 'Sin cupos'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {activeLocation && (
          <p className="mt-3 text-xs text-slate-500">
            Atiende en <strong className="font-medium text-slate-700">{activeLocation.name}</strong> los{' '}
            {formatWeekdays(activeLocation.weekdays).toLowerCase()}.
          </p>
        )}
      </Card>
    </section>
  );
}

export default function DoctorDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: doctor, isLoading, isError } = useDoctor(params.id);
  const { data: slots, isLoading: loadingSlots } = useAvailability(params.id);
  const { session } = useAuth();
  const router = useRouter();
  const book = useBookAppointment();

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [reason, setReason] = useState('');
  const [booked, setBooked] = useState<Appointment | null>(null);
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);

  const locations = doctor?.locations ?? [];
  const activeLocation = locations.find((l) => l.id === activeLocationId) ?? locations[0] ?? null;

  function selectLocation(id: string) {
    setActiveLocationId(id);
    setSelectedDay(null);
    setSelectedSlot(null);
  }

  // Agrupa slots por día (clave YYYY-MM-DD local), filtrando por los días en
  // que el médico atiende en la ubicación elegida (si tiene más de una)
  const daysMap = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots ?? []) {
      const d = new Date(s.startAt);
      if (activeLocation && !activeLocation.weekdays.includes(d.getDay())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return map;
  }, [slots, activeLocation]);

  const sortedDayKeys = useMemo(() => [...daysMap.keys()].sort(), [daysMap]);
  const activeDay = selectedDay ?? sortedDayKeys[0] ?? null;
  const activeSlots = activeDay ? daysMap.get(activeDay) ?? [] : [];

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

      <div
        className={cx('mt-6 grid grid-cols-1 gap-6', locations.length > 0 && 'lg:grid-cols-2 lg:items-start')}
      >
          {locations.length > 0 && (
            <DoctorLocations locations={locations} activeId={activeLocation?.id ?? null} onSelect={selectLocation} />
          )}

          <div className="flex flex-col gap-6">
            <WeeklyAvailability
              daysMap={daysMap}
              activeLocation={activeLocation}
              loading={loadingSlots}
              selectedDay={activeDay}
              onSelectDay={(day) => {
                setSelectedDay(day);
                setSelectedSlot(null);
              }}
            />

            {/* Horarios del día elegido */}
            <section aria-label="Horarios disponibles">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                <ClockIcon className="h-5 w-5 text-brand-600" />
                Horarios disponibles
              </h2>

              {!loadingSlots && sortedDayKeys.length === 0 && (
                <div className="mt-4">
                  <EmptyState
                    icon={<CalendarIcon className="h-8 w-8" />}
                    title="Sin horarios disponibles en los próximos 14 días"
                    description="El médico puede habilitar nuevos horarios en cualquier momento. Volvé a consultar más tarde."
                  />
                </div>
              )}

              {!loadingSlots && sortedDayKeys.length > 0 && (
                <Card className="mt-4 p-5">
                  {activeSlots.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No quedan horarios libres{activeDay ? ` el ${formatDayLong(localDayKeyToIso(activeDay))}` : ''}.
                      Elegí otro día habilitado en el calendario de arriba.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
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
                  )}

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
                              Este médico pide una seña de{' '}
                              {formatMoney(doctor.depositAmount, doctor.depositCurrency)} para confirmar. Se paga con
                              Mercado Pago y se reembolsa si cancelás con más de {doctor.cancellationWindowHours} h de
                              anticipación.
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
                              <Button
                                size="lg"
                                onClick={confirm}
                                loading={book.isPending}
                                className="w-full sm:w-auto"
                              >
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
                                <p className="text-xs text-slate-500">
                                  Necesitás una cuenta de paciente para reservar.
                                </p>
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
          </div>
        </div>
    </main>
  );
}
