'use client';

import { useEffect, useState } from 'react';
import { useDoctorSettings, useSaveDoctorSettings } from '@/lib/queries';
import { Button, Card, Field, Input, PageHeader, Select, Skeleton, cx } from '@/components/ui';
import { CalendarIcon, CheckCircleIcon, CopyIcon, CreditCardIcon, SmartphoneIcon } from '@/components/icons';
import type { DoctorSettings } from '@/lib/types';

const ICS_URL = 'webcal://api.miturno.app/api/calendar/feed/tu-token-privado.ics';

function Toggle({
  checked,
  onChange,
  label,
  description,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
  id: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="cursor-pointer text-sm font-medium text-slate-900">
          {label}
        </label>
        <p className="mt-0.5 text-sm text-slate-500">{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors',
          checked ? 'bg-brand-500' : 'bg-slate-300',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { data, isLoading } = useDoctorSettings();
  const save = useSaveDoctorSettings();

  const [form, setForm] = useState<DoctorSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  function patch(p: Partial<DoctorSettings>) {
    setForm((f) => (f ? { ...f, ...p } : f));
    setSaved(false);
  }

  async function handleSave() {
    if (!form) return;
    await save.mutateAsync(form);
    setSaved(true);
  }

  async function copyIcs() {
    try {
      await navigator.clipboard.writeText(ICS_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      /* clipboard bloqueado: el usuario puede copiar manualmente */
    }
  }

  if (isLoading || !form) {
    return (
      <main>
        <PageHeader title="Configuración" />
        <Skeleton className="h-96" />
      </main>
    );
  }

  return (
    <main>
      <PageHeader
        title="Configuración"
        subtitle="Seña, duración de turnos y sincronización de calendario"
        action={
          <div className="flex items-center gap-3">
            {saved && (
              <span className="flex items-center gap-1 text-sm text-success-600">
                <CheckCircleIcon className="h-4 w-4" />
                Guardado
              </span>
            )}
            <Button onClick={handleSave} loading={save.isPending}>
              Guardar cambios
            </Button>
          </div>
        }
      />

      <div className="flex flex-col gap-5">
        {/* Seña */}
        <Card className="p-6">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <CreditCardIcon className="h-5 w-5 text-brand-600" />
            Seña de reserva
          </h2>
          <div className="mt-4 flex flex-col gap-5">
            <Toggle
              id="requires-deposit"
              checked={form.requiresDeposit}
              onChange={(v) => patch({ requiresDeposit: v })}
              label="Pedir seña para confirmar turnos"
              description="Reduce ausencias: el turno queda confirmado recién cuando el paciente paga con Mercado Pago."
            />
            {form.requiresDeposit && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Monto de la seña (ARS)" htmlFor="deposit-amount" required>
                  <Input
                    id="deposit-amount"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={500}
                    value={form.depositAmount ?? ''}
                    onChange={(e) => patch({ depositAmount: e.target.value ? Number(e.target.value) : undefined })}
                  />
                </Field>
                <Field
                  label="Cancelación con reembolso"
                  htmlFor="cancel-window"
                  helper="Si el paciente cancela antes de esta ventana, la seña se devuelve sola"
                >
                  <Select
                    id="cancel-window"
                    value={form.cancellationWindowHours}
                    onChange={(e) => patch({ cancellationWindowHours: Number(e.target.value) })}
                  >
                    {[6, 12, 24, 48, 72].map((h) => (
                      <option key={h} value={h}>
                        Hasta {h} h antes del turno
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
          </div>
        </Card>

        {/* Turnos */}
        <Card className="p-6">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <CalendarIcon className="h-5 w-5 text-brand-600" />
            Turnos
          </h2>
          <div className="mt-4 max-w-xs">
            <Field label="Duración por defecto" htmlFor="slot-minutes" helper="Podés ajustarla por franja horaria en «Mis horarios»">
              <Select
                id="slot-minutes"
                value={form.defaultSlotMinutes}
                onChange={(e) => patch({ defaultSlotMinutes: Number(e.target.value) })}
              >
                {[15, 20, 30, 45, 60].map((m) => (
                  <option key={m} value={m}>
                    {m} minutos
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>

        {/* Calendario */}
        <Card className="p-6">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <SmartphoneIcon className="h-5 w-5 text-brand-600" />
            Calendario en tu celular
          </h2>
          <div className="mt-4 flex flex-col gap-6">
            <div>
              <h3 className="text-sm font-medium text-slate-900">Google Calendar</h3>
              <p className="mt-1 text-sm text-slate-500">
                Conectá tu cuenta y cada turno confirmado se crea (y se borra) solo en tu calendario. Los tokens se
                guardan cifrados.
              </p>
              <a
                href="/api/calendar/google/connect"
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
              >
                Conectar Google Calendar
              </a>
            </div>
            <div className="border-t border-slate-200 pt-5">
              <h3 className="text-sm font-medium text-slate-900">iPhone / Apple Calendar / Outlook</h3>
              <p className="mt-1 text-sm text-slate-500">
                Suscribite a este enlace desde tu calendario y se actualiza solo. Si el enlace se filtra, podés rotar
                el token.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <code className="flex-1 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
                  {ICS_URL}
                </code>
                <Button variant="secondary" size="sm" onClick={copyIcs} className="min-h-10">
                  {copied ? <CheckCircleIcon className="h-4 w-4 text-success-600" /> : <CopyIcon className="h-4 w-4" />}
                  {copied ? 'Copiado' : 'Copiar'}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}
