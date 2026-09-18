'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button } from './ui';

export function GoogleCalendarConnect() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get('calendar');
    if (status === 'ok') setResult('Google Calendar conectado.');
    if (status === 'error') setError('No pudimos conectar Google Calendar. Volvé a intentarlo.');
  }, []);

  async function connect() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const { url } = await api<{ url: string }>('/calendar/google/connect', { credentials: 'include' });
      window.location.assign(url);
    } catch {
      setError('No pudimos iniciar la conexión. Verificá tu sesión e intentá nuevamente.');
      setLoading(false);
    }
  }

  return (
    <div className="mt-3">
      <Button variant="secondary" onClick={connect} loading={loading}>Conectar Google Calendar</Button>
      {result && <p role="status" className="mt-2 text-sm text-success-600">{result}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-danger-700">{error}</p>}
    </div>
  );
}
