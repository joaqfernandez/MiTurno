'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Button, Card, Field, Input } from '@/components/ui';

export default function RecoverPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<{ message: string }>('/auth/password/forgot', { method: 'POST', body: JSON.stringify({ email }) });
      setSent(res.message);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No pudimos procesar el pedido.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col px-4 py-12 sm:py-16">
      <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-900">Recuperar contraseña</h1>
      <p className="mt-2 text-center text-sm text-slate-500">Te enviamos un link para elegir una contraseña nueva.</p>
      <Card className="mt-8 p-6">
        {sent ? (
          <div role="status" className="flex flex-col gap-3 text-sm text-slate-700">
            <p>{sent}</p>
            <p className="text-slate-500">El link vence en 30 minutos y sirve una sola vez. Si no llega, revisá la carpeta de spam.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
            <Field label="Email de tu cuenta" htmlFor="email" required>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" />
            </Field>
            {error && <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{error}</p>}
            <Button type="submit" loading={loading} className="w-full">Enviar link</Button>
          </form>
        )}
      </Card>
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">Volver a ingresar</Link>
      </p>
    </main>
  );
}
