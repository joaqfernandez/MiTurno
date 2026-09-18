'use client';

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { AuthProvider } from '@/lib/auth';

export function Providers({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState('');
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: error => setError(error.message) }),
        mutationCache: new MutationCache({ onError: error => setError(error.message) }),
        defaultOptions: {
          queries: {
            retry: 0,
            refetchOnWindowFocus: false,
            staleTime: 30_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        {error && <div role="alert" className="flex items-center justify-between gap-4 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{error}</span><button onClick={() => setError('')} aria-label="Cerrar aviso">Cerrar</button>
        </div>}
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
}
