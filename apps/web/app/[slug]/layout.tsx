import type { Metadata } from 'next';

// Links propios de médicos: se comparten a mano, no se indexan (decisión del fundador, Notion MT-25).
export const metadata: Metadata = {
  title: 'Sacar turno',
  robots: { index: false, follow: false },
};

export default function DoctorLinkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
