/**
 * Hook para persistir la configuración de "últimos N meses" del promedio
 * en el módulo de Volúmenes.
 *
 * ESTRATEGIA DE PERSISTENCIA (doble capa):
 * 1. localStorage  → lectura/escritura instantánea, sin latencia
 * 2. Supabase (app_config) → fuente de verdad compartida entre dispositivos/sesiones
 *
 * Al guardar: escribe en localStorage primero (UI inmediata) y luego en Supabase.
 * Al leer:    usa localStorage como caché; si está vacío, carga desde Supabase.
 *
 * El embed externo lee el valor directamente desde la edge function (Supabase),
 * por lo que siempre obtiene el valor correcto sin depender de localStorage.
 */
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export type VolTipo = 'recibido' | 'despachado';

const STORAGE_KEY = 'vol_promedio_lastN';
const SUPABASE_CONFIG_KEY = 'vol_promedio_lastN';

export interface VolPromedioConfig {
  recibido: number;   // 0 = todos los meses
  despachado: number; // 0 = todos los meses
}

// ── Helpers de localStorage ───────────────────────────────────────────────────
function readLocalConfig(): VolPromedioConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { recibido: 0, despachado: 0 };
    const parsed = JSON.parse(raw) as Partial<VolPromedioConfig>;
    return {
      recibido: typeof parsed.recibido === 'number' ? parsed.recibido : 0,
      despachado: typeof parsed.despachado === 'number' ? parsed.despachado : 0,
    };
  } catch {
    return { recibido: 0, despachado: 0 };
  }
}

function writeLocalConfig(cfg: VolPromedioConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // silently ignore
  }
}

// ── Helpers de Supabase ───────────────────────────────────────────────────────
async function readSupabaseConfig(): Promise<VolPromedioConfig | null> {
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', SUPABASE_CONFIG_KEY)
      .maybeSingle();
    if (error || !data) return null;
    const v = data.value as Partial<VolPromedioConfig>;
    return {
      recibido: typeof v.recibido === 'number' ? v.recibido : 0,
      despachado: typeof v.despachado === 'number' ? v.despachado : 0,
    };
  } catch {
    return null;
  }
}

async function writeSupabaseConfig(cfg: VolPromedioConfig): Promise<void> {
  try {
    await supabase
      .from('app_config')
      .upsert(
        { key: SUPABASE_CONFIG_KEY, value: cfg, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      );
  } catch {
    // silently ignore — localStorage ya tiene el valor
  }
}

// ── Función pública para leer lastN (usada por formulaVariables.ts) ───────────
/** Lee el lastN guardado para un tipo dado (sin React, para uso en formulaVariables) */
export function readLastN(tipo: VolTipo): number {
  return readLocalConfig()[tipo];
}

/** Lee ambos lastN guardados */
export function readAllLastN(): VolPromedioConfig {
  return readLocalConfig();
}

// ── Hook principal ────────────────────────────────────────────────────────────
export function useVolumenesPromedioConfig(tipo: VolTipo) {
  const [lastN, setLastNState] = useState<number>(() => readLocalConfig()[tipo]);

  // Al montar: sincronizar desde Supabase si localStorage está vacío o desactualizado
  useEffect(() => {
    readSupabaseConfig().then((remote) => {
      if (!remote) return;
      // Actualizar localStorage con el valor de Supabase (fuente de verdad)
      writeLocalConfig(remote);
      setLastNState(remote[tipo]);
    });
  }, [tipo]);

  const setLastN = useCallback((n: number) => {
    setLastNState(n);
    // 1. Escribir en localStorage inmediatamente (UI sin latencia)
    const current = readLocalConfig();
    const updated: VolPromedioConfig = { ...current, [tipo]: n };
    writeLocalConfig(updated);
    // 2. Persistir en Supabase (fuente de verdad compartida)
    writeSupabaseConfig(updated);
  }, [tipo]);

  return { lastN, setLastN };
}
