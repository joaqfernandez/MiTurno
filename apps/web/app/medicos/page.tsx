'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { DOCTORS_PAGE_SIZE, useDoctors, useSpecialties } from '@/lib/queries';
import { formatMoney, initials } from '@/lib/format';
import { Avatar, Badge, Button, Card, cx, EmptyState, Input, Select, Skeleton } from '@/components/ui';
import { AlertCircleIcon, ArrowRightIcon, ChevronLeftIcon, ChevronRightIcon, CreditCardIcon, SearchIcon, StethoscopeIcon } from '@/components/icons';
import type { Doctor } from '@/lib/types';

function DoctorCard({ doctor }: { doctor: Doctor }) {
  return (
    <Card className="flex flex-col overflow-hidden transition-shadow hover:shadow-card-hover">
      <div className="aspect-[4/5] w-full shrink-0 bg-brand-50">
        {doctor.photoUrl ? (
          <img
            src={doctor.photoUrl}
            alt={`${doctor.firstName} ${doctor.lastName}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Avatar name={initials(doctor.firstName, doctor.lastName)} className="h-24 w-24 text-3xl" />
          </div>
        )}
      </div>

      <div
        className={cx(
          'relative z-10 -mt-16 flex flex-1 flex-col rounded-t-3xl border-t border-white/60 bg-white/90 p-6 backdrop-blur-md',
          'shadow-[0_-12px_28px_-14px_rgba(15,23,42,0.35)] supports-[backdrop-filter]:bg-white/55',
        )}
      >
        <h2 className="text-lg font-semibold text-slate-900">
          {doctor.firstName} {doctor.lastName}
        </h2>
        <p className="text-xs text-slate-500">{doctor.licenseNumber}</p>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {doctor.specialties.map((s) => (
            <Badge key={s.id} tone="brand">
              {s.name}
            </Badge>
          ))}
        </div>

        {doctor.bio && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-slate-600">{doctor.bio}</p>}

        <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
          <CreditCardIcon className="h-3.5 w-3.5 shrink-0" />
          {doctor.requiresDeposit && doctor.depositAmount
            ? `Seña de ${formatMoney(doctor.depositAmount, doctor.depositCurrency)}`
            : 'Sin seña'}
        </p>

        <div className="mt-auto pt-5">
          <Link href={`/medicos/${doctor.id}`} className="block">
            <Button size="lg" className="w-full">
              Ver agenda
              <ArrowRightIcon className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}

function DoctorSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const specialty = params.get('specialty') ?? '';
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number.parseInt(params.get('pagina') ?? '1', 10) || 1);

  const [text, setText] = useState(q);
  const { data: specialties } = useSpecialties();
  const { data, isLoading, isError, isFetching, refetch } = useDoctors({ specialty: specialty || undefined, q: q || undefined, page });
  const doctors = data?.items;
  const pages = data ? Math.max(1, Math.ceil(data.total / DOCTORS_PAGE_SIZE)) : 1;

  // Cambiar un filtro vuelve a la página 1; la página queda en la URL para poder recargar o compartir.
  function updateParams(next: { specialty?: string; q?: string; page?: number }) {
    const sp = new URLSearchParams();
    const nextSpecialty = next.specialty ?? specialty;
    const nextQ = next.q ?? q;
    const nextPage = next.page ?? 1;
    if (nextSpecialty) sp.set('specialty', nextSpecialty);
    if (nextQ) sp.set('q', nextQ);
    if (nextPage > 1) sp.set('pagina', String(nextPage));
    router.replace(`/medicos${sp.size ? `?${sp}` : ''}`);
    if (next.page) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const specialtyName = specialties?.find((s) => s.slug === specialty)?.name;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
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
      {isError && !data ? (
        <div className="mt-6">
          <EmptyState
            icon={<AlertCircleIcon className="h-8 w-8" />}
            title="No pudimos cargar los médicos"
            description="Puede ser un problema de conexión. Probá de nuevo en unos segundos."
            action={
              <Button variant="secondary" onClick={() => refetch()} loading={isFetching}>
                Reintentar
              </Button>
            }
          />
        </div>
      ) : data && data.total > 0 && data.items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<StethoscopeIcon className="h-8 w-8" />}
            title="Esta página no tiene resultados"
            description="Puede que la lista haya cambiado desde que abriste el link."
            action={
              <Button variant="secondary" onClick={() => updateParams({ page: 1 })}>
                Ir a la primera página
              </Button>
            }
          />
        </div>
      ) : !isLoading && doctors?.length === 0 ? (
        <div className="mt-6">
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
        </div>
      ) : (
        <div
          className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3"
          aria-live="polite"
          aria-busy={isLoading}
        >
          {isLoading && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[28rem]" />)}
          {doctors?.map((d) => <DoctorCard key={d.id} doctor={d} />)}
        </div>
      )}

      {isError && data && (
        <p role="alert" className="mt-6 flex flex-wrap items-center gap-2 rounded-lg bg-danger-50 p-3 text-sm text-danger-600">
          <AlertCircleIcon className="h-4 w-4 shrink-0" />
          No pudimos cargar esta página.
          <button type="button" onClick={() => refetch()} className="font-medium underline">
            Reintentar
          </button>
        </p>
      )}

      {data && data.total > 0 && (
        <nav aria-label="Páginas de resultados" className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            {data.total === 1 ? '1 médico' : `${data.total} médicos`}
            {pages > 1 && ` · Página ${page} de ${pages}`}
          </p>
          {pages > 1 && (
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1 || isFetching} onClick={() => updateParams({ page: page - 1 })}>
                <ChevronLeftIcon className="h-4 w-4" />
                Anterior
              </Button>
              <Button variant="secondary" size="sm" disabled={page >= pages || isFetching} onClick={() => updateParams({ page: page + 1 })}>
                Siguiente
                <ChevronRightIcon className="h-4 w-4" />
              </Button>
            </div>
          )}
        </nav>
      )}
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
