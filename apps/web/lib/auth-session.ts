import type { Session, UserRole } from './types';

export interface AuthResponse {
  accessToken: string | null;
  refreshToken: string | null;
  user: { email: string; roles: UserRole[]; name?: string; patientProfileId?: string | null };
}

export function sessionFromAuth(res: AuthResponse): Session {
  if (!res.accessToken || !res.refreshToken) throw new Error('La cuenta no tiene una sesión activa.');
  return {
    accessToken: res.accessToken,
    refreshToken: res.refreshToken,
    patientProfileId: res.user.patientProfileId ?? undefined,
    role: res.user.roles.includes('ADMIN') ? 'ADMIN' : res.user.roles.includes('DOCTOR') ? 'DOCTOR' : 'PATIENT',
    name: res.user.name ?? res.user.email,
    email: res.user.email,
  };
}
