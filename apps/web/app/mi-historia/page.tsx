'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useMedicalRecord } from '@/lib/queries';
import { Card, EmptyState, PageHeader, Skeleton } from '@/components/ui';
import { formatDateTime } from '@/lib/format';

function Record({ patientId }: { patientId: string }) {
  const { data, isLoading, error } = useMedicalRecord(patientId);
  if (isLoading) return <Skeleton className="h-48" />;
  if (error) return <p role="alert">No pudimos cargar tu historia: {error.message}</p>;
  if (!data?.entries.length) return <EmptyState title="Todavía no hay evoluciones registradas" />;
  return <div className="space-y-4">{data.entries.map(entry => (
    <Card key={entry.id} className="p-5">
      <h2 className="font-semibold">{entry.title}</h2>
      <p className="mt-1 text-sm text-slate-500">{formatDateTime(entry.createdAt)} · {entry.doctor.firstName} {entry.doctor.lastName}</p>
      {entry.amendsEntryId && <p className="mt-2 text-sm">Enmienda de una evolución anterior.</p>}
      <p className="mt-3 whitespace-pre-wrap">{entry.content}</p>
    </Card>
  ))}</div>;
}

export default function MyRecordPage() {
  const { session, ready } = useAuth();
  return <main className="mx-auto max-w-4xl px-4 py-8">
    <PageHeader title="Mi historia clínica" subtitle="Evoluciones registradas por tus profesionales. El acceso queda auditado." />
    {!ready ? <Skeleton className="h-48" /> : session?.patientProfileId
      ? <Record patientId={session.patientProfileId} />
      : <p>Ingresá con una cuenta de paciente para consultar tu historia. <Link href="/login" className="underline">Ingresar</Link></p>}
  </main>;
}
