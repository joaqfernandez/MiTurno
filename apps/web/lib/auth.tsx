'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, enableDemoMode } from './api';
import type { Session, UserRole } from './types';

interface AuthContextValue {
  session: Session | null;
  /** false mientras se lee localStorage en el primer render del cliente */
  ready: boolean;
  login: (email: string, password: string) => Promise<Session>;
  register: (data: RegisterData) => Promise<Session>;
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
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'miturno.session';

function persist(session: Session | null) {
  if (session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    localStorage.setItem('accessToken', session.accessToken);
  } else {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('accessToken');
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s: Session = JSON.parse(raw);
        setSession(s);
        if (s.demo) enableDemoMode();
      }
    } catch {
      /* sesión corrupta: se ignora */
    }
    setReady(true);
  }, []);

  const apply = useCallback((s: Session | null) => {
    persist(s);
    setSession(s);
    return s as Session;
  }, []);

  const demoLogin = useCallback(
    (role: UserRole) => {
      enableDemoMode();
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
      const res = await api<{ accessToken: string; user: { email: string; roles: UserRole[]; name?: string } }>(
        '/auth/login',
        { method: 'POST', body: JSON.stringify({ email, password }) },
      );
      return apply({
        accessToken: res.accessToken,
        role: res.user.roles.includes('DOCTOR') ? 'DOCTOR' : 'PATIENT',
        name: res.user.name ?? email,
        email,
      });
    },
    [apply],
  );

  const register = useCallback(
    async (data: RegisterData) => {
      const res = await api<{ accessToken: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return apply({
        accessToken: res.accessToken,
        role: data.role,
        name: `${data.firstName} ${data.lastName}`,
        email: data.email,
      });
    },
    [apply],
  );

  const logout = useCallback(() => {
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
