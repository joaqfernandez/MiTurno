'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useDoctors, useSpecialties } from '@/lib/queries';
import { formatMoney, initials } from '@/lib/format';
import { Avatar, Badge, Button, Card, EmptyState, Input, Select, Skeleton } from '@/components/ui';
import { ArrowRightIcon, CreditCardIcon, SearchIcon, StethoscopeIcon } from '@/components/icons';
import type { Doctor } from '@/lib/types';

function DoctorCard({ doctor }: { doctor: Doctor }) {
  return (
    <Card className="flex flex-col p-5 transition-shadow hover:shadow-card-hover sm:flex-row sm:items-center sm:gap-5">
      <div className="flex flex-1 items-start gap-4">
        <Avatar name={initials(doctor.firstName, doctor.lastName)} className="h-14 w-14 text-base" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-slate-900">
            {doctor.firstName} {doctor.lastName}
          </h2>
          <p className="text-xs text-slate-500">{doctor.licenseNumber}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {doctor.specialties.map((s) => (
              <Badge key={s.id} tone="brand">
                {s.name}
              </Badge>
            ))}
          </div>
          {doctor.bio && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-600">{doctor.bio}</p>}
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <CreditCardIcon className="h-3.5 w-3.5" />
            {doctor.requiresDeposit && doctor.depositAmount
              ? `Reserva con seña de ${formatMoney(doctor.depositAmount, doctor.depositCurrency)} (se descuenta de la consulta)`
              : 'Sin seña — reservás y queda confirmado'}
          </p>
        </div>
      </div>
      <div className="mt-4 sm:mt-0 sm:shrink-0">
        <Link href={`/medicos/${doctor.id}`} className="block">
          <Button className="w-full sm:w-auto">
            Ver agenda
            <ArrowRightIcon className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </Card>
  );
}

function DoctorSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const specialty = params.get('specialty') ?? '';
  const q = params.get('q') ?? '';

  const [text, setText] = useState(q);
  const { data: specialties } = useSpecialties();
  const { data: doctors, isLoading } = useDoctors({ specialty: specialty || undefined, q: q || undefined });

  function updateParams(next: { specialty?: string; q?: string }) {
    const sp = new URLSearchParams();
    const nextSpecialty = next.specialty ?? specialty;
    const nextQ = next.q ?? q;
    if (nextSpecialty) sp.set('specialty', nextSpecialty);
    if (nextQ) sp.set('q', nextQ);
    router.replace(`/medicos${sp.size ? `?${sp}` : ''}`);
  }

  const specialtyName = specialties?.find((s) => s.slug === specialty)?.name;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {specialtyName ? `Especialistas en ${specialtyName}` : 'Buscar médicos'}
      </h1>
      <p className="mt-1 text-sm text-slate-500">Agenda real y actualizada: los horarios que ves están libres.</p>

      {/* Filtros */}
      <form
        className="mt-6 flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          updateParams({ q: text });
        }}
        role="search"
      >
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <label htmlFor="q" className="sr-only">
            Buscar por nombre o especialidad
          </label>
          <Input
            id="q"
            type="search"
            placeholder="Nombre del médico o especialidad…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="w-full sm:w-64">
          <label htmlFor="filter-specialty" className="sr-only">
            Filtrar por especialidad
          </label>
          <Select
            id="filter-specialty"
            value={specialty}
            onChange={(e) => updateParams({ specialty: e.target.value })}
          >
            <option value="">Todas las especialidades</option>
            {specialties?.map((s) => (
              <option key={s.id} value={s.slug}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary" className="sm:w-auto">
          Buscar
        </Button>
      </form>

      {/* Resultados */}
      <div className="mt-6 flex flex-col gap-4" aria-live="polite" aria-busy={isLoading}>
        {isLoading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36" />)}

        {!isLoading && doctors?.length === 0 && (
          <EmptyState
            icon={<StethoscopeIcon className="h-8 w-8" />}
            title="No encontramos médicos con esos filtros"
            description="Probá con otra especialidad o borrá la búsqueda."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setText('');
                  router.replace('/medicos');
                }}
              >
                Limpiar filtros
              </Button>
            }
          />
        )}

        {doctors?.map((d) => <DoctorCard key={d.id} doctor={d} />)}
      </div>
    </main>
  );
}

export default function DoctorsPage() {
  return (
    <Suspense>
      <DoctorSearch />
    </Suspense>
  );
}
