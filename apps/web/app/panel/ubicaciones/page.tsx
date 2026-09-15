'use client';

import { useEffect, useState } from 'react';
import { useDoctorLocations, useSaveDoctorLocations } from '@/lib/queries';
import { WEEKDAYS_SHORT } from '@/lib/format';
import { Button, Card, Field, Input, PageHeader, Skeleton, Textarea, cx } from '@/components/ui';
import { CheckCircleIcon, MapPinIcon, PlusIcon, TrashIcon } from '@/components/icons';
import type { DoctorLocation } from '@/lib/types';

// Lunes(1)→domingo(0) para mostrar los días en orden habitual
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function emptyLocation(): DoctorLocation {
  return { id: `loc-new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: '', address: '', notes: '', weekdays: [] };
}

function LocationCard({
  location,
  onChange,
  onRemove,
  canRemove,
}: {
  location: DoctorLocation;
  onChange: (patch: Partial<DoctorLocation>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const missingName = location.name.trim() === '';
  const missingAddress = location.address.trim() === '';
  const missingDays = location.weekdays.length === 0;

  function toggleDay(day: number) {
    const has = location.weekdays.includes(day);
    onChange({ weekdays: has ? location.weekdays.filter((d) => d !== day) : [...location.weekdays, day].sort() });
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <MapPinIcon className="h-5 w-5" />
        </div>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Eliminar ubicación"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-danger-50 hover:text-danger-600"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <Field label="Nombre del lugar" htmlFor={`name-${location.id}`} required error={missingName ? 'Ingresá un nombre' : undefined}>
          <Input
            id={`name-${location.id}`}
            value={location.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="Ej: Consultorio particular, Hospital Italiano…"
          />
        </Field>
        <Field label="Dirección" htmlFor={`address-${location.id}`} required error={missingAddress ? 'Ingresá una dirección' : undefined}>
          <Input
            id={`address-${location.id}`}
            value={location.address}
            onChange={(e) => onChange({ address: e.target.value })}
            placeholder="Calle, número, piso, ciudad"
          />
        </Field>
      </div>

      <div className="mt-4">
        <Field
          label="Indicaciones para llegar"
          htmlFor={`notes-${location.id}`}
          helper="Piso, entrada, consultorio, referencias — sobre todo útil si es un hospital o clínica grande"
        >
          <Textarea
            id={`notes-${location.id}`}
            value={location.notes ?? ''}
            onChange={(e) => onChange({ notes: e.target.value })}
            placeholder="Ej: Ingresar por la entrada de Emergencias, subir al 3er piso, consultorio 12."
            maxLength={400}
          />
        </Field>
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-sm font-medium text-slate-700">
          Días que atendés acá
          <span className="text-danger-600" aria-hidden="true">
            {' '}
            *
          </span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {DAY_ORDER.map((day) => {
            const active = location.weekdays.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={active}
                onClick={() => toggleDay(day)}
                className={cx(
                  'min-h-9 rounded-lg border px-3 text-sm font-medium transition-colors',
                  active
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-slate-300 text-slate-600 hover:border-slate-400 hover:bg-slate-50',
                )}
              >
                {WEEKDAYS_SHORT[day]}
              </button>
            );
          })}
        </div>
        {missingDays && <p role="alert" className="mt-1.5 text-xs text-danger-600">Elegí al menos un día.</p>}
      </div>
    </Card>
  );
}

export default function LocationsPage() {
  const { data, isLoading } = useDoctorLocations();
  const save = useSaveDoctorLocations();

  const [locations, setLocations] = useState<DoctorLocation[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data && !dirty) setLocations(data);
  }, [data, dirty]);

  function update(fn: (prev: DoctorLocation[]) => DoctorLocation[]) {
    setLocations(fn);
    setDirty(true);
    setSaved(false);
  }

  function addLocation() {
    update((prev) => [...prev, emptyLocation()]);
  }

  function patchLocation(id: string, patch: Partial<DoctorLocation>) {
    update((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function removeLocation(id: string) {
    update((prev) => prev.filter((l) => l.id !== id));
  }

  const invalid = locations.some((l) => l.name.trim() === '' || l.address.trim() === '' || l.weekdays.length === 0);

  async function handleSave() {
    await save.mutateAsync(locations);
    setDirty(false);
    setSaved(true);
  }

  return (
    <main>
      <PageHeader
        title="Ubicaciones"
        subtitle="Dónde atendés cada día — tus pacientes ven el mapa y las indicaciones al reservar un turno."
        action={
          <div className="flex items-center gap-3">
            {saved && !dirty && (
              <span className="flex items-center gap-1 text-sm text-success-600">
                <CheckCircleIcon className="h-4 w-4" />
                Guardado
              </span>
            )}
            <Button onClick={handleSave} loading={save.isPending} disabled={!dirty || invalid || locations.length === 0}>
              Guardar cambios
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="flex flex-col gap-4">
          {locations.map((loc) => (
            <LocationCard
              key={loc.id}
              location={loc}
              onChange={(patch) => patchLocation(loc.id, patch)}
              onRemove={() => removeLocation(loc.id)}
              canRemove={locations.length > 1}
            />
          ))}

          <Button variant="secondary" onClick={addLocation} className="self-start">
            <PlusIcon className="h-4 w-4" />
            Agregar ubicación
          </Button>

          {locations.length > 1 && (
            <p className="text-sm text-slate-500">
              Si atendés en más de un lugar según el día, tus pacientes van a ver automáticamente la ubicación que
              corresponde a la fecha que elijan.
            </p>
          )}
        </div>
      )}
    </main>
  );
}
