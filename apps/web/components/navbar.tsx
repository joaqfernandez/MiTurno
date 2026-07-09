'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Button, cx } from './ui';
import { LogOutIcon, LogoMark, MenuIcon, XIcon } from './icons';

export function Navbar() {
  const { session, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const links = [
    { href: '/medicos', label: 'Buscar médicos', show: session?.role !== 'DOCTOR' },
    { href: '/mis-turnos', label: 'Mis turnos', show: session?.role === 'PATIENT' },
    { href: '/panel', label: 'Panel médico', show: session?.role === 'DOCTOR' },
  ].filter((l) => l.show);

  function handleLogout() {
    logout();
    setOpen(false);
    router.push('/');
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6" aria-label="Principal">
        <Link href="/" className="flex items-center gap-2.5 font-semibold text-slate-900">
          <LogoMark className="h-8 w-8" />
          <span className="text-lg tracking-tight">
            Mi<span className="text-brand-600">Turno</span>
          </span>
        </Link>

        {/* Desktop */}
        <div className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={pathname.startsWith(l.href) ? 'page' : undefined}
              className={cx(
                'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                pathname.startsWith(l.href)
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )}
            >
              {l.label}
            </Link>
          ))}

          {session ? (
            <div className="ml-3 flex items-center gap-3 border-l border-slate-200 pl-4">
              <span className="max-w-40 truncate text-sm text-slate-600" title={session.name}>
                {session.name}
              </span>
              <Button variant="secondary" size="sm" onClick={handleLogout}>
                <LogOutIcon className="h-4 w-4" />
                Salir
              </Button>
            </div>
          ) : (
            <div className="ml-3 flex items-center gap-2 border-l border-slate-200 pl-4">
              <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
                Ingresar
              </Link>
              <Button size="sm" onClick={() => router.push('/registro')}>
                Crear cuenta
              </Button>
            </div>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden"
          aria-expanded={open}
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <XIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={cx(
                  'rounded-lg px-3 py-2.5 text-sm font-medium',
                  pathname.startsWith(l.href) ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-100',
                )}
              >
                {l.label}
              </Link>
            ))}
            {session ? (
              <>
                <div className="mt-1 border-t border-slate-200 px-3 pb-1 pt-3 text-xs text-slate-500">
                  {session.name}
                </div>
                <button
                  onClick={handleLogout}
                  className="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Cerrar sesión
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Ingresar
                </Link>
                <Link
                  href="/registro"
                  onClick={() => setOpen(false)}
                  className="rounded-lg bg-brand-500 px-3 py-2.5 text-center text-sm font-medium text-white"
                >
                  Crear cuenta
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
