'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setDemoMode } from './api';
import { useQueryClient } from '@tanstack/react-query';
import type { Session, UserRole } from './types';

import { sessionFromAuth, type AuthResponse } from './auth-session';

interface AuthContextValue {
  session: Session | null;
  /** false mientras se lee localStorage en el primer render del cliente */
  ready: boolean;
  login: (email: string, password: string) => Promise<Session>;
  completeGoogleLogin: () => Promise<Session>;
  /** Crea la cuenta sin iniciar sesión: primero hay que confirmar el email. Devuelve el mensaje de la API. */
  register: (data: RegisterData) => Promise<string>;
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
  const [sessionEnded, setSessionEnded] = useState(false);

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
    if (s) setSessionEnded(false);
    queryClient.clear();
    setDemoMode(Boolean(s?.demo));
    persist(s);
    setSession(s);
    return s as Session;
  }, [queryClient]);

  useEffect(() => {
    const expired = () => { apply(null); setSessionEnded(true); };
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
      return apply(sessionFromAuth(res));
    },
    [apply],
  );

  const register = useCallback(
    async (data: RegisterData) => {
      const res = await api<{ message: string }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.message;
    },
    [],
  );

  const completeGoogleLogin = useCallback(async () => {
    setDemoMode(false);
    const res = await api<AuthResponse>(
      '/auth/google/complete', { method: 'POST', credentials: 'include' },
    );
    return apply(sessionFromAuth(res));
  }, [apply]);

  const logout = useCallback(() => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) void api('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }).catch(() => { });
    apply(null);
  }, [apply]);

  return (
    <AuthContext.Provider value={{ session, ready, login, completeGoogleLogin, register, demoLogin, logout }}>
      {sessionEnded && <p role="alert" className="bg-amber-50 p-4 text-center text-amber-900">Tu sesión terminó o tu cuenta dejó de estar activa. Volvé a ingresar; si tu cuenta está suspendida, contactá al administrador.</p>}
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
