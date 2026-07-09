'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Button, Card, Field, Input, cx } from '@/components/ui';
import { StethoscopeIcon, UserIcon } from '@/components/icons';
import type { UserRole } from '@/lib/types';

function RegisterForm() {
  const { register, demoLogin } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const [role, setRole] = useState<UserRole>(params.get('rol') === 'medico' ? 'DOCTOR' : 'PATIENT');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    licenseNumber: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    setLoading(true);
    try {
      const session = await register({ ...form, role });
      router.push(session.role === 'DOCTOR' ? '/panel' : '/medicos');
    } catch {
      setError('No pudimos crear la cuenta. Si el backend no está corriendo, podés explorar la app en modo demo.');
    } finally {
      setLoading(false);
    }
  }

  const roleOptions: Array<{ value: UserRole; label: string; icon: typeof UserIcon; hint: string }> = [
    { value: 'PATIENT', label: 'Soy paciente', icon: UserIcon, hint: 'Quiero reservar turnos' },
    { value: 'DOCTOR', label: 'Soy médico/a', icon: StethoscopeIcon, hint: 'Quiero publicar mi agenda' },
  ];

  return (
    <main className="mx-auto flex max-w-md flex-col px-4 py-12 sm:py-16">
      <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-900">Crear cuenta</h1>
      <p className="mt-2 text-center text-sm text-slate-500">
        ¿Ya tenés cuenta?{' '}
        <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
          Ingresá
        </Link>
      </p>

      <Card className="mt-8 p-6">
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <fieldset>
            <legend className="mb-2 block text-sm font-medium text-slate-700">Tipo de cuenta</legend>
            <div className="grid grid-cols-2 gap-3">
              {roleOptions.map(({ value, label, icon: I, hint }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRole(value)}
                  aria-pressed={role === value}
                  className={cx(
                    'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors',
                    role === value
                      ? 'border-brand-500 bg-brand-50 text-brand-900'
                      : 'border-slate-300 text-slate-600 hover:border-slate-400',
                  )}
                >
                  <I className={cx('h-5 w-5', role === value ? 'text-brand-600' : 'text-slate-400')} />
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-xs text-slate-500">{hint}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre" htmlFor="firstName" required>
              <Input id="firstName" autoComplete="given-name" required value={form.firstName} onChange={set('firstName')} />
            </Field>
            <Field label="Apellido" htmlFor="lastName" required>
              <Input id="lastName" autoComplete="family-name" required value={form.lastName} onChange={set('lastName')} />
            </Field>
          </div>

          <Field label="Email" htmlFor="email" required>
            <Input id="email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
          </Field>

          <Field label="Contraseña" htmlFor="password" required helper="Mínimo 8 caracteres">
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={form.password}
              onChange={set('password')}
            />
          </Field>

          {role === 'DOCTOR' && (
            <Field label="Matrícula" htmlFor="license" required helper="Ej: MN 112233 — se valida antes de publicar tu perfil">
              <Input id="license" required value={form.licenseNumber} onChange={set('licenseNumber')} />
            </Field>
          )}

          {error && (
            <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">
              {error}
            </p>
          )}

          <Button type="submit" loading={loading} className="mt-1 w-full">
            Crear cuenta
          </Button>

          <button
            type="button"
            onClick={() => {
              const s = demoLogin(role);
              router.push(s.role === 'DOCTOR' ? '/panel' : '/medicos');
            }}
            className="text-center text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            O explorá la app en modo demo
          </button>
        </form>
      </Card>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
