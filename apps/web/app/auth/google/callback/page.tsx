'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { GOOGLE_RETURN_KEY, safeReturnPath } from '@/lib/google-auth';
import type { Session } from '@/lib/types';

export default function GoogleCallbackPage() {
  const { completeGoogleLogin, ready } = useAuth();
  const router = useRouter();
  const pending = useRef<Promise<Session> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    // React StrictMode puede ejecutar el efecto dos veces: consumir la cookie una sola vez.
    pending.current ??= completeGoogleLogin();
    pending.current.then((session) => {
      if (!active) return;
      const returnTo = safeReturnPath(sessionStorage.getItem(GOOGLE_RETURN_KEY));
      sessionStorage.removeItem(GOOGLE_RETURN_KEY);
      router.replace(returnTo ?? (session.role === 'ADMIN' ? '/admin' : session.role === 'DOCTOR' ? '/panel' : '/mis-turnos'));
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [ready, completeGoogleLogin, router]);

  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-xl font-semibold">{failed ? 'No pudimos completar el acceso' : 'Ingresando a MiTurno…'}</h1>
      {failed && <Link className="mt-4 inline-block text-brand-600" href="/login">Volver a intentar</Link>}
    </main>
  );
}
