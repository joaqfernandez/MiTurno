/**
 * Cliente HTTP mínimo hacia el backend NestJS.
 * Si el backend no responde, los hooks de lib/queries.ts caen a datos de
 * demostración (lib/demo-data.ts) y se enciende el "modo demo" global.
 */
const BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.message ?? res.statusText, res.status);
  }
  return res.json();
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

// --- Modo demo global -------------------------------------------------------
// Flag observable con useSyncExternalStore (ver components/demo-banner.tsx).

let demoMode = false;
const listeners = new Set<() => void>();

export function enableDemoMode() {
  if (!demoMode) {
    demoMode = true;
    listeners.forEach((l) => l());
  }
}

export function subscribeDemoMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isDemoMode() {
  return demoMode;
}

/**
 * Ejecuta una llamada real; si la red o el backend fallan (no errores 4xx de
 * negocio), devuelve el fallback demo y activa el modo demo.
 */
export async function withFallback<T>(call: () => Promise<T>, fallback: () => T): Promise<T> {
  try {
    return await call();
  } catch (err) {
    // Errores de negocio reales (validación, conflicto de slot) se propagan.
    if (err instanceof ApiError && err.status !== 401 && err.status < 500) throw err;
    enableDemoMode();
    return fallback();
  }
}
