'use client';

import { useEffect, useState } from 'react';
import { useMyLink, useSaveMyLink } from '@/lib/queries';
import { Button, Card, Field, Input } from '@/components/ui';
import { CheckCircleIcon, CopyIcon, LinkIcon } from '@/components/icons';

/** Link propio del médico para compartir con sus pacientes; se puede cambiar y los links anteriores siguen funcionando. */
export function DoctorLinkCard() {
  const { data: link, isLoading } = useMyLink();
  const save = useSaveMyLink();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (link?.slug) setDraft(link.slug);
  }, [link?.slug]);

  async function copy() {
    if (!link?.url) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      /* clipboard bloqueado: el médico puede copiar el link manualmente */
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaved(false);
    try {
      await save.mutateAsync(draft.trim().toLowerCase());
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
    }
  }

  const unchanged = draft.trim().toLowerCase() === (link?.slug ?? '');

  return (
    <Card className="p-6">
      <h2 className="flex items-center gap-2 font-semibold text-slate-900">
        <LinkIcon className="h-5 w-5 text-brand-600" />
        Tu link para pacientes
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Compartilo con tus pacientes: abre directamente tu agenda para sacar turno. No aparece en Google.
      </p>

      {isLoading ? null : link?.url ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <code aria-label="Tu link" className="min-w-0 flex-1 truncate rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-800">
            {link.url}
          </code>
          <Button variant="secondary" size="sm" onClick={copy} className="min-h-10">
            {copied ? <CheckCircleIcon className="h-4 w-4 text-success-600" /> : <CopyIcon className="h-4 w-4" />}
            {copied ? 'Copiado' : 'Copiar link'}
          </Button>
        </div>
      ) : (
        <p role="status" className="mt-4 rounded-lg bg-warn-50 p-3 text-sm text-warn-800">
          Todavía no tenés link: ya hay otro profesional con tu nombre. Elegí uno abajo o esperá a que el equipo de MiTurno te asigne uno.
        </p>
      )}

      <form onSubmit={handleSave} className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <Field
            label="Cambiar el nombre del link"
            htmlFor="doctor-link"
            error={error || undefined}
            helper="Letras minúsculas, números y guiones. Si ya lo compartiste, el link anterior sigue funcionando."
          >
            <Input id="doctor-link" value={draft} maxLength={50} onChange={(e) => { setDraft(e.target.value); setError(''); setSaved(false); }} />
          </Field>
        </div>
        <Button type="submit" variant="secondary" loading={save.isPending} disabled={!draft.trim() || unchanged}>
          Guardar link
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-success-600">
            <CheckCircleIcon className="h-4 w-4" />
            Link actualizado
          </span>
        )}
      </form>
    </Card>
  );
}
