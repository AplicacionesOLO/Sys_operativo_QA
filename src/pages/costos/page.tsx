import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchBaseQueryData } from '@/lib/formulaBaseCache';
import { logChange } from '@/lib/auditLog';
import { cascadeRenameTokens, costosRowRenamePairs } from '@/lib/formulaTokenRename';
import AppLayout from '@/components/feature/AppLayout';
import ErrorBoundary from '@/components/feature/ErrorBoundary';
import type { CostoColumna, CostoFila, ColumnType, FormulaConfig } from '@/types/costos';
import type { Area } from '@/types/areas';
import type { InversionRecord } from '@/types/inversion';
import type { FormulaContext } from '@/lib/formulaEngine';
import { EMPTY_FORMULA_CTX, calcularFormula, toAllDataSources } from '@/lib/formulaEngine';
import { buildVariableDefs, buildVariableMap } from '@/lib/formulaVariables';
import { useLocalStorageValue } from '@/hooks/useLocalStorageSync';
import type { VolPromedioConfig } from '@/hooks/useVolumenesPromedioConfig';
import CostosTable from './components/CostosTable';
import CostosSummary from './components/CostosSummary';
import AddColumnModal from './components/AddColumnModal';

const VOL_LASTN_KEY = 'vol_promedio_lastN';

type ModalState = { open: false } | { open: true; editing: CostoColumna | null };

// Datos base de Supabase (sin depender de lastN)
interface BaseCtxData {
  cols: CostoColumna[];
  rows: CostoFila[];
  baseCtx: FormulaContext;
}

