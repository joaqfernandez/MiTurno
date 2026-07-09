'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Button, EmptyState, cx } from '@/components/ui';
import { CalendarIcon, ClockIcon, LockIcon, SettingsIcon, UsersIcon } from '@/components/icons';

const NAV = [
  { href: '/panel', label: 'Agenda', icon: ClockIcon, exact: true },
  { href: '/panel/horarios', label: 'Mis horarios', icon: CalendarIcon },
  { href: '/panel/pacientes', label: 'Pacientes', icon: UsersIcon },
  { href: '/panel/configuracion', label: 'Configuración', icon: SettingsIcon },
];

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const { session, ready } = useAuth();
  const pathname = usePathname();

  if (ready && (!session || session.role !== 'DOCTOR')) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <EmptyState
          icon={<LockIcon className="h-8 w-8" />}
          title="Panel exclusivo para médicos"
          description="Ingresá con tu cuenta de médico para administrar tu agenda, pacientes e historia clínica."
          action={
            <Link href="/login?volver=/panel">
              <Button>Ingresar</Button>
            </Link>
          }
        />
      </main>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:py-8">
      {/* Navegación del panel: sidebar en desktop, tabs horizontales en mobile */}
      <nav
        aria-label="Secciones del panel"
        className="flex gap-1 overflow-x-auto lg:w-52 lg:shrink-0 lg:flex-col lg:overflow-visible"
      >
        {NAV.map(({ href, label, icon: I, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'flex min-h-11 shrink-0 items-center gap-2.5 rounded-lg px-3.5 text-sm font-medium transition-colors',
                active ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )}
            >
              <I className={cx('h-4.5 w-4.5 h-[18px] w-[18px]', active ? 'text-brand-600' : 'text-slate-400')} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
