/** Cliente del backend Python. El modo demo se activa únicamente por elección explícita. */
const BASE = process.env.NEXT_PUBLIC_API_URL ?? '';
let refreshing: Promise<boolean> | null = null;

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

function expireSession() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('miturno.session');
  window.dispatchEvent(new Event('miturno:session-expired'));
}

async function refreshSession(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return false;
  const response = await fetch(`${BASE}/api/auth/refresh`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
    body: JSON.stringify({ refreshToken }),
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) return false;
    throw new ApiError('No se pudo renovar la sesión. Intentá nuevamente.', response.status);
  }
  const tokens = await response.json();
  if (localStorage.getItem('refreshToken') !== refreshToken) {
    throw new ApiError('La sesión cambió durante la solicitud.', 409);
  }
  localStorage.setItem('accessToken', tokens.accessToken);
  localStorage.setItem('refreshToken', tokens.refreshToken);
  const raw = localStorage.getItem('miturno.session');
  if (raw) localStorage.setItem('miturno.session', JSON.stringify({ ...JSON.parse(raw), accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }));
  return true;
}

export async function apiResponse(path: string, init?: RequestInit): Promise<Response> {
  const originalToken = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const send = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    return fetch(`${BASE}/api${path}`, {
      ...init, credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
    });
  };
  let response = await send();
  if (response.status === 401 && !path.startsWith('/auth/') && typeof window !== 'undefined') {
    if (localStorage.getItem('accessToken') !== originalToken) throw new ApiError('La sesión cambió.', 409);
    if (!refreshing) refreshing = refreshSession().finally(() => { refreshing = null; });
    if (await refreshing) response = await send();
    else expireSession();
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = body?.message ?? body?.detail ?? response.statusText;
    throw new ApiError(Array.isArray(message) ? message.join('. ') : String(message), response.status);
  }
  return response;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiResponse(path, init);
  return response.status === 204 ? undefined as T : response.json();
}

export async function downloadCalendar(appointmentId: string) {
  const response = await apiResponse(`/calendar/appointments/${appointmentId}.ics`);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = 'turno.ics';
  link.click();
  URL.revokeObjectURL(url);
}

let demoMode = false;
const listeners = new Set<() => void>();
export function setDemoMode(enabled: boolean) {
  demoMode = enabled;
  listeners.forEach(listener => listener());
}
export function enableDemoMode() { setDemoMode(true); }
export function subscribeDemoMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function isDemoMode() { return demoMode; }
export async function withFallback<T>(call: () => Promise<T>, fallback: () => T): Promise<T> {
  return demoMode ? fallback() : call();
}
