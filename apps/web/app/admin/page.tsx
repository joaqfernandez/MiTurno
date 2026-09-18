'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { Button, Card, PageHeader } from '@/components/ui';

interface DoctorReview { id: string; userId: string; firstName: string; lastName: string; licenseNumber: string; email: string; status: string }
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
      <div><h3 className="font-semibold">{doctor.firstName} {doctor.lastName}</h3><p>Matrícula: {doctor.licenseNumber}</p><p className="text-sm text-slate-500">{doctor.email} · {doctor.status}</p></div>
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
