'use client';

import { useEffect, useState } from 'react';

/**
 * Lee el token de un link enviado por email. Llega en el fragmento (#token=…), que el navegador
 * no envía a ningún servidor; apenas se lee, se borra de la barra de direcciones y del historial.
 * Devuelve undefined mientras se lee y null si el link no trae token.
 */
export function useLinkToken() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const read = () => {
      const found = new URLSearchParams(window.location.hash.slice(1)).get('token');
      if (found) {
        window.history.replaceState(null, '', window.location.pathname);
        setToken(found);
      } else {
        // En desarrollo React ejecuta el efecto dos veces: no pisar el token ya leído.
        setToken((current) => current ?? null);
      }
    };
    read();
    // Abrir otro link en la misma pestaña solo cambia el fragmento y no recarga la página.
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  return token;
}
