import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { CostoColumna, CostoFila } from '@/types/costos';
import type { Area } from '@/types/areas';
import type { InversionRecord } from '@/types/inversion';
import type { FormulaContext } from '@/lib/formulaEngine';
import { EMPTY_FORMULA_CTX, calcularFormula } from '@/lib/formulaEngine';
import type { VolPromedioConfig } from '@/hooks/useVolumenesPromedioConfig';
import CostosTableReadOnly from './components/CostosTableReadOnly';
import CostosSummary from './components/CostosSummary';

const EMBED_DATA_URL =
  'https://cqdupetgpzkvouslupfm.supabase.co/functions/v1/costos-embed-data';

interface RawSupabaseData {
  cols: CostoColumna[];
  rows: CostoFila[];
  mappedAreas: { nombre: string; metros_cuadrados: number; cantidad_racks: number; metros_cubicos: number; costo_area: number }[];
  enrichedAreaDist: FormulaContext['areaDistribucion'];
  inversiones: InversionRecord[];
  gastosColsFijos: FormulaContext['gastosColumnas'];
  gastosFilas: FormulaContext['gastosFilas'];
  moColData: FormulaContext['manoObraColumnas'];
  moFilData: FormulaContext['manoObraFilas'];
  empData: FormulaContext['manoObraEmpleados'];
  volColData: FormulaContext['volumenesColumnas'];
  volFilData: FormulaContext['volumenesFilas'];
  volDistData: FormulaContext['volDistribucion'];
  factoresData: FormulaContext['factores'];
  masivoArtData: FormulaContext['masivoArticulos'];
  masivoZonData: FormulaContext['masivoZonas'];
  masivoTotales?: { total_articulos: number; total_movimientos: number; total_unidades: number; total_zonas: number; total_mov_zonas: number; total_unid_zonas: number }[];
  volLastN: VolPromedioConfig;
}

interface LoadState {
  data: RawSupabaseData | null;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  liveError: string | null;
}

const INITIAL_LOAD_STATE: LoadState = {
  data: null,
  loading: true,
  error: null,
  lastUpdated: null,
  liveError: null,
};

function buildCtxFromRaw(raw: RawSupabaseData): {
  formulaCtx: FormulaContext;
  enrichedFilas: CostoFila[];
} {
  try {
    localStorage.setItem('vol_promedio_lastN', JSON.stringify(raw.volLastN));
  } catch {
    // silently ignore
  }

  const baseCtx: FormulaContext = {
    inversiones: raw.inversiones,
    gastosColumnas: raw.gastosColsFijos,
    gastosFilas: raw.gastosFilas,
    areaDistribucion: raw.enrichedAreaDist,
    manoObraColumnas: raw.moColData,
    manoObraFilas: raw.moFilData,
    manoObraEmpleados: raw.empData,
    volumenesColumnas: raw.volColData,
    volumenesFilas: raw.volFilData,
    costosColumnas: raw.cols,
    costosFilas: raw.rows,
    areasData: raw.mappedAreas,
    volDistribucion: raw.volDistData,
    factores: raw.factoresData,
    masivoArticulos: raw.masivoArtData,
    masivoZonas: raw.masivoZonData,
    masivoTotals: (() => {
      const t0 = (raw.masivoTotales ?? [])[0] ?? {};
      return {
        totalArticulos: Number(t0.total_articulos) || 0,
        totalMovArticulos: Number(t0.total_movimientos) || 0,
        totalUnidArticulos: Number(t0.total_unidades) || 0,
        totalZonas: Number(t0.total_zonas) || 0,
        totalMovZonas: Number(t0.total_mov_zonas) || 0,
        totalUnidZonas: Number(t0.total_unid_zonas) || 0,
      };
    })(),
  };

  const formulaTypeCols = raw.cols.filter((c) => c.tipo === 'formula' && c.formula);
  const enrichedFilas: CostoFila[] =
    formulaTypeCols.length > 0
      ? raw.rows.map((row) => {
          const extra: Record<string, number> = {};
          formulaTypeCols.forEach((col) => {
            extra[col.id] = calcularFormula(col.formula!, baseCtx, row.subproceso ?? '');
          });
          return { ...row, valores: { ...row.valores, ...extra } };
        })
      : raw.rows;

  const formulaCtx: FormulaContext = {
    ...baseCtx,
    costosFilas: enrichedFilas as FormulaContext['costosFilas'],
  };

  return { formulaCtx, enrichedFilas };
}

