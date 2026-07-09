'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSpecialties } from '@/lib/queries';
import { Button, Card, Select, Skeleton } from '@/components/ui';
import {
  ArrowRightIcon,
  CalendarIcon,
  CheckCircleIcon,
  CreditCardIcon,
  SearchIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  StethoscopeIcon,
} from '@/components/icons';

const STEPS = [
  {
    icon: SearchIcon,
    title: 'Buscá tu especialista',
    text: 'Filtrá por especialidad y encontrá al médico indicado con su agenda real, actualizada al instante.',
  },
  {
    icon: CalendarIcon,
    title: 'Elegí el horario',
    text: 'Ves solo los huecos libres. Reservás en dos clics y el turno queda confirmado al momento.',
  },
  {
    icon: SmartphoneIcon,
    title: 'Llevalo en tu calendario',
    text: 'El turno se sincroniza con Google Calendar o Apple Calendar y te llegan recordatorios.',
  },
];

const TRUST = [
  { icon: ShieldCheckIcon, text: 'Historia clínica cifrada y con acceso auditado' },
  { icon: CheckCircleIcon, text: 'Sin doble reserva: el horario que ves está libre' },
  { icon: CreditCardIcon, text: 'Seña online opcional con reembolso automático' },
];

export default function Home() {
  const router = useRouter();
  const { data: specialties, isLoading } = useSpecialties();
  const [specialty, setSpecialty] = useState('');

  function search(e: React.FormEvent) {
    e.preventDefault();
    router.push(specialty ? `/medicos?specialty=${specialty}` : '/medicos');
  }

  return (
    <main>
      {/* Hero */}
      <section className="border-b border-slate-200 bg-gradient-to-b from-brand-50 to-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl">
              Tu turno médico, <span className="text-brand-600">sin llamadas ni esperas</span>
            </h1>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-slate-600">
              Encontrá especialistas, mirá su disponibilidad real y reservá online. Recordatorios automáticos y tu
              historia clínica siempre protegida.
            </p>

            <form onSubmit={search} className="mt-8 flex flex-col gap-3 sm:flex-row" role="search">
              <div className="flex-1">
                <label htmlFor="specialty" className="sr-only">
                  Especialidad
                </label>
                {isLoading ? (
                  <Skeleton className="h-12 w-full" />
                ) : (
                  <Select
                    id="specialty"
                    value={specialty}
                    onChange={(e) => setSpecialty(e.target.value)}
                    className="min-h-12"
                  >
                    <option value="">Todas las especialidades</option>
                    {specialties?.map((s) => (
                      <option key={s.id} value={s.slug}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                )}
              </div>
              <Button type="submit" size="lg" className="sm:px-8">
                <SearchIcon className="h-5 w-5" />
                Buscar médicos
              </Button>
            </form>

            <ul className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-x-8">
              {TRUST.map(({ icon: I, text }) => (
                <li key={text} className="flex items-center gap-2 text-sm text-slate-600">
                  <I className="h-4 w-4 shrink-0 text-success-600" />
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-slate-900">Cómo funciona</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {STEPS.map(({ icon: I, title, text }, i) => (
            <Card key={title} className="p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <I className="h-5 w-5" />
              </div>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-brand-600">Paso {i + 1}</p>
              <h3 className="mt-1 font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Especialidades */}
      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex items-end justify-between">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Especialidades</h2>
            <Link href="/medicos" className="hidden items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 sm:flex">
              Ver todos los médicos
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(specialties ?? []).map((s) => (
              <Link
                key={s.id}
                href={`/medicos?specialty=${s.slug}`}
                className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-brand-200 hover:bg-brand-50"
              >
                <StethoscopeIcon className="h-5 w-5 shrink-0 text-slate-400 transition-colors group-hover:text-brand-600" />
                <span className="text-sm font-medium text-slate-700 group-hover:text-brand-900">{s.name}</span>
              </Link>
            ))}
            {isLoading && Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
          </div>
        </div>
      </section>

      {/* CTA médicos */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl bg-brand-900 px-6 py-12 text-center sm:px-12">
          <h2 className="text-2xl font-semibold tracking-tight text-white">¿Sos profesional de la salud?</h2>
          <p className="mx-auto mt-3 max-w-xl text-brand-100">
            Publicá tu agenda, cobrá señas para reducir ausencias y llevá la historia clínica de tus pacientes en un
            solo lugar. Tu calendario se sincroniza solo.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/registro?rol=medico"
              className="inline-flex min-h-12 items-center rounded-lg bg-white px-6 text-sm font-medium text-brand-900 transition-colors hover:bg-brand-50"
            >
              Crear cuenta de médico
            </Link>
            <Link
              href="/login"
              className="inline-flex min-h-12 items-center rounded-lg border border-brand-500 px-6 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              Ya tengo cuenta
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
