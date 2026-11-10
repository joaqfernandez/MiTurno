import Link from 'next/link';

export interface LegalChoices { acceptTerms: boolean; acceptHealthData: boolean }

/** Casillas de aceptación. Nunca vienen marcadas: la ley pide un consentimiento expreso. */
export function LegalCheckboxes({ value, onChange, terms = true, healthData }: {
  value: LegalChoices; onChange: (value: LegalChoices) => void; terms?: boolean; healthData: boolean;
}) {
  const box = 'mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300 accent-brand-600';
  return (
    <div className="flex flex-col gap-3 text-sm text-slate-700">
      {terms && (
        <label className="flex items-start gap-3">
          <input type="checkbox" className={box} checked={value.acceptTerms} onChange={(e) => onChange({ ...value, acceptTerms: e.target.checked })} />
          <span>
            Acepto los <Link className="text-brand-600 underline" href="/legal#terminos" target="_blank">términos y condiciones</Link> y la{' '}
            <Link className="text-brand-600 underline" href="/legal#privacidad" target="_blank">política de privacidad</Link>.
          </span>
        </label>
      )}
      {healthData && (
        <label className="flex items-start gap-3">
          <input type="checkbox" className={box} checked={value.acceptHealthData} onChange={(e) => onChange({ ...value, acceptHealthData: e.target.checked })} />
          <span>
            Autorizo a MiTurno y a los profesionales con los que reserve a tratar mis{' '}
            <Link className="text-brand-600 underline" href="/legal#datos-de-salud" target="_blank">datos de salud</Link> para gestionar mis turnos y mi historia clínica.
          </span>
        </label>
      )}
    </div>
  );
}
