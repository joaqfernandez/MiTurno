'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useLinkToken } from '@/lib/account-link';
import { Button, Card, Field, Input } from '@/components/ui';

export default function ResetPasswordPage() {
  const token = useLinkToken();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    if (password !== confirmation) return setError('Las contraseñas no coinciden.');
    setLoading(true);
    try {
      const res = await api<{ message: string }>('/auth/password/reset', { method: 'POST', body: JSON.stringify({ token, password }) });
      setDone(res.message);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No pudimos cambiar la contraseña.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col px-4 py-12 sm:py-16">
      <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-900">Elegí una contraseña nueva</h1>
      <Card className="mt-8 p-6">
        {done ? (
          <div role="status" className="flex flex-col gap-4 text-sm text-slate-700">
            <p>{done}</p>
            <p className="text-slate-500">Por seguridad cerramos la sesión en todos tus dispositivos.</p>
            <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">Ingresar</Link>
          </div>
        ) : token === null ? (
          <p role="alert" className="text-sm text-danger-700">
            El link está incompleto. <Link href="/recuperar-contrasena" className="font-medium underline">Pedí uno nuevo</Link>.
          </p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <Field label="Contraseña nueva" htmlFor="password" required helper="Mínimo 8 caracteres. No puede contener tu email.">
              <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="Repetí la contraseña" htmlFor="confirmation" required>
              <Input id="confirmation" type="password" autoComplete="new-password" required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
            </Field>
            {error && (
              <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">
                {error}{' '}
                {error.includes('link') && <Link href="/recuperar-contrasena" className="font-medium underline">Pedir otro link</Link>}
              </p>
            )}
            <Button type="submit" loading={loading} disabled={!token} className="w-full">Guardar contraseña</Button>
          </form>
        )}
      </Card>
    </main>
  );
}
