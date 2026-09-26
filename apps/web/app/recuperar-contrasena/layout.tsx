import type { Metadata } from 'next';

// no-referrer: ningún recurso de la página recibe la dirección desde la que se abrió el link.
export const metadata: Metadata = { title: 'Recuperar contraseña', robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default function RecoverLayout({ children }: { children: React.ReactNode }) {
  return children;
}
