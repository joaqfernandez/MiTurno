'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMyPatients } from '@/lib/queries';
import { formatDayShort, initials } from '@/lib/format';
import { Avatar, Card, EmptyState, Input, PageHeader, Skeleton } from '@/components/ui';
import { ChevronRightIcon, SearchIcon, UsersIcon } from '@/components/icons';

export default function PatientsPage() {
  const { data: patients, isLoading } = useMyPatients();
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const term = q.toLowerCase().trim();
    if (!term) return patients ?? [];
    return (patients ?? []).filter(
      (p) =>
        `${p.firstName} ${p.lastName}`.toLowerCase().includes(term) ||
        p.documentId?.toLowerCase().includes(term),
    );
  }, [patients, q]);

  return (
    <main>
      <PageHeader
        title="Mis pacientes"
        subtitle="Pacientes con al menos un turno en tu consultorio. Todo acceso a la historia clínica queda auditado."
      />

      <div className="relative mb-4 max-w-md">
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <label htmlFor="patient-search" className="sr-only">
          Buscar paciente por nombre o DNI
        </label>
        <Input
          id="patient-search"
          type="search"
          placeholder="Buscar por nombre o DNI…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-80" />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<UsersIcon className="h-8 w-8" />}
          title={q ? 'Sin resultados para esa búsqueda' : 'Todavía no tenés pacientes'}
          description={q ? 'Probá con otro nombre o número de documento.' : 'Cuando un paciente reserve su primer turno, va a aparecer acá.'}
        />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {filtered.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/panel/pacientes/${p.id}`}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50"
                >
                  <Avatar name={initials(p.firstName, p.lastName)} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">
                      {p.firstName} {p.lastName}
                    </p>
                    <p className="text-sm text-slate-500">
                      {p.documentId && `DNI ${p.documentId}`}
                      {p.healthInsurance && ` · ${p.healthInsurance}`}
                    </p>
                  </div>
                  <div className="hidden text-right sm:block">
                    {p.lastVisit && (
                      <p className="text-sm capitalize text-slate-600">Última visita: {formatDayShort(p.lastVisit)}</p>
                    )}
                    {p.visitCount != null && (
                      <p className="text-xs text-slate-400">
                        {p.visitCount} {p.visitCount === 1 ? 'consulta' : 'consultas'}
                      </p>
                    )}
                  </div>
                  <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-300" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </main>
  );
}
