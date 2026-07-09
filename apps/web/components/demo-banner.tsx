'use client';

import { useSyncExternalStore } from 'react';
import { isDemoMode, subscribeDemoMode } from '@/lib/api';
import { InfoIcon } from './icons';

/**
 * Aviso global que aparece cuando el backend no responde y la UI está
 * mostrando datos de demostración.
 */
export function DemoBanner() {
  const demo = useSyncExternalStore(subscribeDemoMode, isDemoMode, () => false);
  if (!demo) return null;
  return (
    <div className="border-b border-warn-600/20 bg-warn-50" role="status">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2 text-xs font-medium text-warn-800 sm:px-6">
        <InfoIcon className="h-4 w-4 shrink-0" />
        Modo demostración: el backend no está disponible, estás viendo datos de ejemplo. Todo lo que hagas es
        simulado.
      </div>
    </div>
  );
}
