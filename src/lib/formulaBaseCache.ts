/**
 * Shared in-memory cache for the base reference data used by all formula modules
 * (Costos, Cotizaciones, Almacén). Reduces redundant Supabase round-trips when
 * the user navigates between modules.
 *
 * TTL: 3 minutes. Each module still fetches its own operational tables (columnas/filas)
 * directly so edits are always reflected without needing explicit invalidation.
 */
import { supabase } from './supabase';

export interface BaseQueryData {
  areasData: any[];
  invData: any[];
  gastosColData: any[];
  gastosFilData: any[];
  areaDistribData: any[];
  moColData: any[];
  moFilData: any[];
  empData: any[];
  volColData: any[];
  volFilData: any[];
  volDistData: any[];
  factoresData: any[];
  masivoZonData: any[];
  masivoTotales: any[];
}

const CACHE_TTL = 3 * 60 * 1000;

let cache: { data: BaseQueryData; ts: number } | null = null;
let pending: Promise<BaseQueryData> | null = null;

/** Force-expire the cache (call after writing to any shared reference table). */
export function invalidateBaseCache(): void {
  cache = null;
}

/**
 * Fetch shared base data, deduplicating concurrent calls.
 * If the cache is warm (< 3 min old) the promise resolves instantly.
 */
export async function fetchBaseQueryData(): Promise<BaseQueryData> {
  if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.data;
  if (pending) return pending;

  pending = (async (): Promise<BaseQueryData> => {
    // Use allSettled so a missing/broken table never crashes the whole cache load.
    const results = await Promise.allSettled([
      supabase.from('areas').select('id, nombre, metros_cuadrados, cantidad_racks, metros_cubicos, categoria, costo_area, costo_area_formula').order('nombre'),
      supabase.from('inversiones').select('*').order('created_at'),
      supabase.from('gastos_varios_columnas').select('id, nombre, tipo').order('orden'),
      supabase.from('gastos_varios').select('id, area, concepto, parent_id, es_total, tipo_fila, valores'),
      supabase.from('area_distribution').select('area_name, global_distribution_percentage'),
      supabase.from('mano_obra_columnas').select('id, nombre, tipo, is_sensitive').order('orden'),
      supabase.from('mano_obra').select('id, area, valores'),
      supabase.from('mano_obra_empleados').select('id, area, dist, puesto_descripcion, departamento, seccion, jefe_inmediato, empresa_lab, silo, tipo, is_active').eq('is_active', true),
      supabase.from('volumenes_columnas').select('id, nombre, tipo').order('orden'),
      supabase.from('volumenes').select('id, proceso, subproceso, valores'),
      supabase.from('volumen_distribucion').select('id, nombre, porcentaje, porcentaje_inbound, porcentaje_outbound, categoria, is_active, unidades, es_zona_franca').eq('is_active', true).order('orden'),
      supabase.from('factores').select('*'),
      supabase.rpc('fn_volumenes_zona_resumen_v2'),
      supabase.rpc('fn_volumenes_totales'),
    ]);

    const r = (i: number): any[] => {
      const res = results[i];
      if (res.status === 'rejected') return [];
      return (res.value as any)?.data ?? [];
    };

    const data: BaseQueryData = {
      areasData:      r(0),
      invData:        r(1),
      gastosColData:  r(2),
      gastosFilData:  r(3),
      areaDistribData:r(4),
      moColData:      r(5),
      moFilData:      r(6),
      empData:        r(7),
      volColData:     r(8),
      volFilData:     r(9),
      volDistData:    r(10),
      factoresData:   r(11),
      masivoZonData:  r(12),
      masivoTotales:  r(13),
    };

    cache = { data, ts: Date.now() };
    pending = null;
    return data;
  })();

  return pending;
}
