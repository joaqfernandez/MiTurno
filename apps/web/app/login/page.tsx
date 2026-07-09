'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Button, Card, Field, Input } from '@/components/ui';
import { StethoscopeIcon, UserIcon } from '@/components/icons';
import type { Session } from '@/lib/types';

function LoginForm() {
  const { login, demoLogin } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = params.get('volver');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function goAfterLogin(session: Session) {
    router.push(returnTo ?? (session.role === 'DOCTOR' ? '/panel' : '/mis-turnos'));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      goAfterLogin(await login(email, password));
    } catch {
      setError(
        'No pudimos iniciar sesión. Verificá tus datos o, si el backend no está corriendo, usá el acceso de demostración.',
      );
    } finally {
      setLoading(false);
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

          {error && (
            <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">
              {error}
            </p>
          )}

          <Button type="submit" loading={loading} className="mt-1 w-full">
            Ingresar
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
