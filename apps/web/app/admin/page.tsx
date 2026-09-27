'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { Button, Card, Input, PageHeader } from '@/components/ui';

interface DoctorReview { id: string; userId: string; firstName: string; lastName: string; licenseNumber: string; email: string; status: string; slug: string | null }
interface PendingJob { id: string; kind: string; status: string; attempts: number; error?: string }

export default function AdminPage() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const enabled = session?.role === 'ADMIN';
  const doctors = useQuery({ queryKey: ['admin-doctors', session?.email], queryFn: () => api<DoctorReview[]>('/admin/doctors'), enabled });
  const jobs = useQuery({ queryKey: ['admin-jobs', session?.email], queryFn: () => api<PendingJob[]>('/admin/jobs'), enabled });
  const review = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api(`/admin/users/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-doctors'] }); },
  });
  const retry = useMutation({ mutationFn: (id: string) => api(`/admin/jobs/${id}/retry`, { method: 'POST' }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-jobs'] }); } });
  if (!enabled) return <main className="mx-auto max-w-4xl px-4 py-8">Ingresá con una cuenta administradora.</main>;
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
    <PageHeader title="Administración" subtitle="Verificación de profesionales y seguimiento de envíos pendientes." />
    <h2 className="text-lg font-semibold">Profesionales</h2>
    {doctors.data?.map(doctor => <Card key={doctor.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
      <div><h3 className="font-semibold">{doctor.firstName} {doctor.lastName}</h3><p>Matrícula: {doctor.licenseNumber}</p><p className="text-sm text-slate-500">{doctor.email} · {doctor.status}</p>
        {doctor.slug ? <p className="text-sm text-slate-500">Link: /{doctor.slug}</p> : <AssignLink doctor={doctor} />}</div>
      <Button disabled={review.isPending} onClick={() => review.mutate({ id: doctor.userId, status: doctor.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })}>{doctor.status === 'ACTIVE' ? 'Suspender' : 'Verificar y activar'}</Button>
    </Card>)}
    <h2 className="text-lg font-semibold">Trabajos pendientes</h2>
    <p className="text-sm text-slate-500">Los envíos requieren la configuración del proveedor. Un trabajo pendiente no significa que se haya enviado.</p>
    {jobs.data?.map(job => <Card key={job.id} className="flex items-center justify-between gap-4 p-4">
      <p>{job.kind} · {job.status} · {job.attempts} intentos {job.error && `· ${job.error}`}</p>
      {job.status !== 'RUNNING' && <Button variant="secondary" disabled={retry.isPending} onClick={() => retry.mutate(job.id)}>Reintentar</Button>}
    </Card>)}
  </main>;
}

/** Médicos cuyo nombre (y especialidad) ya estaba en uso: el administrador les asigna el link a mano. */
function AssignLink({ doctor }: { doctor: DoctorReview }) {
  const qc = useQueryClient();
  const [slug, setSlug] = useState('');
  const assign = useMutation({
    meta: { localError: true },
    mutationFn: () => api(`/admin/doctors/${doctor.id}/link`, { method: 'PUT', body: JSON.stringify({ slug: slug.trim().toLowerCase() }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-doctors'] }); },
  });
  return <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); assign.mutate(); }}>
    <span className="text-sm font-medium text-warn-800">Sin link</span>
    <Input aria-label={`Link para ${doctor.firstName} ${doctor.lastName}`} value={slug} maxLength={50} onChange={e => setSlug(e.target.value)} className="w-56" placeholder="nombre-del-link" />
    <Button type="submit" size="sm" variant="secondary" disabled={!slug.trim()} loading={assign.isPending}>Asignar link</Button>
    {assign.error && <p role="alert" className="w-full text-xs text-danger-600">{assign.error.message}</p>}
  </form>;
}
