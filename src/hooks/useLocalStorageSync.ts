/**
 * Hook que escucha cambios en una clave de localStorage y devuelve
 * el valor actualizado. Funciona tanto para cambios en la misma pestaña
 * (polling) como en otras pestañas (storage event).
 */
import { useState, useEffect, useCallback, useRef } from 'react';

export function useLocalStorageValue<T>(
  key: string,
  parse: (raw: string | null) => T,
  defaultValue: T,
): T {
  // Guardamos parse y defaultValue en refs para que el read sea estable
  const parseRef = useRef(parse);
  parseRef.current = parse;
  const defaultRef = useRef(defaultValue);
  defaultRef.current = defaultValue;

  const read = useCallback((): T => {
    try {
      const raw = localStorage.getItem(key);
      return parseRef.current(raw);
    } catch {
      return defaultRef.current;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const [value, setValue] = useState<T>(read);

  useEffect(() => {
    // Escuchar cambios desde otras pestañas
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) setValue(read());
    };
    window.addEventListener('storage', onStorage);

    // Polling para cambios en la misma pestaña (localStorage no dispara
    // el evento "storage" en la misma pestaña que lo modifica)
    const interval = setInterval(() => {
      setValue(prev => {
        const next = read();
        // Solo actualizar si el valor cambió (comparación por JSON)
        return JSON.stringify(next) !== JSON.stringify(prev) ? next : prev;
      });
    }, 500);

    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(interval);
    };
  }, [key, read]); // read solo depende de key ahora, es estable

  return value;
}