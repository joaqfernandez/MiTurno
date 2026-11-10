import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Términos y privacidad' };

// Los textos definitivos se publican acá cuando los apruebe un abogado (borradores en docs/legal del repositorio).
const DOCUMENTS = [
  { id: 'terminos', title: 'Términos y condiciones', summary: 'Las reglas de uso de MiTurno para pacientes y para profesionales de la salud.' },
  { id: 'privacidad', title: 'Política de privacidad', summary: 'Qué datos guardamos, para qué los usamos, con quién se comparten y cómo ejercer tus derechos.' },
  { id: 'datos-de-salud', title: 'Autorización para tratar datos de salud', summary: 'El permiso que da cada paciente para que los profesionales que lo atienden registren y consulten su historia clínica.' },
];

export default function LegalPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Términos y privacidad</h1>
      <p role="note" className="mt-4 rounded-lg bg-warn-50 px-4 py-3 text-sm text-warn-800">
        Los textos definitivos están en revisión legal y todavía no están publicados. Esta versión de MiTurno es de prueba y no debe usarse con datos reales de pacientes.
      </p>
      <div className="mt-6 flex flex-col gap-5">
        {DOCUMENTS.map((document) => (
          <section key={document.id} id={document.id} className="scroll-mt-24">
            <h2 className="font-semibold text-slate-900">{document.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{document.summary}</p>
          </section>
        ))}
      </div>
      <p className="mt-8 text-sm"><Link className="text-brand-600 hover:underline" href="/">Volver al inicio</Link></p>
    </main>
  );
}
