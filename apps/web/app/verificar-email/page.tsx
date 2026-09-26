'use client';

import Link from 'next/link';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useLinkToken } from '@/lib/account-link';
import { Button, Card } from '@/components/ui';

export default function VerifyEmailPage() {
  const token = useLinkToken();
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Se confirma con un botón y no al abrir la página: los antivirus de correo abren
  // los links automáticamente y no deben poder gastarlos.
  async function confirm() {
    setError(null);
    setLoading(true);
    try {
      const res = await api<{ message: string }>('/auth/email/verify', { method: 'POST', body: JSON.stringify({ token }) });
      setDone(res.message);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No pudimos confirmar el email.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col px-4 py-12 sm:py-16">
      <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-900">Confirmar email</h1>
      <Card className="mt-8 p-6">
        {done ? (
          <div role="status" className="flex flex-col gap-4 text-sm text-slate-700">
            <p>{done}</p>
            <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">Ingresar</Link>
          </div>
        ) : token === null ? (
          <p role="alert" className="text-sm text-danger-700">
            El link está incompleto. Ingresá con tu email y contraseña para pedir uno nuevo.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-700">Tocá el botón para activar tu cuenta.</p>
            {error && (
              <p role="alert" className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">
                {error} Podés pedir otro desde <Link href="/login" className="font-medium underline">Ingresar</Link>.
              </p>
            )}
            <Button type="button" onClick={confirm} loading={loading} disabled={!token} className="w-full">Confirmar mi email</Button>
          </div>
        )}
      </Card>
    </main>
  );
}
