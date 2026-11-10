'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, Card, Skeleton } from '@/components/ui';
import { LegalCheckboxes, type LegalChoices } from '@/components/legal-checkboxes';

interface Acceptance { version: string; pending: Array<'terms' | 'healthData'> }

/** Pantalla obligatoria para cuentas que todavía no aceptaron la versión vigente (por ejemplo, las creadas con Google). */
export default function AcceptTermsPage() {
  const { session, ready, logout } = useAuth();
  const router = useRouter();
  const [choices, setChoices] = useState<LegalChoices>({ acceptTerms: false, acceptHealthData: false });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const enabled = ready && Boolean(session) && !session?.demo;
  const { data, isLoading } = useQuery({
    queryKey: ['acceptance', session?.email], queryFn: () => api<Acceptance>('/auth/acceptance'), enabled, meta: { localError: true }, staleTime: 0,
  });
  const home = session?.role === 'ADMIN' ? '/admin' : session?.role === 'DOCTOR' ? '/panel' : '/mis-turnos';

  useEffect(() => {
    if (ready && !session) router.replace('/login');
    else if (session?.demo || (data && data.pending.length === 0)) router.replace(home);
  }, [ready, session, data, router, home]);

  if (!ready || !session || isLoading || !data || data.pending.length === 0) {
    return <main className="mx-auto max-w-md px-4 py-12"><Skeleton className="h-64" /></main>;
  }
  const needsTerms = data.pending.includes('terms');
  const needsHealth = data.pending.includes('healthData');
  const complete = (!needsTerms || choices.acceptTerms) && (!needsHealth || choices.acceptHealthData);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await api<Acceptance>('/auth/acceptance', { method: 'POST', body: JSON.stringify(choices) });
      router.replace(home);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No pudimos guardar tu aceptación.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Antes de continuar</h1>
      <p className="mt-2 text-sm text-slate-500">Para usar MiTurno necesitamos que leas y aceptes lo siguiente. Si no estás de acuerdo, podés salir.</p>
      <Card className="mt-6 p-6">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <LegalCheckboxes value={choices} onChange={setChoices} terms={needsTerms} healthData={needsHealth} />
          {error && <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{error}</p>}
          <Button type="submit" loading={saving} disabled={!complete}>Aceptar y continuar</Button>
          <Button type="button" variant="secondary" onClick={() => { logout(); router.replace('/'); }}>No acepto, salir</Button>
        </form>
      </Card>
    </main>
  );
}
