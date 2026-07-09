import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { Navbar } from '@/components/navbar';
import { DemoBanner } from '@/components/demo-banner';

export const metadata: Metadata = {
  title: {
    default: 'MiTurno — Turnos médicos online',
    template: '%s · MiTurno',
  },
  description: 'Buscá especialistas y reservá tu turno médico online, sin llamadas ni esperas.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="flex min-h-dvh flex-col antialiased">
        <Providers>
          <Navbar />
          <DemoBanner />
          <div className="flex-1">{children}</div>
          <footer className="border-t border-slate-200 bg-white">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-slate-500 sm:px-6">
              <p>MiTurno — Turnos médicos online</p>
              <p>Historia clínica protegida y auditada</p>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
