'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { isToday, parseISO } from 'date-fns';
import { useDoctorAgenda } from '@/lib/queries';
import { formatDayLong, formatTime, initials } from '@/lib/format';
import { AppointmentStatusBadge } from '@/components/appointment-status';
import { Avatar, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui';
import { CalendarIcon, ClockIcon, UsersIcon } from '@/components/icons';
import type { Appointment } from '@/lib/types';

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

  const { today, upcoming, stats } = useMemo(() => {
    const list = (agenda ?? []).filter((a) => a.status !== 'CANCELLED_BY_PATIENT' && a.status !== 'CANCELLED_BY_DOCTOR');
    const todayList = list.filter((a) => isToday(parseISO(a.startAt))).sort((a, b) => a.startAt.localeCompare(b.startAt));
    const upcomingList = list
      .filter((a) => !isToday(parseISO(a.startAt)) && new Date(a.startAt) > new Date())
      .sort((a, b) => a.startAt.localeCompare(b.startAt));

    const uniquePatients = new Set(list.map((a) => a.patient?.id)).size;
    return {
      today: todayList,
      upcoming: upcomingList,
      stats: {
        today: todayList.length,
        pending: list.filter((a) => a.status === 'PENDING_PAYMENT').length,
        patients: uniquePatients,
      },
    };
  }, [agenda]);

  // Agrupa los próximos por día
  const upcomingByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of upcoming) {
      const key = formatDayLong(a.startAt);
      map.set(key, [...(map.get(key) ?? []), a]);
    }
    return [...map.entries()];
  }, [upcoming]);

  return (
    <main>
      <PageHeader title="Agenda" subtitle="Tus turnos de hoy y de los próximos días" />

      {isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat icon={ClockIcon} label="Turnos hoy" value={stats.today} />
            <Stat icon={CalendarIcon} label="Esperando seña" value={stats.pending} />
            <Stat icon={UsersIcon} label="Pacientes en agenda" value={stats.patients} />
          </div>

          <section className="mt-6" aria-label="Turnos de hoy">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Hoy</h2>
            {today.length === 0 ? (
              <EmptyState
                icon={<CalendarIcon className="h-8 w-8" />}
                title="No tenés turnos hoy"
                description="Los turnos que reserven tus pacientes van a aparecer acá."
              />
            ) : (
              <Card>
                <ul className="divide-y divide-slate-100">
                  {today.map((a) => (
                    <AgendaItem key={a.id} appt={a} />
                  ))}
                </ul>
              </Card>
            )}
          </section>

          {upcomingByDay.length > 0 && (
            <section className="mt-8" aria-label="Próximos turnos">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Próximos días</h2>
              <div className="flex flex-col gap-4">
                {upcomingByDay.map(([day, appts]) => (
                  <div key={day}>
                    <p className="mb-2 text-sm font-medium capitalize text-slate-700">{day}</p>
                    <Card>
                      <ul className="divide-y divide-slate-100">
                        {appts.map((a) => (
                          <AgendaItem key={a.id} appt={a} />
                        ))}
                      </ul>
                    </Card>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
