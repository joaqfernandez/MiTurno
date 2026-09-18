'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setDemoMode } from './api';
import { useQueryClient } from '@tanstack/react-query';
import type { Session, UserRole } from './types';

interface AuthResponse {
  accessToken: string | null;
  refreshToken: string | null;
  user: { email: string; roles: UserRole[]; name?: string; patientProfileId?: string | null };
}

interface AuthContextValue {
  session: Session | null;
  /** false mientras se lee localStorage en el primer render del cliente */
  ready: boolean;
  login: (email: string, password: string) => Promise<Session>;
  register: (data: RegisterData) => Promise<Session | null>;
  demoLogin: (role: UserRole) => Session;
  logout: () => void;
}

export interface RegisterData {
  email: string;
  password: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  licenseNumber?: string;
  /** Obligatorio para pacientes: le permite al médico contactarlos ante una necesidad. */
  phone?: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'miturno.session';

function persist(session: Session | null) {
  if (session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    localStorage.setItem('accessToken', session.accessToken);
    if (session.refreshToken) localStorage.setItem('refreshToken', session.refreshToken);
    else localStorage.removeItem('refreshToken');
  } else {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s: Session = JSON.parse(raw);
        setSession(s);
        setDemoMode(Boolean(s.demo));
      }
    } catch {
      /* sesión corrupta: se ignora */
    }
    setReady(true);
  }, []);

  const apply = useCallback((s: Session | null) => {
    queryClient.clear();
    setDemoMode(Boolean(s?.demo));
    persist(s);
    setSession(s);
    return s as Session;
  }, [queryClient]);

  useEffect(() => {
    const expired = () => apply(null);
    window.addEventListener('miturno:session-expired', expired);
    return () => window.removeEventListener('miturno:session-expired', expired);
  }, [apply]);

  const demoLogin = useCallback(
    (role: UserRole) => {
      return apply({
        accessToken: 'demo-token',
        role,
        demo: true,
        name: role === 'DOCTOR' ? 'Dra. Valeria Roldán' : 'Ana Castro',
        email: role === 'DOCTOR' ? 'v.roldan@demo.miturno' : 'ana.castro@demo.miturno',
      });
    },
    [apply],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api<AuthResponse>(
        '/auth/login',
        { method: 'POST', body: JSON.stringify({ email, password }) },
      );
      return apply({
        accessToken: res.accessToken!,
        refreshToken: res.refreshToken ?? undefined,
        patientProfileId: res.user.patientProfileId ?? undefined,
        role: res.user.roles.includes('ADMIN') ? 'ADMIN' : res.user.roles.includes('DOCTOR') ? 'DOCTOR' : 'PATIENT',
        name: res.user.name ?? email,
        email,
      });
    },
    [apply],
  );

  const register = useCallback(
    async (data: RegisterData) => {
      const res = await api<AuthResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (!res.accessToken) return null;
      return apply({
        accessToken: res.accessToken!,
        refreshToken: res.refreshToken ?? undefined,
        patientProfileId: res.user.patientProfileId ?? undefined,
        role: data.role,
        name: `${data.firstName} ${data.lastName}`,
        email: data.email,
      });
    },
    [apply],
  );

  const logout = useCallback(() => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) void api('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }).catch(() => {});
    apply(null);
  }, [apply]);

  return (
    <AuthContext.Provider value={{ session, ready, login, register, demoLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
