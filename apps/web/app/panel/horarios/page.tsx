'use client';

import { useEffect, useState } from 'react';
import { useSaveSchedule, useSchedule } from '@/lib/queries';
import { WEEKDAYS } from '@/lib/format';
import { Button, Card, Input, PageHeader, Skeleton, cx } from '@/components/ui';
import { CheckCircleIcon, PlusIcon, TrashIcon } from '@/components/icons';
import type { WeeklyBlock } from '@/lib/types';

// Orden lunes→domingo para mostrar (weekday 0 = domingo en el modelo)
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function SchedulePage() {
  const { data: schedule, isLoading } = useSchedule();
  const save = useSaveSchedule();

  const [blocks, setBlocks] = useState<WeeklyBlock[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (schedule && !dirty) setBlocks(schedule);
  }, [schedule, dirty]);

  function update(fn: (prev: WeeklyBlock[]) => WeeklyBlock[]) {
    setBlocks(fn);
    setDirty(true);
    setSaved(false);
  }

  function addBlock(weekday: number) {
    update((prev) => [...prev, { weekday, startTime: '09:00', endTime: '13:00' }]);
  }

  function removeBlock(block: WeeklyBlock) {
    update((prev) => prev.filter((b) => b !== block));
  }

  function editBlock(block: WeeklyBlock, patch: Partial<WeeklyBlock>) {
    update((prev) => prev.map((b) => (b === block ? { ...b, ...patch } : b)));
  }

  const invalid = blocks.some((b) => b.startTime >= b.endTime);

  async function handleSave() {
    await save.mutateAsync(blocks);
    setDirty(false);
    setSaved(true);
  }

  return (
    <main>
      <PageHeader
        title="Mis horarios"
        subtitle="Definí tu disponibilidad semanal. Los pacientes solo ven huecos dentro de estas franjas."
        action={
          <div className="flex items-center gap-3">
            {saved && !dirty && (
              <span className="flex items-center gap-1 text-sm text-success-600">
                <CheckCircleIcon className="h-4 w-4" />
                Guardado
              </span>
            )}
            <Button onClick={handleSave} loading={save.isPending} disabled={!dirty || invalid}>
              Guardar cambios
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="flex flex-col gap-3">
          {DAY_ORDER.map((weekday) => {
            const dayBlocks = blocks.filter((b) => b.weekday === weekday);
            const active = dayBlocks.length > 0;
            return (
              <Card key={weekday} className={cx('p-4', !active && 'bg-slate-50/50')}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className={cx('w-24 font-medium', active ? 'text-slate-900' : 'text-slate-400')}>
                    {WEEKDAYS[weekday]}
                  </h2>

                  <div className="flex flex-1 flex-col gap-2">
                    {dayBlocks.length === 0 && <p className="text-sm text-slate-400">Sin atención</p>}
                    {dayBlocks.map((block, i) => {
                      const bad = block.startTime >= block.endTime;
                      return (
                        <div key={i} className="flex flex-wrap items-center gap-2">
                          <label className="sr-only" htmlFor={`start-${weekday}-${i}`}>
                            Desde ({WEEKDAYS[weekday]})
                          </label>
                          <Input
                            id={`start-${weekday}-${i}`}
                            type="time"
                            value={block.startTime}
                            onChange={(e) => editBlock(block, { startTime: e.target.value })}
                            className={cx('w-32 tabular-nums', bad && 'border-danger-600')}
                          />
                          <span className="text-sm text-slate-400">a</span>
                          <label className="sr-only" htmlFor={`end-${weekday}-${i}`}>
                            Hasta ({WEEKDAYS[weekday]})
                          </label>
                          <Input
                            id={`end-${weekday}-${i}`}
                            type="time"
                            value={block.endTime}
                            onChange={(e) => editBlock(block, { endTime: e.target.value })}
                            className={cx('w-32 tabular-nums', bad && 'border-danger-600')}
                          />
                          <button
                            type="button"
                            onClick={() => removeBlock(block)}
                            aria-label={`Quitar franja de ${WEEKDAYS[weekday]}`}
                            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-danger-50 hover:text-danger-600"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                          {bad && (
                            <p role="alert" className="w-full text-xs text-danger-600">
                              La hora de inicio debe ser anterior a la de fin.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <Button variant="ghost" size="sm" onClick={() => addBlock(weekday)}>
                    <PlusIcon className="h-4 w-4" />
                    Agregar franja
                  </Button>
                </div>
              </Card>
            );
          })}

          <p className="mt-2 text-sm text-slate-500">
            ¿Vacaciones o un feriado? Los bloqueos puntuales por fecha se gestionan desde la API de excepciones
            (ScheduleOverride) — la pantalla llega en la próxima iteración.
          </p>
        </div>
      )}
    </main>
  );
}
