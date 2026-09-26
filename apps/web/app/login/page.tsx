'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Button, Card, Field, Input } from '@/components/ui';
import { StethoscopeIcon, UserIcon } from '@/components/icons';
import type { Session } from '@/lib/types';
import { safeReturnPath, startGoogleLogin } from '@/lib/google-auth';
import { api, ApiError } from '@/lib/api';

function LoginForm() {
  const { login, demoLogin } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = safeReturnPath(params.get('volver'));
  const googleError = params.get('google');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState<string | null>(null);

  function goAfterLogin(session: Session) {
    router.push(returnTo ?? (session.role === 'ADMIN' ? '/admin' : session.role === 'DOCTOR' ? '/panel' : '/mis-turnos'));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setUnverified(false);
    setResent(null);
    setLoading(true);
    try {
      const session = await login(email, password);
      if (googleError === 'account') {
        const { url } = await api<{ url: string }>('/auth/google/link', { method: 'POST', credentials: 'include' });
        window.location.assign(url);
      } else {
        goAfterLogin(session);
      }
    } catch (error) {
      setUnverified(error instanceof ApiError && error.code === 'EMAIL_NOT_VERIFIED');
      setError(error instanceof Error ? error.message : 'No pudimos iniciar sesión.');
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    try {
      const res = await api<{ message: string }>('/auth/email/resend', { method: 'POST', body: JSON.stringify({ email }) });
      setResent(res.message);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No pudimos reenviar el email.');
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col px-4 py-12 sm:py-16">
      <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-900">Ingresar</h1>
      <p className="mt-2 text-center text-sm text-slate-500">
        ¿No tenés cuenta?{' '}
        <Link href="/registro" className="font-medium text-brand-600 hover:text-brand-700">
          Registrate gratis
        </Link>
      </p>

      <Card className="mt-8 p-6">
        <Button type="button" variant="secondary" className="mb-4 w-full" onClick={() => startGoogleLogin(returnTo)}>
          Continuar con Google
        </Button>
        {googleError && (
          <p role="alert" className="mb-4 text-sm text-danger-700">
            {googleError === 'account'
              ? 'Para vincular Google a tu cuenta, ingresá con email y contraseña. Luego elegí en Google ese mismo email.'
              : 'No pudimos completar el acceso con Google. Volvé a intentarlo.'}
          </p>
        )}
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field label="Email" htmlFor="email" required>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
            />
          </Field>
          <Field label="Contraseña" htmlFor="password" required>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          <Link href="/recuperar-contrasena" className="-mt-2 self-end text-sm font-medium text-brand-600 hover:text-brand-700">
            ¿Olvidaste tu contraseña?
          </Link>

          {error && (
            <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">
              {error}
            </p>
          )}
          {unverified && (resent
            ? <p role="status" className="text-sm text-slate-600">{resent}</p>
            : <Button type="button" variant="secondary" onClick={resendVerification} className="w-full">Reenviar email de confirmación</Button>)}

          <Button type="submit" loading={loading} className="mt-1 w-full">
            {googleError === 'account' ? 'Ingresar y vincular Google' : 'Ingresar'}
          </Button>
        </form>
      </Card>

      <div className="mt-8">
        <p className="text-center text-xs font-medium uppercase tracking-wide text-slate-400">
          Solo para visualizar la app sin backend
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => goAfterLogin(demoLogin('PATIENT'))}>
            <UserIcon className="h-4 w-4" />
            Paciente demo
          </Button>
          <Button variant="secondary" onClick={() => goAfterLogin(demoLogin('DOCTOR'))}>
            <StethoscopeIcon className="h-4 w-4" />
            Médico demo
          </Button>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
