export const GOOGLE_RETURN_KEY = 'miturno.google.return';

export function safeReturnPath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\s]/.test(value)) return null;
  return value;
}

export function startGoogleLogin(returnTo: string | null) {
  const safe = safeReturnPath(returnTo);
  if (safe) sessionStorage.setItem(GOOGLE_RETURN_KEY, safe);
  else sessionStorage.removeItem(GOOGLE_RETURN_KEY);
  window.location.assign(`${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/auth/google/start`);
}