export default function CostosEmbedPage() {
  const [loadState, setLoadState] = useState<LoadState>(INITIAL_LOAD_STATE);
  const [liveUpdates, setLiveUpdates] = useState(0);
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFetchingRef = useRef(false);

  const loadData = useCallback(async (isBackgroundRefresh = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (!isBackgroundRefresh) {
      setLoadState((prev) => ({ ...prev, loading: true, error: null }));
    }

    try {
      const res = await fetch(EMBED_DATA_URL, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const payload = await res.json();
      if (payload.error) throw new Error(payload.error);

      const {
        colData, filData, areasData: rawAreas, invData,
        gastosFilData, areaDistribData, moColData, moFilData,
        volColData, volFilData, empData, volDistData,
        factoresData, gastosColData, volLastN: serverLastN,
        masivoArtData, masivoZonData, masivoTotales,
      } = payload;

      const cols = (colData as CostoColumna[]) ?? [];
      const rows = (filData as CostoFila[]) ?? [];
      const areasArr = ((rawAreas ?? []) as Area[]);

      const mappedAreas = areasArr.map((a) => ({
        nombre: a.nombre,
        metros_cuadrados: a.metros_cuadrados ?? 0,
        cantidad_racks: a.cantidad_racks ?? 0,
        metros_cubicos: a.metros_cubicos ?? 0,
        costo_area: a.costo_area ?? 0,
      }));

      const categoryTotals: Record<string, number> = {};
      const categoryTotalsCubic: Record<string, number> = {};
      let totalM3Global = 0;
      areasArr.forEach((a) => {
        const cat = a.categoria ?? 'Sin categoría';
        categoryTotals[cat] = (categoryTotals[cat] ?? 0) + (a.metros_cuadrados ?? 0);
        categoryTotalsCubic[cat] = (categoryTotalsCubic[cat] ?? 0) + (a.metros_cubicos ?? 0);
        totalM3Global += a.metros_cubicos ?? 0;
      });

      const enrichedAreaDist = (
        (areaDistribData ?? []) as { area_name: string; global_distribution_percentage: number }[]
      ).map((d) => {
        const match = areasArr.find((a) => a.nombre === d.area_name);
        const cat = match?.categoria ?? 'Sin categoría';
        const areaM2 = match?.metros_cuadrados ?? 0;
        const areaM3 = match?.metros_cubicos ?? 0;
        const catTotal = categoryTotals[cat] ?? 0;
        const catTotalCubic = categoryTotalsCubic[cat] ?? 0;
        const catPct = catTotal > 0 ? (areaM2 / catTotal) * 100 : 0;
        const catPctCubic = catTotalCubic > 0 ? (areaM3 / catTotalCubic) * 100 : 0;
        const globalCubicPct = totalM3Global > 0 ? (areaM3 / totalM3Global) * 100 : 0;
        return {
          ...d,
          categoria: cat,
          category_distribution_percentage: +catPct.toFixed(2),
          global_distribution_cubic_percentage: +globalCubicPct.toFixed(2),
          category_distribution_cubic_percentage: +catPctCubic.toFixed(2),
        };
      });

      // Compute costo_area using formula engine (same as main page)
      const areasWithFormula = areasArr;
      const tempCtx: FormulaContext = {
        inversiones: (invData as InversionRecord[]) ?? [],
        gastosColumnas: (gastosColData ?? []) as FormulaContext['gastosColumnas'],
        gastosFilas: (gastosFilData ?? []) as FormulaContext['gastosFilas'],
        areaDistribucion: enrichedAreaDist as FormulaContext['areaDistribucion'],
        manoObraColumnas: (moColData ?? []) as FormulaContext['manoObraColumnas'],
        manoObraFilas: (moFilData ?? []) as FormulaContext['manoObraFilas'],
        manoObraEmpleados: (empData ?? []) as FormulaContext['manoObraEmpleados'],
        volumenesColumnas: (volColData ?? []) as FormulaContext['volumenesColumnas'],
        volumenesFilas: (volFilData ?? []) as FormulaContext['volumenesFilas'],
        costosColumnas: cols as FormulaContext['costosColumnas'],
        costosFilas: rows as FormulaContext['costosFilas'],
        areasData: mappedAreas,
        volDistribucion: (volDistData ?? []) as FormulaContext['volDistribucion'],
        factores: (factoresData ?? []) as FormulaContext['factores'],
        masivoArticulos: ((masivoArtData ?? []) as any[]).map((r: any) => ({
          articulo: String(r.articulo ?? ''),
          descripcion: String(r.descripcion ?? ''),
          movimientos: Number(r.movimientos) || 0,
          unidades: Number(r.unidades) || 0,
          meses_distintos: Number(r.meses_distintos) || 0,
          prom_movimientos_mes: Number(r.prom_movimientos_mes) || 0,
          prom_unidades_mes: Number(r.prom_unidades_mes) || 0,
        })),
        masivoZonas: ((masivoZonData ?? []) as any[]).map((r: any) => ({
          zona: String(r.zona ?? ''),
          movimientos: Number(r.movimientos) || 0,
          unidades: Number(r.unidades) || 0,
          articulos_distintos: Number(r.articulos_distintos) || 0,
          meses_distintos: Number(r.meses_distintos) || 0,
          prom_movimientos_mes: Number(r.prom_movimientos_mes) || 0,
          prom_unidades_mes: Number(r.prom_unidades_mes) || 0,
        })),
      };

      for (let i = 0; i < mappedAreas.length; i++) {
        const areaRecord = areasWithFormula.find((ar) => ar.nombre === mappedAreas[i].nombre);
        if (areaRecord?.costo_area_formula) {
          mappedAreas[i].costo_area = calcularFormula(
            areaRecord.costo_area_formula,
            tempCtx,
            mappedAreas[i].nombre,
          );
        } else {
          mappedAreas[i].costo_area = areaRecord?.costo_area ?? 0;
        }
      }

      const gastosColsFijos: FormulaContext['gastosColumnas'] = [
        { id: 'mes',       nombre: 'Mes',       tipo: 'moneda' },
        { id: 'ppto_mes',  nombre: 'Ppto Mes',  tipo: 'moneda' },
        { id: 'psdo_mes',  nombre: 'Psdo Mes',  tipo: 'moneda' },
        { id: 'acum',      nombre: 'Acumulado', tipo: 'moneda' },
        { id: 'ppto_acum', nombre: 'Ppto Acum', tipo: 'moneda' },
        { id: 'psdo_acum', nombre: 'Psdo Acum', tipo: 'moneda' },
      ];

      const volLastN: VolPromedioConfig = serverLastN ?? { recibido: 0, despachado: 0 };

      // ── Mapear datos masivos con nombres de columna correctos ──
      const mappedMasivoArt = ((masivoArtData ?? []) as any[]).map((r: any) => ({
        articulo: String(r.articulo ?? ''),
        descripcion: String(r.descripcion ?? ''),
        movimientos: Number(r.movimientos) || 0,
        unidades: Number(r.unidades) || 0,
        meses_distintos: Number(r.meses_distintos) || 0,
        prom_movimientos_mes: Number(r.prom_movimientos_mes) || 0,
        prom_unidades_mes: Number(r.prom_unidades_mes) || 0,
      }));
      const mappedMasivoZon = ((masivoZonData ?? []) as any[]).map((r: any) => ({
        zona: String(r.zona ?? ''),
        movimientos: Number(r.movimientos) || 0,
        unidades: Number(r.unidades) || 0,
        articulos_distintos: Number(r.articulos_distintos) || 0,
        meses_distintos: Number(r.meses_distintos) || 0,
        prom_movimientos_mes: Number(r.prom_movimientos_mes) || 0,
        prom_unidades_mes: Number(r.prom_unidades_mes) || 0,
      }));

      const raw: RawSupabaseData = {
        cols, rows, mappedAreas,
        enrichedAreaDist: enrichedAreaDist as FormulaContext['areaDistribucion'],
        inversiones: (invData as InversionRecord[]) ?? [],
        gastosColsFijos,
        gastosFilas: (gastosFilData ?? []) as FormulaContext['gastosFilas'],
        moColData: (moColData ?? []) as FormulaContext['manoObraColumnas'],
        moFilData: (moFilData ?? []) as FormulaContext['manoObraFilas'],
        empData: (empData ?? []) as FormulaContext['manoObraEmpleados'],
        volColData: (volColData ?? []) as FormulaContext['volumenesColumnas'],
        volFilData: (volFilData ?? []) as FormulaContext['volumenesFilas'],
        volDistData: (volDistData ?? []) as FormulaContext['volDistribucion'],
        factoresData: (factoresData ?? []) as FormulaContext['factores'],
        masivoArtData: mappedMasivoArt as FormulaContext['masivoArticulos'],
        masivoZonData: mappedMasivoZon as FormulaContext['masivoZonas'],
        masivoTotales: (masivoTotales ?? []) as RawSupabaseData['masivoTotales'],
        volLastN,
      };

      setLoadState({
        data: raw,
        loading: false,
        error: null,
        lastUpdated: new Date(),
        liveError: null,
      });
      setLiveUpdates((prev) => prev + 1);
    } catch (err) {
      setLoadState((prev) => ({
        ...prev,
        loading: false,
        error: !prev.data ? (err instanceof Error ? err.message : String(err)) : prev.error,
        liveError: prev.data ? (err instanceof Error ? err.message : String(err)) : null,
        lastUpdated: prev.data ? prev.lastUpdated : null,
      }));
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  // ── Initial load ─────────────────────────────────────────────────────
  useEffect(() => { loadData(); }, [loadData]);

  // ── Supabase Realtime subscriptions ────────────────────────────────
  useEffect(() => {
    const tables = [
      'costos_columnas',
      'costos_operacion',
      'areas',
      'inversiones',
      'gastos_varios',
      'gastos_varios_columnas',
      'area_distribution',
      'mano_obra_columnas',
      'mano_obra',
      'volumenes_columnas',
      'volumenes',
      'mano_obra_empleados',
      'volumen_distribucion',
      'factores',
    ];

    const channels = tables.map((table) =>
      supabase
        .channel(`embed-${table}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          () => {
            // debounce: reloadData in 500ms to batch rapid changes
            window.clearTimeout((window as any).__embedReloadTimeout);
            (window as any).__embedReloadTimeout = window.setTimeout(() => {
              loadData(true);
            }, 500);
          },
        )
        .subscribe(),
    );

    channelsRef.current = channels;

    return () => {
      channels.forEach((ch) => ch.unsubscribe());
      channelsRef.current = [];
    };
  }, [loadData]);

  // ── Polling every 15 seconds as backup ───────────────────────────────
  useEffect(() => {
    pollingRef.current = setInterval(() => {
      loadData(true);
    }, 15000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [loadData]);

  // ── Page visibility: refresh immediately when tab becomes visible ───
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        loadData(true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [loadData]);

  const derived = useMemo(() => {
    if (!loadState.data) return null;
    return buildCtxFromRaw(loadState.data);
  }, [loadState.data, liveUpdates]);

  const { loading, error, lastUpdated, liveError } = loadState;
  const columnas = loadState.data?.cols ?? [];
  const filas = derived?.enrichedFilas ?? [];
  const formulaCtx = derived?.formulaCtx ?? EMPTY_FORMULA_CTX;
  const volLastN = loadState.data?.volLastN ?? { recibido: 0, despachado: 0 };
  const isInitialLoad = loading && !loadState.data;

  if (isInitialLoad) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">Cargando datos...</p>
        </div>
      </div>
    );
  }

  if (error && !loadState.data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-md text-center px-6">
          <div className="w-14 h-14 flex items-center justify-center rounded-full bg-red-100">
            <i className="ri-error-warning-line text-2xl text-red-500" />
          </div>
          <p className="text-base font-semibold text-slate-700">Error al cargar los datos</p>
          <p className="text-sm text-slate-400">{error}</p>
          <button
            onClick={() => loadData()}
            className="mt-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-refresh-line mr-2" />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="bg-white border-b border-slate-200">
        <div className="px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-emerald-500">
              <i className="ri-grid-line text-lg text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-800">Costos por Operación</h1>
              <p className="text-xs text-slate-400">Vista de solo lectura</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {(volLastN.recibido > 0 || volLastN.despachado > 0) && (
              <span className="text-xs text-sky-600 bg-sky-50 border border-sky-200 px-2.5 py-1 rounded-full flex items-center gap-1.5 whitespace-nowrap">
                <i className="ri-bar-chart-box-line" />
                Prom. IN: últ.&nbsp;{volLastN.recibido > 0 ? volLastN.recibido : 'todos'}
                &nbsp;·&nbsp;
                OUT: últ.&nbsp;{volLastN.despachado > 0 ? volLastN.despachado : 'todos'}
              </span>
            )}
            {loading && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                <div className="w-3 h-3 border border-emerald-500 border-t-transparent rounded-full animate-spin" />
                Actualizando...
              </span>
            )}
            {!loading && lastUpdated && (
              <span className="text-xs text-slate-400 hidden sm:block">
                <i className="ri-refresh-line mr-1" />
                Actualizado{' '}
                {lastUpdated.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            {liveError && (
              <span className="text-xs text-red-500 flex items-center gap-1" title={liveError}>
                <i className="ri-error-warning-line" />
                Error al actualizar
              </span>
            )}
            <button
              onClick={() => loadData()}
              disabled={loading}
              title="Actualizar datos"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <i className={`ri-refresh-line text-sm ${loading ? 'animate-spin' : ''}`} />
            </button>
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 font-medium flex items-center gap-1.5 whitespace-nowrap">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              En vivo
            </span>
            <span className="px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-500 font-medium whitespace-nowrap">
              Solo lectura
            </span>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 space-y-6">
        {(filas.length > 0 || columnas.length > 0) && (
          <CostosSummary columnas={columnas} filas={filas} />
        )}
        <CostosTableReadOnly
          columnas={columnas}
          filas={filas}
          formulaCtx={formulaCtx}
        />
      </div>
    </div>
  );
}