export default function CostosPage() {
  const [columnas, setColumnas] = useState<CostoColumna[]>([]);
  const [filas, setFilas] = useState<CostoFila[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [modalState, setModalState] = useState<ModalState>({ open: false });
  const [baseCtxData, setBaseCtxData] = useState<BaseCtxData | null>(null);

  // Escuchar cambios en lastN de volúmenes para recalcular formulaCtx reactivamente
  const volLastN = useLocalStorageValue<VolPromedioConfig>(
    VOL_LASTN_KEY,
    (raw) => {
      if (!raw) return { recibido: 0, despachado: 0 };
      try {
        const p = JSON.parse(raw) as Partial<VolPromedioConfig>;
        return {
          recibido: typeof p.recibido === 'number' ? p.recibido : 0,
          despachado: typeof p.despachado === 'number' ? p.despachado : 0,
        };
      } catch {
        return { recibido: 0, despachado: 0 };
      }
    },
    { recibido: 0, despachado: 0 },
  );

  // Reconstruir formulaCtx cada vez que cambian los datos base O el lastN
  const formulaCtx = useMemo<FormulaContext>(() => {
    if (!baseCtxData) return EMPTY_FORMULA_CTX;
    try {
      const { cols, rows, baseCtx } = baseCtxData;

      // ── Precompute variable cache ONCE (expensive: 20k+ var defs with masivo data) ──
      // This eliminates 108 redundant rebuilds of buildVariableDefs + buildVariableMap
      const allData = toAllDataSources(baseCtx);
      const cachedDefs = buildVariableDefs(allData);
      const cachedBaseVarMap = buildVariableMap(cachedDefs, allData, undefined);
      const ctxWithCache: FormulaContext = {
        ...baseCtx,
        _cachedDefs: cachedDefs,
        _cachedBaseVarMap: cachedBaseVarMap,
        _cachedAllData: allData,
      };

      const allFormulaCols = cols.filter(c => c.tipo === 'formula');
      const enrichedRows: CostoFila[] = allFormulaCols.length > 0
        ? rows.map(row => {
            const extra: Record<string, number> = {};
            allFormulaCols.forEach(col => {
              try {
                const formulaToUse = row.formulas?.[col.id] ?? col.formula;
                if (formulaToUse) {
                  // Uses ctxWithCache so each call reuses cached defs + baseVarMap
                  extra[col.id] = calcularFormula(formulaToUse, ctxWithCache, row.subproceso ?? '');
                }
              } catch {
                extra[col.id] = 0;
              }
            });
            return { ...row, valores: { ...row.valores, ...extra } };
          })
        : rows;
      return { ...ctxWithCache, costosFilas: enrichedRows as FormulaContext['costosFilas'] };
    } catch {
      return baseCtxData.baseCtx;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseCtxData, volLastN.recibido, volLastN.despachado]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Shared reference data (cached) + own operational tables fetched in parallel
      const [
        base,
        { data: colData },
        { data: filData },
      ] = await Promise.all([
        fetchBaseQueryData(),
        supabase.from('costos_columnas').select('*').order('orden'),
        supabase.from('costos_operacion').select('*').order('orden'),
      ]);

      const {
        areasData, invData, gastosColData, gastosFilData, areaDistribData,
        moColData, moFilData, empData, volColData, volFilData,
        volDistData, factoresData, masivoZonData, masivoTotales,
      } = base;

      const cols = (colData as CostoColumna[]) ?? [];
      const rows = (filData as CostoFila[]) ?? [];
      setColumnas(cols);
      setFilas(rows);
      setAreas((areasData as Area[]) ?? []);

      let mappedAreasData = ((areasData ?? []) as Area[]).map(a => ({
        nombre: a.nombre,
        metros_cuadrados: a.metros_cuadrados ?? 0,
        cantidad_racks: a.cantidad_racks ?? 0,
        metros_cubicos: a.metros_cubicos ?? 0,
        costo_area: a.costo_area ?? 0,
      }));

      // ── Enrich areaDistribucion with categoria + category_distribution_percentage (m²) ──
      const areasWithCat = ((areasData ?? []) as Area[]);
      const categoryTotals: Record<string, number> = {};
      const categoryTotalsCubic: Record<string, number> = {};
      let totalM3Global = 0;
      areasWithCat.forEach(a => {
        const cat = a.categoria ?? 'Sin categoría';
        categoryTotals[cat] = (categoryTotals[cat] ?? 0) + (a.metros_cuadrados ?? 0);
        categoryTotalsCubic[cat] = (categoryTotalsCubic[cat] ?? 0) + (a.metros_cubicos ?? 0);
        totalM3Global += a.metros_cubicos ?? 0;
      });

      const enrichedAreaDist = ((areaDistribData ?? []) as { area_name: string; global_distribution_percentage: number }[]).map(d => {
        const match = areasWithCat.find(a => a.nombre === d.area_name);
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

      // ── Compute costo_area for each area using its formula ──
      const areasWithFormula = ((areasData ?? []) as Area[]);
      for (let i = 0; i < mappedAreasData.length; i++) {
        const areaRecord = areasWithFormula.find(ar => ar.nombre === mappedAreasData[i].nombre);
        if (areaRecord?.costo_area_formula) {
          mappedAreasData[i].costo_area = calcularFormula(
            areaRecord.costo_area_formula,
            {
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
              areasData: mappedAreasData,
              volDistribucion: (volDistData ?? []) as FormulaContext['volDistribucion'],
            },
            mappedAreasData[i].nombre
          );
        } else {
          mappedAreasData[i].costo_area = areaRecord?.costo_area ?? 0;
        }
      }

      // ── Guardar datos base (sin pre-calcular fórmulas) ────────────────────
      // El formulaCtx se reconstruye reactivamente en el useMemo de arriba,
      // lo que permite que cambie el lastN de volúmenes sin recargar Supabase.
      const baseCtx: FormulaContext = {
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
        areasData: mappedAreasData,
        volDistribucion: (volDistData ?? []) as FormulaContext['volDistribucion'],
        factores: (factoresData ?? []) as FormulaContext['factores'],
        masivoArticulos: [], // populated in background after UI renders
        masivoZonas: ((masivoZonData ?? []) as any[]).map((r: any) => ({
          zona: String(r.zona ?? ''),
          movimientos: Number(r.movimientos) || 0,
          unidades: Number(r.unidades) || 0,
          articulos_distintos: Number(r.articulos_distintos) || 0,
          meses_distintos: Number(r.meses_distintos) || 0,
          prom_movimientos_mes: Number(r.prom_movimientos_mes) || 0,
          prom_unidades_mes: Number(r.prom_unidades_mes) || 0,
        })),
        masivoZonaArticulos: [], // populated in background after UI renders
        masivoTotals: (() => {
          const t0 = (masivoTotales as any[] | undefined)?.[0] ?? {};
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

      setBaseCtxData({ cols, rows, baseCtx });
      setLoading(false); // UI is interactive now

      // Phase 2: load masivo RPCs in background — they're slow (large datasets)
      // Formulas using MASIVO_* tokens will auto-update when this resolves
      const MASIVO_PAGE = 1000;
      const fetchAllPages = async (rpc: string): Promise<any[]> => {
        const all: any[] = [];
        let offset = 0;
        while (true) {
          const { data: page } = await supabase.rpc(rpc, { p_offset: offset, p_limit: MASIVO_PAGE });
          if (!page || page.length === 0) break;
          all.push(...page);
          if (page.length < MASIVO_PAGE) break;
          offset += MASIVO_PAGE;
        }
        return all;
      };
      const [masivoArtData, masivoZAData] = await Promise.all([
        fetchAllPages('fn_volumenes_articulo_resumen_v3'),
        fetchAllPages('fn_volumenes_zona_articulos_detalle_v3'),
      ]);
      setBaseCtxData(prev => prev ? {
        ...prev,
        baseCtx: {
          ...prev.baseCtx,
          masivoArticulos: (masivoArtData as any[]).map((r: any) => ({
            articulo: String(r.articulo ?? ''),
            descripcion: String(r.descripcion ?? ''),
            movimientos: Number(r.movimientos) || 0,
            unidades: Number(r.unidades) || 0,
            meses_distintos: Number(r.meses_distintos) || 0,
            prom_movimientos_mes: Number(r.prom_movimientos_mes) || 0,
            prom_unidades_mes: Number(r.prom_unidades_mes) || 0,
          })),
          masivoZonaArticulos: (masivoZAData as any[]).map((r: any) => ({
            zona: String(r.zona ?? ''),
            articulo: String(r.articulo ?? ''),
            descripcion: String(r.descripcion ?? ''),
            movimientos: Number(r.movimientos) || 0,
            unidades: Number(r.unidades) || 0,
          })),
        },
      } : null);
    } catch (e: any) {
      setError(e?.message || 'Error al cargar datos');
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Ref para acceder al valor más reciente de filas sin recrear el callback ──
  const filasRef = useRef(filas);
  useEffect(() => { filasRef.current = filas; }, [filas]);

  // ---------- COLUMNS ----------
  const handleSaveColumn = async (data: {
    nombre: string;
    tipo: ColumnType;
    opciones: string[];
    formula?: FormulaConfig;
  }) => {
    const isEditing = modalState.open && modalState.editing;
    const payload = {
      nombre: data.nombre,
      tipo: data.tipo,
      opciones: data.opciones,
      formula: data.formula ?? null,
    };

    if (isEditing && modalState.editing) {
      await supabase
        .from('costos_columnas')
        .update(payload)
        .eq('id', modalState.editing.id);
    } else {
      await supabase
        .from('costos_columnas')
        .insert({ ...payload, orden: columnas.length });
    }
    setModalState({ open: false });
    // Reload everything so formulaCtx is rebuilt with updated formula columns
    await loadData();
  };

  const handleDeleteColumn = async (id: string) => {
    if (!confirm('¿Eliminar esta columna? Se perderán todos los valores registrados en ella.')) return;
    await supabase.from('costos_columnas').delete().eq('id', id);
    setColumnas(prev => prev.filter(c => c.id !== id));
    setFilas(prev => prev.map(f => {
      const newVals = { ...f.valores };
      delete newVals[id];
      return { ...f, valores: newVals };
    }));
  };

  // ---------- ROWS ----------
  const handleAddFila = async () => {
    const { data: newFila } = await supabase
      .from('costos_operacion')
      .insert({ proceso: 'Nuevo proceso', subproceso: '', valores: {}, orden: filas.length })
      .select()
      .maybeSingle();
    if (newFila) setFilas(prev => [...prev, newFila as CostoFila]);
  };

  const handleAddFilaForProceso = useCallback(async (proceso: string) => {
    const currentFilas = filasRef.current;
    const newOrden = currentFilas.length;

    const { data: newFila } = await supabase
      .from('costos_operacion')
      .insert({ proceso, subproceso: '', valores: {}, orden: newOrden })
      .select()
      .maybeSingle();

    if (newFila) {
      setFilas(prev => [...prev, newFila as CostoFila]);
    }
  }, []);

  const handleUpdateFila = useCallback(async (id: string, field: string, value: string | number) => {
    const fila = filasRef.current.find(f => f.id === id);
    logChange({
      modulo: 'costos', accion: 'update_row',
      entidad_tipo: 'costos_operacion', entidad_id: id,
      entidad_label: fila ? (fila.subproceso ? `${fila.proceso} › ${fila.subproceso}` : fila.proceso) : id,
      campo: field,
      valor_antes: fila ? (fila as unknown as Record<string, unknown>)[field] ?? null : null,
      valor_despues: value,
    });
    // If proceso or subproceso changes, cascade-rename COSTOS_TOTAL_* tokens
    if (fila && (field === 'proceso' || field === 'subproceso') && String(value) !== String((fila as unknown as Record<string, unknown>)[field] ?? '')) {
      const newProceso = field === 'proceso' ? String(value) : (fila.proceso ?? '');
      const newSubproceso = field === 'subproceso' ? String(value) : (fila.subproceso ?? '');
      cascadeRenameTokens(costosRowRenamePairs(fila.proceso ?? '', fila.subproceso ?? '', newProceso, newSubproceso));
    }
    setSavingId(id);
    setFilas(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f));
    await supabase.from('costos_operacion').update({ [field]: value }).eq('id', id);
    setSavingId(null);
  }, []);

  const handleUpdateCell = useCallback(async (id: string, columnaId: string, value: string | number) => {
    const fila = filas.find(f => f.id === id);
    if (!fila) return;
    logChange({
      modulo: 'costos', accion: 'update_cell',
      entidad_tipo: 'costos_operacion', entidad_id: id,
      entidad_label: fila.subproceso ? `${fila.proceso} › ${fila.subproceso}` : fila.proceso,
      campo: columnas.find(c => c.id === columnaId)?.nombre ?? columnaId,
      valor_antes: fila.valores[columnaId] ?? null,
      valor_despues: value,
    });
    setSavingId(id);
    setFilas(prev => prev.map(f => f.id !== id ? f : { ...f, valores: { ...f.valores, [columnaId]: value } }));
    await supabase.from('costos_operacion').update({ valores: { ...fila.valores, [columnaId]: value } }).eq('id', id);
    setSavingId(null);
  }, [filas, columnas]);

  const handleDeleteFila = async (id: string) => {
    await supabase.from('costos_operacion').delete().eq('id', id);
    setFilas(prev => prev.filter(f => f.id !== id));
  };

  // ---------- ROW FORMULAS ----------
  const handleSaveRowFormula = useCallback(async (rowId: string, colId: string, formula: import('@/types/costos').FormulaConfig) => {
    const fila = filas.find(f => f.id === rowId);
    if (!fila) return;
    logChange({
      modulo: 'costos', accion: 'update_formula',
      entidad_tipo: 'costos_operacion', entidad_id: rowId,
      entidad_label: fila.subproceso ? `${fila.proceso} › ${fila.subproceso}` : fila.proceso,
      campo: columnas.find(c => c.id === colId)?.nombre ?? colId,
      valor_antes: fila.formulas?.[colId] ?? null,
      valor_despues: formula,
    });
    const newFormulas = { ...(fila.formulas ?? {}), [colId]: formula };
    setFilas(prev => prev.map(f => f.id === rowId ? { ...f, formulas: newFormulas } : f));
    await supabase.from('costos_operacion').update({ formulas: newFormulas }).eq('id', rowId);
    await loadData();
  }, [filas, columnas, loadData]);

  // ---------- COLUMN REORDER ----------
  const handleReorderColumns = useCallback(async (newOrder: CostoColumna[]) => {
    // Optimistic update
    setColumnas(newOrder);
    // Persist new orden values to Supabase
    await Promise.all(
      newOrder.map((col, idx) =>
        supabase.from('costos_columnas').update({ orden: idx }).eq('id', col.id)
      )
    );
  }, []);

  const handleClearRowFormula = useCallback(async (rowId: string, colId: string) => {
    const fila = filas.find(f => f.id === rowId);
    if (!fila) return;
    logChange({
      modulo: 'costos', accion: 'clear_formula',
      entidad_tipo: 'costos_operacion', entidad_id: rowId,
      entidad_label: fila.subproceso ? `${fila.proceso} › ${fila.subproceso}` : fila.proceso,
      campo: columnas.find(c => c.id === colId)?.nombre ?? colId,
      valor_antes: fila.formulas?.[colId] ?? null,
      valor_despues: null,
    });
    const newFormulas = { ...(fila.formulas ?? {}) };
    delete newFormulas[colId];
    setFilas(prev => prev.map(f => f.id === rowId ? { ...f, formulas: newFormulas } : f));
    await supabase.from('costos_operacion').update({ formulas: newFormulas }).eq('id', rowId);
    await loadData();
  }, [filas, columnas, loadData]);

  // Count data sources for banner
  const srcCount = {
    inversiones: formulaCtx.inversiones.length,
    gastosFilas: formulaCtx.gastosFilas.length,
    moColumnas: (formulaCtx.manoObraColumnas ?? []).filter(c => ['moneda', 'numero', 'porcentaje'].includes(c.tipo ?? '') && !c.is_sensitive).length,
    volColumnas: (formulaCtx.volumenesColumnas ?? []).filter(c => ['moneda', 'numero'].includes(c.tipo ?? '')).length,
    areas: formulaCtx.areaDistribucion.length,
    areasM2: (formulaCtx.areasData ?? []).filter(a => (a.metros_cuadrados ?? 0) > 0).length,
    volDist: (formulaCtx.volDistribucion ?? []).filter(v => v.is_active).length,
  };
  const hasSources = srcCount.inversiones > 0 || srcCount.gastosFilas > 0 || srcCount.moColumnas > 0 || srcCount.volColumnas > 0 || srcCount.areasM2 > 0 || srcCount.volDist > 0;

  if (loading) {
    return (
      <AppLayout title="Costos por Operación" subtitle="Cargando datos de todos los módulos...">
        <div className="flex items-center justify-center py-32">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Conectando con la base de datos...</p>
            <p className="text-xs text-slate-400">Esto puede tomar unos segundos</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout title="Costos por Operación" subtitle="Error al cargar el módulo">
        <div className="flex items-center justify-center py-32">
          <div className="flex flex-col items-center gap-4 max-w-md text-center">
            <div className="w-16 h-16 flex items-center justify-center rounded-2xl bg-rose-50">
              <i className="ri-error-warning-line text-3xl text-rose-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 font-[Sora] mb-2">No se pudo cargar el módulo</h2>
              <p className="text-sm text-slate-500 mb-4">{error}</p>
              <button
                onClick={() => { setError(null); loadData(); }}
                className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-refresh-line mr-1.5" />Reintentar
              </button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Costos por Operación"
      subtitle="Matriz editable con fórmulas vinculadas a todos los módulos del sistema"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModalState({ open: true, editing: null })}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <div className="w-4 h-4 flex items-center justify-center"><i className="ri-add-line" /></div>
            Agregar columna
          </button>
          <button
            onClick={handleAddFila}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <div className="w-4 h-4 flex items-center justify-center"><i className="ri-add-line" /></div>
            Agregar fila
          </button>
        </div>
      }
    >
      <ErrorBoundary moduleName="Costos por Operación" onRetry={loadData}>
      <div className="space-y-6">
        {/* Data sources banner */}
        {hasSources && (
          <div className="flex items-center gap-3 px-4 py-3 bg-violet-50 border border-violet-100 rounded-xl flex-wrap">
            <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
              <i className="ri-functions text-violet-500" />
            </div>
            <p className="text-xs text-violet-700 font-medium">Fuentes disponibles para fórmulas:</p>
            {srcCount.inversiones > 0 && (
              <span className="text-xs text-violet-600 bg-white border border-violet-200 px-2 py-0.5 rounded-full">
                <i className="ri-building-2-line mr-1" />{srcCount.inversiones} inversión{srcCount.inversiones !== 1 ? 'es' : ''}
              </span>
            )}
            {srcCount.gastosFilas > 0 && (
              <span className="text-xs text-violet-600 bg-white border border-violet-200 px-2 py-0.5 rounded-full">
                <i className="ri-receipt-line mr-1" />{srcCount.gastosFilas} concepto{srcCount.gastosFilas !== 1 ? 's' : ''} gastos varios
              </span>
            )}
            {srcCount.moColumnas > 0 && (
              <span className="text-xs text-violet-600 bg-white border border-violet-200 px-2 py-0.5 rounded-full">
                <i className="ri-user-3-line mr-1" />{srcCount.moColumnas} col. mano de obra
              </span>
            )}
            {srcCount.volColumnas > 0 && (
              <span className="text-xs text-violet-600 bg-white border border-violet-200 px-2 py-0.5 rounded-full">
                <i className="ri-bar-chart-box-line mr-1" />{srcCount.volColumnas} col. volúmenes
              </span>
            )}
            {srcCount.areas > 0 && (
              <span className="text-xs text-violet-600 bg-white border border-violet-200 px-2 py-0.5 rounded-full">
                <i className="ri-pie-chart-line mr-1" />{srcCount.areas} áreas de distribución
              </span>
            )}
            {srcCount.areasM2 > 0 && (
              <span className="text-xs text-violet-600 bg-white border border-violet-200 px-2 py-0.5 rounded-full">
                <i className="ri-layout-grid-line mr-1" />{srcCount.areasM2} áreas con M² y racks
              </span>
            )}
            {srcCount.volDist > 0 && (
              <span className="text-xs text-violet-600 bg-white border border-violet-200 px-2 py-0.5 rounded-full">
                <i className="ri-pie-chart-2-line mr-1" />{srcCount.volDist} segmentos vol. distribución
              </span>
            )}
          </div>
        )}

        {(filas.length > 0 || columnas.length > 0) && (
          <CostosSummary columnas={columnas} filas={filas} />
        )}

        <CostosTable
          columnas={columnas}
          filas={filas}
          areas={areas}
          savingId={savingId}
          onAddColumn={() => setModalState({ open: true, editing: null })}
          onEditColumn={col => setModalState({ open: true, editing: col })}
          onDeleteColumn={handleDeleteColumn}
          onAddFila={handleAddFila}
          onUpdateFila={handleUpdateFila}
          onUpdateCell={handleUpdateCell}
          onDeleteFila={handleDeleteFila}
          onSaveRowFormula={handleSaveRowFormula}
          onClearRowFormula={handleClearRowFormula}
          onAddFilaForProceso={handleAddFilaForProceso}
          onReorderColumns={handleReorderColumns}
          formulaCtx={formulaCtx}
        />

        {modalState.open && (
          <AddColumnModal
            onClose={() => setModalState({ open: false })}
            onSave={handleSaveColumn}
            editing={modalState.editing}
            formulaCtx={formulaCtx}
          />
        )}
      </div>
      </ErrorBoundary>
    </AppLayout>
  );
}