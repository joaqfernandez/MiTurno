'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from './home.module.css';
import { useSpecialties } from '@/lib/queries';
import { Button, Select, Skeleton } from '@/components/ui';
import {
  ArrowRightIcon,
  CalendarIcon,
  CheckCircleIcon,
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
    text: 'Consultá los horarios disponibles y elegí el que mejor se adapte a tu día.',
  },
  {
    icon: SmartphoneIcon,
    title: 'Tené todo a mano',
    text: 'Consultá tus próximos turnos y los detalles de cada consulta desde tu cuenta.',
  },
];

const TRUST = [
  { icon: ShieldCheckIcon, text: 'Historia clínica con acceso protegido' },
  { icon: CheckCircleIcon, text: 'Disponibilidad de turnos actualizada' },
  { icon: SmartphoneIcon, text: 'Reserva online desde cualquier lugar' },
];

export default function Home() {
  const router = useRouter();
  const { data: specialties, isLoading, isError } = useSpecialties();
  const [specialty, setSpecialty] = useState('');

  function search(e: React.FormEvent) {
    e.preventDefault();
    router.push(specialty ? `/medicos?specialty=${specialty}` : '/medicos');
  }

  return (
    <main className={styles.home}>
      <section className="border-b border-slate-200 bg-gradient-to-br from-brand-50 via-white to-slate-50">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
          <div className={styles.intro}>
            <p className="mb-5 flex items-center gap-2 text-sm font-medium text-brand-700">
              <span className="h-2 w-2 rounded-full bg-brand-500" aria-hidden="true" />
              Tu salud, más cerca
            </p>
            <h1 className="max-w-xl text-4xl font-semibold leading-[1.12] tracking-tight text-slate-900 sm:text-5xl lg:text-[3.5rem]">
              Tu turno médico,<br /><span className="text-brand-600">sin llamadas<br className="hidden lg:block" /> ni esperas.</span>
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-slate-600">
              Encontrá tu especialista, elegí un horario y reservá online. Un paso menos entre vos y tu próxima consulta.
            </p>
            <a href="#como-funciona" className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-brand-700 hover:underline">
              Conocé cómo funciona <ArrowRightIcon className="h-4 w-4" />
            </a>
          </div>

          <div className={`${styles.surface} ${styles.searchPanel} rounded-3xl bg-white p-6 sm:p-8`}>
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <CalendarIcon className="h-6 w-6" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">Encontrá tu próximo turno</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">Empezá por la especialidad que necesitás.</p>
            <form onSubmit={search} className="mt-6 space-y-3" role="search" aria-label="Buscar médicos">
              <label htmlFor="specialty" className="block text-sm font-medium text-slate-700">Especialidad</label>
              {isLoading ? (
                <div role="status"><span className="sr-only">Cargando especialidades</span><Skeleton className="h-12 w-full" /></div>
              ) : (
                <Select id="specialty" value={specialty} onChange={(e) => setSpecialty(e.target.value)} className="min-h-12">
                  <option value="">Todas las especialidades</option>
                  {specialties?.map((s) => <option key={s.id} value={s.slug}>{s.name}</option>)}
                </Select>
              )}
              <Button type="submit" size="lg" className={`${styles.pressable} w-full`}>
                <SearchIcon className="h-5 w-5" /> Buscar médicos
              </Button>
            </form>
            <p className="mt-4 text-center text-xs leading-relaxed text-slate-500">Explorá los profesionales antes de crear tu cuenta.</p>
            <div className="mt-6 border-t border-slate-100 pt-5">
              <p className="flex items-center gap-2 text-sm text-slate-600"><ShieldCheckIcon strokeWidth={1.5} className="h-4 w-4 shrink-0 text-brand-600" /> Tu información, con acceso protegido.</p>
            </div>
          </div>
          <ul className="flex flex-col gap-4 border-t border-slate-200 pt-6 sm:flex-row sm:flex-wrap sm:gap-x-8 lg:col-span-2">
            {TRUST.map(({ icon: I, text }) => (
              <li key={text} className="flex items-center gap-2 text-sm text-slate-600">
                <I strokeWidth={1.5} className="h-4 w-4 shrink-0 text-brand-600" />{text}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Cómo funciona */}
      <section id="como-funciona" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-brand-600">Simple, de principio a fin</p>
        <h2 className="mt-3 text-center text-3xl font-semibold tracking-tight text-slate-900">Tu consulta, en tres pasos</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {STEPS.map(({ icon: I, title, text }, i) => (
            <article key={title} className={`${styles.surface} rounded-2xl bg-white p-6`}>
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <I className="h-5 w-5" />
              </div>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-brand-600">Paso {i + 1}</p>
              <h3 className="mt-1 font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Especialidades */}
      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Especialidades</h2>
            <Link href="/medicos" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline">
              Ver todos los médicos
              <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 lg:grid-cols-4">
            {(specialties ?? []).map((s) => (
              <Link
                key={s.id}
                href={`/medicos?specialty=${s.slug}`}
                className={`${styles.surface} ${styles.specialty} group flex min-h-20 items-center gap-3 rounded-xl bg-white p-4`}
              >
                <StethoscopeIcon className="h-5 w-5 shrink-0 text-brand-600" />
                <span className="text-sm font-medium text-slate-700 group-hover:text-brand-900">{s.name}</span>
              </Link>
            ))}
            {isLoading && <div role="status" className="contents"><span className="sr-only">Cargando especialidades</span>{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>}
            {!isLoading && !specialties?.length && <p role="status" className="col-span-full rounded-xl bg-slate-50 p-6 text-sm text-slate-600">{isError ? 'No pudimos cargar las especialidades. Podés intentar desde el listado de médicos.' : 'Todavía no hay especialidades disponibles.'}</p>}
          </div>
        </div>
      </section>

      {/* CTA médicos */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="rounded-3xl bg-brand-900 px-6 py-12 text-center sm:px-12">
          <h2 className="text-2xl font-semibold tracking-tight text-white">¿Sos profesional de la salud?</h2>
          <p className="mx-auto mt-3 max-w-xl text-brand-100">
            Publicá tu agenda, cobrá señas para reducir ausencias y llevá la historia clínica de tus pacientes en un
            solo lugar. Tu calendario se sincroniza solo.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/registro?rol=medico"
              className={`${styles.pressable} inline-flex min-h-12 items-center rounded-lg bg-white px-6 text-sm font-medium text-brand-900 hover:bg-brand-50`}
            >
              Crear cuenta de médico
            </Link>
            <Link
              href="/login"
              className={`${styles.pressable} inline-flex min-h-12 items-center rounded-lg border border-brand-500 px-6 text-sm font-medium text-white hover:bg-brand-700`}
            >
              Ya tengo cuenta
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
