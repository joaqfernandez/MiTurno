'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAddRecordEntry, useMedicalRecord, useMyPatients } from '@/lib/queries';
import { initials } from '@/lib/format';
import { Avatar, Badge, Button, Card, Field, Input, PageHeader, Skeleton, Textarea } from '@/components/ui';
import { ChevronLeftIcon, FileTextIcon, PlusIcon, ShieldCheckIcon } from '@/components/icons';
import type { MedicalRecordEntry } from '@/lib/types';

function BaseDataItem({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{value || 'No registrado'}</dd>
    </div>
  );
}

function EntryCard({ entry, all }: { entry: MedicalRecordEntry; all: MedicalRecordEntry[] }) {
  const amended = entry.amendsEntryId ? all.find((e) => e.id === entry.amendsEntryId) : null;
  return (
    <li className="relative pl-8">
      {/* Línea de tiempo */}
      <span className="absolute left-0 top-1.5 flex h-4 w-4 items-center justify-center" aria-hidden="true">
        <span className="h-2.5 w-2.5 rounded-full border-2 border-brand-500 bg-white" />
      </span>
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-slate-900">{entry.title}</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {format(parseISO(entry.createdAt), "d 'de' MMMM yyyy, HH:mm 'h'", { locale: es })} — Dr/a.{' '}
              {entry.doctor.firstName} {entry.doctor.lastName}
            </p>
          </div>
          {entry.amendsEntryId && (
            <Badge tone="warn">Enmienda{amended ? ` de «${amended.title}»` : ''}</Badge>
          )}
        </div>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">{entry.content}</p>
      </Card>
    </li>
  );
}

export default function PatientRecordPage({ params }: { params: { id: string } }) {
  const { data: patients } = useMyPatients();
  const { data: record, isLoading } = useMedicalRecord(params.id);
  const addEntry = useAddRecordEntry(params.id);

  const patient = patients?.find((p) => p.id === params.id);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [amendsId, setAmendsId] = useState('');

  const entries = useMemo(
    () => [...(record?.entries ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [record],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    await addEntry.mutateAsync({
      title: title.trim(),
      content: content.trim(),
      amendsEntryId: amendsId || undefined,
    });
    setTitle('');
    setContent('');
    setAmendsId('');
    setShowForm(false);
  }

  return (
    <main>
      <Link
        href="/panel/pacientes"
        className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Volver a pacientes
      </Link>

      <PageHeader
        title={patient ? `${patient.firstName} ${patient.lastName}` : 'Historia clínica'}
        subtitle={
          patient
            ? [patient.documentId && `DNI ${patient.documentId}`, patient.healthInsurance].filter(Boolean).join(' · ')
            : undefined
        }
        action={
          <Button onClick={() => setShowForm((v) => !v)}>
            <PlusIcon className="h-4 w-4" />
            Nueva evolución
          </Button>
        }
      />

      {patient && (
        <div className="mb-6 flex items-center gap-3">
          <Avatar name={initials(patient.firstName, patient.lastName)} className="h-12 w-12 text-sm" />
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheckIcon className="h-4 w-4 text-success-600" />
            Acceso auditado: cada lectura y escritura queda registrada con fecha, usuario e IP.
          </p>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          {/* Datos de base */}
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Datos de base</h2>
            <dl className="grid gap-4 sm:grid-cols-3">
              <BaseDataItem label="Alergias" value={record?.allergies} />
              <BaseDataItem label="Condiciones crónicas" value={record?.chronicConditions} />
              <BaseDataItem label="Medicación actual" value={record?.currentMedication} />
            </dl>
          </Card>

          {/* Formulario nueva evolución */}
          {showForm && (
            <Card className="mt-5 animate-fade-up border-brand-200 p-5">
              <h2 className="text-sm font-semibold text-slate-900">Nueva evolución</h2>
              <p className="mt-1 text-xs text-slate-500">
                Las entradas son inmutables: no se editan ni se borran. Para corregir una entrada anterior, creá una
                enmienda que la referencie.
              </p>
              <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
                <Field label="Título" htmlFor="entry-title" required>
                  <Input
                    id="entry-title"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ej: Control trimestral"
                    maxLength={120}
                  />
                </Field>
                <Field label="Evolución clínica" htmlFor="entry-content" required>
                  <Textarea
                    id="entry-content"
                    required
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="min-h-32"
                    placeholder="Hallazgos, diagnóstico, indicaciones…"
                  />
                </Field>
                {entries.length > 0 && (
                  <Field
                    label="Enmienda de"
                    htmlFor="entry-amends"
                    helper="Solo si esta entrada corrige una anterior"
                  >
                    <select
                      id="entry-amends"
                      value={amendsId}
                      onChange={(e) => setAmendsId(e.target.value)}
                      className="block min-h-11 w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3.5 text-[15px] text-slate-900 focus:border-brand-500"
                    >
                      <option value="">No es una enmienda</option>
                      {entries.map((en) => (
                        <option key={en.id} value={en.id}>
                          {en.title} — {format(parseISO(en.createdAt), 'd/M/yyyy')}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <div className="flex justify-end gap-3">
                  <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" loading={addEntry.isPending}>
                    Firmar y guardar
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* Timeline */}
          <section className="mt-8" aria-label="Evoluciones">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Evoluciones ({entries.length})
            </h2>
            {entries.length === 0 ? (
              <Card className="flex flex-col items-center px-6 py-12 text-center">
                <FileTextIcon className="h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-900">Sin evoluciones registradas</p>
                <p className="mt-1 text-sm text-slate-500">Creá la primera entrada con «Nueva evolución».</p>
              </Card>
            ) : (
              <ul className="relative flex flex-col gap-4 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-slate-200">
                {entries.map((entry) => (
                  <EntryCard key={entry.id} entry={entry} all={entries} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
