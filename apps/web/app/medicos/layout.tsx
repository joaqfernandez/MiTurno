import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Buscar médicos y especialistas',
  description: 'Encontrá médicos y especialistas, consultá su disponibilidad y reservá tu turno online.',
  alternates: { canonical: '/medicos' },
  openGraph: {
    title: 'Buscar médicos y especialistas | MiTurno',
    description: 'Encontrá médicos y especialistas y reservá tu turno online.',
    url: '/medicos',
  },
};

export default function DoctorsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
