'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { useDoctorAgenda } from '@/lib/queries';
import { formatTime, initials } from '@/lib/format';
import { AppointmentStatusBadge } from '@/components/appointment-status';
import { Avatar, Button, Card, EmptyState, PageHeader, Skeleton, cx } from '@/components/ui';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, UsersIcon } from '@/components/icons';
import type { Appointment } from '@/lib/types';

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const CANCELLED: Appointment['status'][] = ['CANCELLED_BY_PATIENT', 'CANCELLED_BY_DOCTOR'];
const MAX_VISIBLE_PER_DAY = 3;

function Stat({ icon: I, label, value }: { icon: typeof ClockIcon; label: string; value: string | number }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        <I className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xl font-semibold tabular-nums text-slate-900">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </Card>
  );
}

function AgendaItem({ appt }: { appt: Appointment }) {
  return (
    <li className="flex items-center gap-4 px-5 py-4">
      <div className="w-14 shrink-0 text-right">
        <p className="font-semibold tabular-nums text-slate-900">{formatTime(appt.startAt)}</p>
        <p className="text-xs tabular-nums text-slate-400">{formatTime(appt.endAt)}</p>
      </div>
      <div className="h-10 w-px bg-slate-200" aria-hidden="true" />
      {appt.patient && (
        <>
          <Avatar name={initials(appt.patient.firstName, appt.patient.lastName)} className="h-10 w-10 text-xs" />
          <div className="min-w-0 flex-1">
            <Link
              href={`/panel/pacientes/${appt.patient.id}`}
              className="font-medium text-slate-900 hover:text-brand-600"
            >
              {appt.patient.firstName} {appt.patient.lastName}
            </Link>
            {appt.reason && <p className="truncate text-sm text-slate-500">{appt.reason}</p>}
          </div>
        </>
      )}
      <AppointmentStatusBadge status={appt.status} />
    </li>
  );
}

export default function PanelHome() {
  const { data: agenda, isLoading } = useDoctorAgenda();
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  const active = useMemo(() => (agenda ?? []).filter((a) => !CANCELLED.includes(a.status)), [agenda]);

  const stats = useMemo(() => {
    const todayList = active.filter((a) => isToday(parseISO(a.startAt)));
    return {
      today: todayList.length,
      pending: active.filter((a) => a.status === 'PENDING_PAYMENT').length,
      patients: new Set(active.map((a) => a.patient?.id)).size,
    };
  }, [active]);

  const byDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of active) {
      const key = format(parseISO(a.startAt), 'yyyy-MM-dd');
      map.set(key, [...(map.get(key) ?? []), a].sort((x, y) => x.startAt.localeCompare(y.startAt)));
    }
    return map;
  }, [active]);

  const gridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(monthCursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(monthCursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [monthCursor]);

  function goToMonth(next: Date) {
    setMonthCursor(next);
    const key = format(next, 'yyyy-MM-dd');
    // si el día seleccionado no pertenece al nuevo mes, apuntamos al 1ro
    if (!isSameMonth(parseISO(selectedDay), next)) setSelectedDay(key);
  }

  const selectedAppointments = byDay.get(selectedDay) ?? [];
  const selectedLabel = format(parseISO(selectedDay), "EEEE d 'de' MMMM", { locale: es });

  return (
    <main>
      <PageHeader title="Agenda" subtitle="Tus turnos del mes, organizados por día" />

      {isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-96" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat icon={ClockIcon} label="Turnos hoy" value={stats.today} />
            <Stat icon={CalendarIcon} label="Esperando seña" value={stats.pending} />
            <Stat icon={UsersIcon} label="Pacientes en agenda" value={stats.patients} />
          </div>

          <Card className="mt-6 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold capitalize text-slate-900">
                {format(monthCursor, 'MMMM yyyy', { locale: es })}
              </h2>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const today = new Date();
                    setMonthCursor(startOfMonth(today));
                    setSelectedDay(format(today, 'yyyy-MM-dd'));
                  }}
                >
                  Hoy
                </Button>
                <button
                  type="button"
                  aria-label="Mes anterior"
                  onClick={() => goToMonth(subMonths(monthCursor, 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Mes siguiente"
                  onClick={() => goToMonth(addMonths(monthCursor, 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg bg-slate-200 text-center text-xs font-medium uppercase tracking-wide text-slate-400">
              {WEEKDAY_LABELS.map((d) => (
                <div key={d} className="bg-slate-50 py-2">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-b-lg bg-slate-200">
              {gridDays.map((day) => {
                const key = format(day, 'yyyy-MM-dd');
                const dayAppts = byDay.get(key) ?? [];
                const inMonth = isSameMonth(day, monthCursor);
                const selected = key === selectedDay;
                const today = isToday(day);
                const visible = dayAppts.slice(0, MAX_VISIBLE_PER_DAY);
                const hidden = dayAppts.length - visible.length;

                return (
                  <div
                    key={key}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedDay(key)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedDay(key);
                    }}
                    aria-pressed={selected}
                    aria-label={`${format(day, "d 'de' MMMM", { locale: es })}, ${dayAppts.length} turno(s)`}
                    className={cx(
                      'flex min-h-24 cursor-pointer flex-col gap-1 bg-white p-1.5 text-left transition-colors sm:min-h-28 sm:p-2',
                      !inMonth && 'bg-slate-50/60',
                      selected && 'ring-2 ring-inset ring-brand-500',
                    )}
                  >
                    <span
                      className={cx(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums',
                        today && 'bg-brand-500 text-white',
                        !today && inMonth && 'text-slate-700',
                        !today && !inMonth && 'text-slate-300',
                      )}
                    >
                      {format(day, 'd')}
                    </span>

                    <div className="flex flex-col gap-0.5">
                      {visible.map((a) => (
                        <Link
                          key={a.id}
                          href={a.patient ? `/panel/pacientes/${a.patient.id}` : '#'}
                          onClick={(e) => e.stopPropagation()}
                          className={cx(
                            'truncate rounded px-1 py-0.5 text-[11px] leading-tight hover:opacity-80',
                            a.status === 'PENDING_PAYMENT' ? 'bg-warn-50 text-warn-800' : 'bg-brand-50 text-brand-700',
                          )}
                        >
                          <span className="tabular-nums">{formatTime(a.startAt)}</span>{' '}
                          {a.patient ? `${a.patient.firstName} ${a.patient.lastName.charAt(0)}.` : 'Turno'}
                        </Link>
                      ))}
                      {hidden > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDay(key);
                          }}
                          className="truncate px-1 text-left text-[11px] font-medium text-slate-400 hover:text-brand-600"
                        >
                          +{hidden} más
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <section className="mt-6" aria-label={`Turnos del ${selectedLabel}`}>
            <h2 className="mb-3 text-sm font-semibold capitalize text-slate-500">{selectedLabel}</h2>
            {selectedAppointments.length === 0 ? (
              <EmptyState
                icon={<CalendarIcon className="h-8 w-8" />}
                title="No tenés turnos este día"
                description="Elegí otro día del calendario para ver sus turnos."
              />
            ) : (
              <Card>
                <ul className="divide-y divide-slate-100">
                  {selectedAppointments.map((a) => (
                    <AgendaItem key={a.id} appt={a} />
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </>
      )}
    </main>
  );
}
