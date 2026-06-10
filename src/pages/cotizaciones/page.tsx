import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { FixedColumnHeaders } from './components/CotizacionDetalleTable';
import { supabase } from '@/lib/supabase';
import { fetchBaseQueryData } from '@/lib/formulaBaseCache';
import AppLayout from '@/components/feature/AppLayout';
import type { CotizacionCabecera, CotizacionDetalle, CotizacionColumnaDinamica, CotizacionValorDinamico, DetalleConValores } from '@/types/cotizaciones_v2';
import { MESES, ESTADO_V2_CONFIG } from '@/types/cotizaciones_v2';
import type { CostoFila, CostoColumna } from '@/types/costos';
import { calcularFormula, EMPTY_FORMULA_CTX, toAllDataSources } from '@/lib/formulaEngine';
import { buildVariableDefs, buildVariableMap } from '@/lib/formulaVariables';
import { buildRowVarContext, computeRowTotal } from '@/lib/cotizacionFormulaEngine';
import type { FormulaContext } from '@/lib/formulaEngine';
import type { Area } from '@/types/areas';
import type { InversionRecord } from '@/types/inversion';
import { useLocalStorageValue } from '@/hooks/useLocalStorageSync';
import type { VolPromedioConfig } from '@/hooks/useVolumenesPromedioConfig';

import CotizacionSidebar from './components/CotizacionSidebar';
import NuevaCotizacionModal from './components/NuevaCotizacionModal';
import DuplicarCotizacionModal from './components/DuplicarCotizacionModal';
import AdminColumnasDinamicasModal from './components/AdminColumnasDinamicasModal';
import CotizacionDetalleTable from './components/CotizacionDetalleTable';
import CotizacionSubprocesoSelector from './components/CotizacionSubprocesoSelector';
import CotizacionComparativa from './components/CotizacionComparativa';

const VOL_LASTN_KEY = 'vol_promedio_lastN';

export default function CotizacionesPage() {
  // ─── Data ────────────────────────────────────────────────────────────────────
  const [cabeceras, setCabeceras] = useState<CotizacionCabecera[]>([]);
  const [detalles, setDetalles] = useState<CotizacionDetalle[]>([]);
  const [valoresDinamicos, setValoresDinamicos] = useState<CotizacionValorDinamico[]>([]);
  const [columnasDinamicas, setColumnasDinamicas] = useState<CotizacionColumnaDinamica[]>([]);
  const [costoFilas, setCostoFilas] = useState<CostoFila[]>([]);
  const [costoColumnas, setCostoColumnas] = useState<CostoColumna[]>([]);
  const [baseCtx, setBaseCtx] = useState<FormulaContext>(EMPTY_FORMULA_CTX);

  // ─── UI state ────────────────────────────────────────────────────────────────
  const [selectedCabecera, setSelectedCabecera] = useState<CotizacionCabecera | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetalles, setLoadingDetalles] = useState(false);
  const [showNuevaModal, setShowNuevaModal] = useState(false);
  const [editingCabecera, setEditingCabecera] = useState<CotizacionCabecera | null>(null);
  const [duplicatingFrom, setDuplicatingFrom] = useState<CotizacionCabecera | null>(null);
  const [showAdminColumnas, setShowAdminColumnas] = useState(false);
  const [showComparativa, setShowComparativa] = useState(false);
  const [tableFullscreen, setTableFullscreen] = useState(false);
  const [savingMult, setSavingMult] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const skipDetallesReloadRef = useRef(false);

  // Fixed column headers (persisted in localStorage per cabecera)
  const [fixedHeaders, setFixedHeaders] = useState<FixedColumnHeaders>({
    costoUnidad: 'Costo por unidad',
    totalItem: 'Costo Total',
  });
  const [totalFormula, setTotalFormula] = useState<string>('');

  // Volumen promedio config (must be declared BEFORE formulaCtx)
  const volLastN = useLocalStorageValue<VolPromedioConfig>(
    VOL_LASTN_KEY,
    (raw) => {
      if (!raw) return { recibido: 0, despachado: 0 };
      try {
        const p = JSON.parse(raw) as Partial<VolPromedioConfig>;
        return { recibido: typeof p.recibido === 'number' ? p.recibido : 0, despachado: typeof p.despachado === 'number' ? p.despachado : 0 };
      } catch { return { recibido: 0, despachado: 0 }; }
    },
    { recibido: 0, despachado: 0 },
  );

  // ─── Formula context ─────────────────────────────────────────────────────────
  const formulaCtx = useMemo<FormulaContext>(() => {
    const cols = baseCtx.costosColumnas as CostoColumna[];
    const rows = baseCtx.costosFilas as CostoFila[];
    if (!cols || !rows) return baseCtx;

    // Build variable cache once — reused for every row × column evaluation
    const allData = toAllDataSources(baseCtx);
    const cachedDefs = buildVariableDefs(allData);
    const cachedBaseVarMap = buildVariableMap(cachedDefs, allData, undefined);
    const ctxWithCache: FormulaContext = {
      ...baseCtx,
      _cachedDefs: cachedDefs,
      _cachedBaseVarMap: cachedBaseVarMap,
      _cachedAllData: allData,
    };

    const formulaCols = cols.filter(c => c.tipo === 'formula' && c.formula);
    const enriched = formulaCols.length > 0
      ? rows.map(row => {
          const extra: Record<string, number> = {};
          formulaCols.forEach(col => { extra[col.id] = calcularFormula(col.formula!, ctxWithCache, row.subproceso ?? ''); });
          return { ...row, valores: { ...row.valores, ...extra } };
        })
      : rows;
    return { ...ctxWithCache, costosFilas: enriched as FormulaContext['costosFilas'] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseCtx, volLastN.recibido, volLastN.despachado]);

  // Refs to always access latest state inside callbacks without recreating them
  // (must be declared AFTER formulaCtx and volLastN)
  const detallesRef = useRef(detalles);
  useEffect(() => { detallesRef.current = detalles; }, [detalles]);
  const valoresDinamicosRef = useRef(valoresDinamicos);
  useEffect(() => { valoresDinamicosRef.current = valoresDinamicos; }, [valoresDinamicos]);
  const formulaCtxRef = useRef(formulaCtx);
  useEffect(() => { formulaCtxRef.current = formulaCtx; }, [formulaCtx]);
  const costoFilasRef = useRef(costoFilas);
  useEffect(() => { costoFilasRef.current = costoFilas; }, [costoFilas]);
  const costoColumnasRef = useRef(costoColumnas);
  useEffect(() => { costoColumnasRef.current = costoColumnas; }, [costoColumnas]);
  const autoSyncedRef = useRef<Set<string>>(new Set());

  // Load fixed headers + total formula when cabecera changes
  useEffect(() => {
    if (!selectedCabecera) return;
    const stored = localStorage.getItem(`fixed_headers_${selectedCabecera.id}`);
    if (stored) {
      try { setFixedHeaders(JSON.parse(stored)); } catch { /* ignore */ }
    } else {
      setFixedHeaders({ costoUnidad: 'Costo por unidad', totalItem: 'Costo Total' });
    }
    // Load formula from cabecera (Supabase is source of truth)
    setTotalFormula(selectedCabecera.total_formula ?? '');
  }, [selectedCabecera?.id, selectedCabecera?.total_formula]);

  // ─── Load all base data ───────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    // Shared reference data (cached) + cotizacion-specific tables fetched in parallel
    const [
      base,
      { data: cabData },
      { data: colDinData },
      { data: colData },
      { data: filData },
    ] = await Promise.all([
      fetchBaseQueryData(),
      supabase.from('cotizacion_cabecera').select('*').order('anio', { ascending: false }).order('mes', { ascending: false }).order('version', { ascending: false }),
      supabase.from('cotizacion_columnas_dinamicas').select('*').order('sort_order'),
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
    setCostoColumnas(cols);
    setCostoFilas(rows);
    setCabeceras((cabData as CotizacionCabecera[]) ?? []);
    setColumnasDinamicas((colDinData as CotizacionColumnaDinamica[]) ?? []);

    const areasArr = ((areasData ?? []) as Area[]);
    const mappedAreas = areasArr.map(a => ({ nombre: a.nombre, metros_cuadrados: a.metros_cuadrados ?? 0, cantidad_racks: a.cantidad_racks ?? 0 }));
    const categoryTotals: Record<string, number> = {};
    areasArr.forEach(a => { const cat = a.categoria ?? 'Sin categoría'; categoryTotals[cat] = (categoryTotals[cat] ?? 0) + (a.metros_cuadrados ?? 0); });
    const enrichedAreaDist = ((areaDistribData ?? []) as { area_name: string; global_distribution_percentage: number }[]).map(d => {
      const match = areasArr.find(a => a.nombre === d.area_name);
      const cat = match?.categoria ?? 'Sin categoría';
      const areaM2 = match?.metros_cuadrados ?? 0;
      const catTotal = categoryTotals[cat] ?? 0;
      return { ...d, categoria: cat, category_distribution_percentage: catTotal > 0 ? +((areaM2 / catTotal) * 100).toFixed(2) : 0 };
    });

    const coreCtx: FormulaContext = {
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
    setBaseCtx(coreCtx);
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
    setBaseCtx(prev => ({
      ...prev,
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
    }));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Load detalles when cabecera selected ────────────────────────────────────
  const loadDetalles = useCallback(async (cabeceraId: string) => {
    if (skipDetallesReloadRef.current) {
      skipDetallesReloadRef.current = false;
      return;
    }
    setLoadingDetalles(true);
    const { data: detData } = await supabase
      .from('cotizacion_detalle')
      .select('*')
      .eq('cabecera_id', cabeceraId)
      .order('orden');
    const dets = (detData as CotizacionDetalle[]) ?? [];
    setDetalles(dets);

    if (dets.length > 0) {
      const { data: valsData } = await supabase
        .from('cotizacion_valores_dinamicos')
        .select('*')
        .in('detalle_id', dets.map(d => d.id));
      setValoresDinamicos((valsData as CotizacionValorDinamico[]) ?? []);
    } else {
      setValoresDinamicos([]);
    }
    setLoadingDetalles(false);
  }, []);

  useEffect(() => {
    if (selectedCabecera) {
      loadDetalles(selectedCabecera.id);
    } else {
      setDetalles([]);
      setValoresDinamicos([]);
    }
    // Reset auto-sync flag when cabecera changes so it re-syncs on next load
    autoSyncedRef.current.clear();
  }, [selectedCabecera?.id, loadDetalles]);

  // ─── Auto-sync costos base when formulaCtx or costo data changes ──────────────
  useEffect(() => {
    if (!selectedCabecera || detalles.length === 0 || !formulaCtx) return;
    if (autoSyncedRef.current.has(selectedCabecera.id)) return;

    const updates: { id: string; costo_base: number; total_final: number }[] = [];
    for (const det of detalles) {
      if (!det.costo_fila_id) continue;
      const fila = costoFilas.find(f => f.id === det.costo_fila_id);
      if (!fila) continue;
      const newCostoBase = costoColumnas.reduce((sum, col) => {
        if (col.tipo === 'texto' || col.tipo === 'select') return sum;
        if (col.tipo === 'formula') {
          const f = fila.formulas?.[col.id] ?? col.formula;
          if (!f) return sum;
          const mode = f.mode ?? 'terms';
          const has = (mode === 'expression' && !!f.expression?.trim()) || (mode === 'terms' && (f.terminos?.length ?? 0) > 0);
          return has ? sum + calcularFormula(f, formulaCtx, fila.subproceso) : sum;
        }
        const v = Number(fila.valores[col.id] ?? 0);
        return sum + (isNaN(v) ? 0 : v);
      }, 0);
      const newTotal = newCostoBase * det.multiplicador_base;
      if (Math.abs(newCostoBase - det.costo_base) > 0.001) {
        updates.push({ id: det.id, costo_base: newCostoBase, total_final: newTotal });
      }
    }
    if (updates.length > 0) {
      Promise.all(
        updates.map(u =>
          supabase.from('cotizacion_detalle').update({ costo_base: u.costo_base, total_final: u.total_final }).eq('id', u.id)
        )
      ).then(() => {
        setDetalles(prev => prev.map(d => {
          const upd = updates.find(u => u.id === d.id);
          return upd ? { ...d, costo_base: upd.costo_base, total_final: upd.total_final } : d;
        }));
      });
    }
    autoSyncedRef.current.add(selectedCabecera.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCabecera?.id, detalles.length, formulaCtx, costoFilas.length, costoColumnas.length]);

  // ─── Detalles enriquecidos con valores dinámicos ──────────────────────────────
  const detallesConValores = useMemo<DetalleConValores[]>(() => {
    return detalles.map(d => {
      const vals: Record<string, CotizacionValorDinamico> = {};
      valoresDinamicos.filter(v => v.detalle_id === d.id).forEach(v => { vals[v.columna_id] = v; });
      return { ...d, valores: vals };
    });
  }, [detalles, valoresDinamicos]);

  // ─── Selected IDs for selector ───────────────────────────────────────────────
  const selectedFilaIds = useMemo(() => new Set(detalles.map(d => d.costo_fila_id).filter(Boolean) as string[]), [detalles]);

  // ─── Cabecera CRUD ────────────────────────────────────────────────────────────
  const handleSaveCabecera = useCallback(async (data: Omit<CotizacionCabecera, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'total_general'>) => {
    if (editingCabecera) {
      const { data: updated } = await supabase
        .from('cotizacion_cabecera')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', editingCabecera.id)
        .select()
        .maybeSingle();
      if (updated) {
        setCabeceras(prev => prev.map(c => c.id === editingCabecera.id ? updated as CotizacionCabecera : c));
        if (selectedCabecera?.id === editingCabecera.id) setSelectedCabecera(updated as CotizacionCabecera);
      }
    } else {
      const { data: newCab } = await supabase
        .from('cotizacion_cabecera')
        .insert({ ...data, total_general: 0 })
        .select()
        .maybeSingle();
      if (newCab) {
        setCabeceras(prev => [newCab as CotizacionCabecera, ...prev]);
        setSelectedCabecera(newCab as CotizacionCabecera);
      }
    }
    setEditingCabecera(null);
  }, [editingCabecera, selectedCabecera]);

  const handleDeleteCabecera = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar esta cotización? Se perderán todos sus detalles.')) return;
    await supabase.from('cotizacion_cabecera').delete().eq('id', id);
    setCabeceras(prev => prev.filter(c => c.id !== id));
    if (selectedCabecera?.id === id) { setSelectedCabecera(null); setDetalles([]); }
  }, [selectedCabecera]);

  // ─── Duplicar ─────────────────────────────────────────────────────────────────
  const handleDuplicate = useCallback(async (opts: { mes: number; anio: number; version: number; moneda: string; notas: string }) => {
    if (!duplicatingFrom) return;
    // 1. Create new cabecera
    const { data: newCab } = await supabase
      .from('cotizacion_cabecera')
      .insert({
        cliente: duplicatingFrom.cliente,
        mes: opts.mes,
        anio: opts.anio,
        version: opts.version,
        estado: 'borrador',
        moneda: opts.moneda,
        total_general: 0,
        notas: opts.notas,
      })
      .select()
      .maybeSingle();
    if (!newCab) return;

    // 2. Copy detalles
    const { data: srcDetalles } = await supabase
      .from('cotizacion_detalle')
      .select('*')
      .eq('cabecera_id', duplicatingFrom.id);

    if (srcDetalles && srcDetalles.length > 0) {
      const newDetalles = (srcDetalles as CotizacionDetalle[]).map(d => ({
        cabecera_id: (newCab as CotizacionCabecera).id,
        proceso: d.proceso,
        subproceso: d.subproceso,
        costo_base: d.costo_base,
        multiplicador_base: d.multiplicador_base,
        total_final: d.total_final,
        orden: d.orden,
        notas_fila: d.notas_fila,
        costo_fila_id: d.costo_fila_id,
      }));
      const { data: insertedDetalles } = await supabase.from('cotizacion_detalle').insert(newDetalles).select();

      // 3. Copy valores dinámicos
      if (insertedDetalles && insertedDetalles.length > 0) {
        const srcIds = (srcDetalles as CotizacionDetalle[]).map(d => d.id);
        const { data: srcVals } = await supabase.from('cotizacion_valores_dinamicos').select('*').in('detalle_id', srcIds);
        if (srcVals && srcVals.length > 0) {
          const idMap = new Map<string, string>();
          (srcDetalles as CotizacionDetalle[]).forEach((d, i) => {
            idMap.set(d.id, (insertedDetalles as CotizacionDetalle[])[i]?.id ?? '');
          });
          const newVals = (srcVals as CotizacionValorDinamico[])
            .filter(v => idMap.get(v.detalle_id))
            .map(v => ({
              detalle_id: idMap.get(v.detalle_id)!,
              columna_id: v.columna_id,
              raw_value: v.raw_value,
              computed_value: v.computed_value,
            }));
          if (newVals.length > 0) await supabase.from('cotizacion_valores_dinamicos').insert(newVals);
        }
      }
    }

    setCabeceras(prev => [newCab as CotizacionCabecera, ...prev]);
    setSelectedCabecera(newCab as CotizacionCabecera);
    setDuplicatingFrom(null);
  }, [duplicatingFrom]);

  // ─── Subproceso toggle ────────────────────────────────────────────────────────
  const handleToggleFila = useCallback(async (filaId: string) => {
    if (!selectedCabecera) return;
    const existing = detalles.find(d => d.costo_fila_id === filaId);
    if (existing) {
      await supabase.from('cotizacion_detalle').delete().eq('id', existing.id);
      setDetalles(prev => prev.filter(d => d.id !== existing.id));
      setValoresDinamicos(prev => prev.filter(v => v.detalle_id !== existing.id));
    } else {
      const fila = costoFilas.find(f => f.id === filaId);
      if (!fila) return;
      // Calculate costo_base from formula context
      const costoBase = costoColumnas.reduce((sum, col) => {
        if (col.tipo === 'texto' || col.tipo === 'select') return sum;
        if (col.tipo === 'formula') {
          const f = fila.formulas?.[col.id] ?? col.formula;
          if (!f) return sum;
          const mode = f.mode ?? 'terms';
          const has = (mode === 'expression' && !!f.expression?.trim()) || (mode === 'terms' && (f.terminos?.length ?? 0) > 0);
          return has ? sum + calcularFormula(f, formulaCtx, fila.subproceso) : sum;
        }
        const v = Number(fila.valores[col.id] ?? 0);
        return sum + (isNaN(v) ? 0 : v);
      }, 0);

      const { data: newDet } = await supabase.from('cotizacion_detalle').insert({
        cabecera_id: selectedCabecera.id,
        proceso: fila.proceso,
        subproceso: fila.subproceso ?? '',
        costo_base: costoBase,
        multiplicador_base: 1,
        total_final: costoBase,
        orden: detalles.length,
        notas_fila: '',
        costo_fila_id: filaId,
      }).select().maybeSingle();
      if (newDet) setDetalles(prev => [...prev, newDet as CotizacionDetalle]);
    }
  }, [selectedCabecera, detalles, costoFilas, costoColumnas, formulaCtx]);

  const handleSelectAllProceso = useCallback(async (proceso: string) => {
    if (!selectedCabecera) return;
    const toAdd = costoFilas.filter(f => f.proceso === proceso && !selectedFilaIds.has(f.id));
    if (toAdd.length === 0) return;
    const inserts = toAdd.map((f, idx) => {
      const costoBase = costoColumnas.reduce((sum, col) => {
        if (col.tipo === 'texto' || col.tipo === 'select') return sum;
        if (col.tipo === 'formula') {
          const fm = f.formulas?.[col.id] ?? col.formula;
          if (!fm) return sum;
          const mode = fm.mode ?? 'terms';
          const has = (mode === 'expression' && !!fm.expression?.trim()) || (mode === 'terms' && (fm.terminos?.length ?? 0) > 0);
          return has ? sum + calcularFormula(fm, formulaCtx, f.subproceso) : sum;
        }
        const v = Number(f.valores[col.id] ?? 0);
        return sum + (isNaN(v) ? 0 : v);
      }, 0);
      return {
        cabecera_id: selectedCabecera.id,
        proceso: f.proceso,
        subproceso: f.subproceso ?? '',
        costo_base: costoBase,
        multiplicador_base: 1,
        total_final: costoBase,
        orden: detalles.length + idx,
        notas_fila: '',
        costo_fila_id: f.id,
      };
    });
    const { data } = await supabase.from('cotizacion_detalle').insert(inserts).select();
    if (data) setDetalles(prev => [...prev, ...(data as CotizacionDetalle[])]);
  }, [selectedCabecera, costoFilas, selectedFilaIds, costoColumnas, formulaCtx, detalles.length]);

  const handleDeselectAllProceso = useCallback(async (proceso: string) => {
    if (!selectedCabecera) return;
    const toRemove = detalles.filter(d => d.proceso === proceso);
    if (toRemove.length === 0) return;
    await supabase.from('cotizacion_detalle').delete().in('id', toRemove.map(d => d.id));
    setDetalles(prev => prev.filter(d => d.proceso !== proceso));
    setValoresDinamicos(prev => prev.filter(v => !toRemove.find(r => r.id === v.detalle_id)));
  }, [selectedCabecera, detalles]);

  // ─── Detalle updates ──────────────────────────────────────────────────────────
  // Using regular functions (not useCallback) to completely avoid stale closures
  async function handleUpdateDetalle(id: string, field: keyof CotizacionDetalle, value: number | string) {
    const numericValue = field === 'multiplicador_base' ? parseFloat(String(value)) || 0 : value;

    // Compute total using the value we just received
    const det = detallesRef.current.find(d => d.id === id);
    const costoBase = det?.costo_base ?? 0;
    const multBase = field === 'multiplicador_base' ? (numericValue as number) : (det?.multiplicador_base ?? 1);
    const total = costoBase * multBase;

    // Update local state
    setDetalles(prev => prev.map(d => d.id === id ? { ...d, [field]: numericValue, total_final: total } : d));

    // DB update
    await supabase.from('cotizacion_detalle').update({ [field]: numericValue, total_final: total }).eq('id', id);
  }

  async function handleUpdateValorDinamico(detalleId: string, columnaId: string, rawValue: string) {
    const computed = parseFloat(rawValue) || 0;
    const existing = valoresDinamicosRef.current.find(v => v.detalle_id === detalleId && v.columna_id === columnaId);

    if (existing) {
      setValoresDinamicos(prev => prev.map(v => v.id === existing.id ? { ...v, raw_value: rawValue, computed_value: computed } : v));
      await supabase.from('cotizacion_valores_dinamicos').update({ raw_value: rawValue, computed_value: computed, updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      const { data } = await supabase.from('cotizacion_valores_dinamicos').insert({ detalle_id: detalleId, columna_id: columnaId, raw_value: rawValue, computed_value: computed }).select().maybeSingle();
      if (data) setValoresDinamicos(prev => [...prev, data as CotizacionValorDinamico]);
    }
  }

  async function handleRemoveDetalle(id: string) {
    await supabase.from('cotizacion_detalle').delete().eq('id', id);
    setDetalles(prev => prev.filter(d => d.id !== id));
    setValoresDinamicos(prev => prev.filter(v => v.detalle_id !== id));
  }

  // ─── Columnas dinámicas CRUD ──────────────────────────────────────────────────
  const handleAddColumnaDinamica = useCallback(async (data: Omit<CotizacionColumnaDinamica, 'id' | 'created_at'>) => {
    const { data: newCol } = await supabase.from('cotizacion_columnas_dinamicas').insert(data).select().maybeSingle();
    if (newCol) setColumnasDinamicas(prev => [...prev, newCol as CotizacionColumnaDinamica]);
  }, []);

  const handleUpdateColumnaDinamica = useCallback(async (id: string, data: Partial<CotizacionColumnaDinamica>) => {
    await supabase.from('cotizacion_columnas_dinamicas').update(data).eq('id', id);
    setColumnasDinamicas(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
  }, []);

  const handleDeleteColumnaDinamica = useCallback(async (id: string) => {
    await supabase.from('cotizacion_columnas_dinamicas').delete().eq('id', id);
    setColumnasDinamicas(prev => prev.filter(c => c.id !== id));
    // Limpiar valores dinámicos huérfanos de esa columna en el estado local
    setValoresDinamicos(prev => prev.filter(v => v.columna_id !== id));
  }, []);

  const handleUpdateColumnaHeader = useCallback(async (id: string, newName: string) => {
    await supabase.from('cotizacion_columnas_dinamicas').update({ name: newName.trim() }).eq('id', id);
    setColumnasDinamicas(prev => prev.map(c => c.id === id ? { ...c, name: newName.trim() } : c));
  }, []);

  /**
   * Sincroniza el renombre de una key en todas las fórmulas afectadas.
   * Se llama desde AdminColumnasDinamicasModal cuando cambia la key de una columna.
   */
  const handleSyncKeyRename = useCallback(async (
    updates: Map<string, string>,
    totalFormulaUpdated?: string,
  ) => {
    if (updates.size === 0 && !totalFormulaUpdated) return;

    // Actualizar fórmulas de columnas dinámicas
    const updatePromises = Array.from(updates.entries()).map(([colId, newExpr]) =>
      supabase
        .from('cotizacion_columnas_dinamicas')
        .update({ formula_expression: newExpr })
        .eq('id', colId)
    );
    await Promise.all(updatePromises);

    // Actualizar estado local de columnas
    setColumnasDinamicas(prev =>
      prev.map(c => updates.has(c.id) ? { ...c, formula_expression: updates.get(c.id)! } : c)
    );

    // Actualizar fórmula del total si fue afectada
    if (totalFormulaUpdated !== undefined && selectedCabecera) {
      const formula = totalFormulaUpdated.trim() || null;
      setTotalFormula(formula ?? '');
      setSelectedCabecera(prev => prev ? { ...prev, total_formula: formula } : prev);
      setCabeceras(prev => prev.map(c => c.id === selectedCabecera.id ? { ...c, total_formula: formula } : c));
      await supabase
        .from('cotizacion_cabecera')
        .update({ total_formula: formula, updated_at: new Date().toISOString() })
        .eq('id', selectedCabecera.id);
    }
  }, [selectedCabecera]);

  // ─── Reorder columnas dinámicas ────────────────────────────────────────────────────
  const handleReorderColumnas = useCallback(async (orderedIds: string[]) => {
    // Optimistic update
    setColumnasDinamicas(prev => {
      const map = new Map(prev.map(c => [c.id, c]));
      return orderedIds
        .map((id, idx) => map.get(id) ? { ...map.get(id)!, sort_order: idx } : null)
        .filter(Boolean) as CotizacionColumnaDinamica[];
    });
    // Persist each sort_order to DB
    await Promise.all(
      orderedIds.map((id, idx) =>
        supabase.from('cotizacion_columnas_dinamicas').update({ sort_order: idx }).eq('id', id)
      )
    );
  }, []);

  // ─── Fixed header update ──────────────────────────────────────────────────────
  const handleUpdateFixedHeader = useCallback((key: keyof FixedColumnHeaders, newName: string) => {
    if (!selectedCabecera) return;
    setFixedHeaders(prev => {
      const updated = { ...prev, [key]: newName };
      localStorage.setItem(`fixed_headers_${selectedCabecera.id}`, JSON.stringify(updated));
      return updated;
    });
  }, [selectedCabecera]);

  const handleUpdateTotalFormula = useCallback(async (expression: string) => {
    if (!selectedCabecera) return;
    const formula = expression.trim() || null;
    // Optimistic update
    setTotalFormula(formula ?? '');
    setSelectedCabecera(prev => prev ? { ...prev, total_formula: formula } : prev);
    setCabeceras(prev => prev.map(c => c.id === selectedCabecera.id ? { ...c, total_formula: formula } : c));
    // Persist to Supabase
    await supabase
      .from('cotizacion_cabecera')
      .update({ total_formula: formula, updated_at: new Date().toISOString() })
      .eq('id', selectedCabecera.id);
  }, [selectedCabecera]);

  // ─── Sincronizar costos base con valores actuales de costos_operacion ──────────
  const [syncingCostos, setSyncingCostos] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);

  const handleSyncCostosBase = useCallback(async () => {
    if (!selectedCabecera || detalles.length === 0) return;
    setSyncingCostos(true);
    try {
      const updates: { id: string; costo_base: number; total_final: number }[] = [];
      for (const det of detalles) {
        if (!det.costo_fila_id) continue;
        const fila = costoFilas.find(f => f.id === det.costo_fila_id);
        if (!fila) continue;
        const newCostoBase = costoColumnas.reduce((sum, col) => {
          if (col.tipo === 'texto' || col.tipo === 'select') return sum;
          if (col.tipo === 'formula') {
            const f = fila.formulas?.[col.id] ?? col.formula;
            if (!f) return sum;
            const mode = f.mode ?? 'terms';
            const has = (mode === 'expression' && !!f.expression?.trim()) || (mode === 'terms' && (f.terminos?.length ?? 0) > 0);
            return has ? sum + calcularFormula(f, formulaCtx, fila.subproceso) : sum;
          }
          const v = Number(fila.valores[col.id] ?? 0);
          return sum + (isNaN(v) ? 0 : v);
        }, 0);
        const newTotal = newCostoBase * det.multiplicador_base;
        if (Math.abs(newCostoBase - det.costo_base) > 0.001) {
          updates.push({ id: det.id, costo_base: newCostoBase, total_final: newTotal });
        }
      }
      if (updates.length > 0) {
        await Promise.all(
          updates.map(u =>
            supabase.from('cotizacion_detalle').update({ costo_base: u.costo_base, total_final: u.total_final }).eq('id', u.id)
          )
        );
        setDetalles(prev => prev.map(d => {
          const upd = updates.find(u => u.id === d.id);
          return upd ? { ...d, costo_base: upd.costo_base, total_final: upd.total_final } : d;
        }));
      }
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 3000);
    } finally {
      setSyncingCostos(false);
    }
  }, [selectedCabecera, detalles, costoFilas, costoColumnas, formulaCtx]);

  // ─── Update total_general on cabecera ─────────────────────────────────────────
  const handleSaveTotalGeneral = useCallback(async () => {
    if (!selectedCabecera) return;
    setSavingMult(true);
    try {
      // Persist all pending detalle values first (they are already saved on blur/enter,
      // so here we just recalculate the grand total and update the cabecera header)
      const { computeRowTotal } = await import('@/lib/cotizacionFormulaEngine');
      const formula = selectedCabecera.total_formula?.trim() ?? '';
      const totalLineas = detallesConValores.length;
      const total = detallesConValores.reduce((sum, d) => {
        return sum + computeRowTotal(d, columnasDinamicas, 1, formula || undefined, totalLineas);
      }, 0);

      skipDetallesReloadRef.current = true;
      await supabase
        .from('cotizacion_cabecera')
        .update({ total_general: total, updated_at: new Date().toISOString() })
        .eq('id', selectedCabecera.id);

      setCabeceras(prev => prev.map(c => c.id === selectedCabecera.id ? { ...c, total_general: total } : c));
      setSelectedCabecera(prev => prev ? { ...prev, total_general: total } : prev);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } finally {
      setSavingMult(false);
    }
  }, [selectedCabecera, detallesConValores, columnasDinamicas]);

  // ─── Comparativa: find previous period ───────────────────────────────────────
  const previousCabecera = useMemo<CotizacionCabecera | null>(() => {
    if (!selectedCabecera) return null;
    const prevMes = selectedCabecera.mes === 1 ? 12 : selectedCabecera.mes - 1;
    const prevAnio = selectedCabecera.mes === 1 ? selectedCabecera.anio - 1 : selectedCabecera.anio;
    return cabeceras.find(c =>
      c.cliente === selectedCabecera.cliente &&
      c.mes === prevMes &&
      c.anio === prevAnio &&
      c.id !== selectedCabecera.id
    ) ?? null;
  }, [selectedCabecera, cabeceras]);

  const [previousDetalles, setPreviousDetalles] = useState<CotizacionDetalle[]>([]);
  useEffect(() => {
    if (showComparativa && previousCabecera) {
      supabase.from('cotizacion_detalle').select('*').eq('cabecera_id', previousCabecera.id).then(({ data }) => {
        setPreviousDetalles((data as CotizacionDetalle[]) ?? []);
      });
    }
  }, [showComparativa, previousCabecera]);

  // ─── Next version for duplicate ───────────────────────────────────────────────
  const nextVersion = useMemo(() => {
    if (!duplicatingFrom) return 1;
    const same = cabeceras.filter(c => c.cliente === duplicatingFrom.cliente);
    return Math.max(...same.map(c => c.version), 0) + 1;
  }, [duplicatingFrom, cabeceras]);

  // ─── Descargar cotización como CSV ───────────────────────────────────────────
  const handleDownloadCSV = useCallback(() => {
    if (!selectedCabecera || detallesConValores.length === 0) return;
    const activeCols = columnasDinamicas
      .filter(c => c.is_active && c.is_visible)
      .sort((a, b) => a.sort_order - b.sort_order);
    const headers = ['Proceso', 'Subproceso', 'Costo base', ...activeCols.map(c => c.name), 'Total'];
    const rows = detallesConValores.map(d => {
      const total = computeRowTotal(d, columnasDinamicas, 1, totalFormula?.trim() || undefined, detallesConValores.length);
      const colVals = activeCols.map(col => {
        const v = d.valores[col.id];
        return v?.raw_value ?? '';
      });
      return [d.proceso, d.subproceso, d.costo_base, ...colVals, total];
    });
    const grandTotal = detallesConValores.reduce((s, d) => s + computeRowTotal(d, columnasDinamicas, 1, totalFormula?.trim() || undefined, detallesConValores.length), 0);
    const totalRow = ['', '', '', ...activeCols.map(() => ''), grandTotal];
    const escape = (v: string | number) => {
      const s = String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const csv = [
      headers.map(escape).join(','),
      ...rows.map(r => r.map(escape).join(',')),
      totalRow.map(escape).join(','),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeName = selectedCabecera.cliente.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
    link.download = `cotizacion_${safeName}_${selectedCabecera.anio}_${String(selectedCabecera.mes).padStart(2, '0')}_v${selectedCabecera.version}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [selectedCabecera, detallesConValores, columnasDinamicas, totalFormula]);

  if (loading) {
    return (
      <AppLayout title="Cotizaciones" subtitle="Cargando...">
        <div className="flex items-center justify-center py-32">
          <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  const cfg = selectedCabecera ? ESTADO_V2_CONFIG[selectedCabecera.estado] : null;

  return (
    <AppLayout
      title="Cotizaciones"
      subtitle="Sistema de cotizaciones mensuales por cliente con historial y versiones"
      actions={
        selectedCabecera && (
          <div className="flex items-center gap-2 flex-wrap">
            {/* Expandir tabla */}
            <button
              onClick={() => setTableFullscreen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-800 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
              title="Ver tabla en pantalla completa"
            >
              <i className="ri-fullscreen-line text-sm" />
              Expandir
            </button>
            {/* Descargar CSV */}
            <button
              onClick={handleDownloadCSV}
              disabled={detallesConValores.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:border-emerald-300 text-slate-600 hover:text-emerald-700 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40"
              title="Descargar cotización como CSV"
            >
              <i className="ri-download-2-line text-sm" />
              Descargar CSV
            </button>
            {/* Sync costos */}
            <div className="relative">
              <button
                onClick={handleSyncCostosBase}
                disabled={syncingCostos}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:border-amber-300 text-slate-600 hover:text-amber-700 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                title="Recalcula el costo base de cada proceso con los valores actuales de Costos por Operación"
              >
                {syncingCostos ? (
                  <><div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />Sincronizando...</>
                ) : (
                  <><i className="ri-refresh-line text-sm" />Sincronizar costos</>
                )}
              </button>
              {syncSuccess && (
                <div className="absolute right-0 top-full mt-2 z-50 flex items-center gap-2 bg-amber-600 text-white text-xs font-semibold px-3 py-2 rounded-lg whitespace-nowrap">
                  <i className="ri-checkbox-circle-line text-sm" />
                  Costos actualizados
                </div>
              )}
            </div>
            {/* Comparativa */}
            <button
              onClick={() => setShowComparativa(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-800 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-bar-chart-2-line text-sm" />
              Comparar
            </button>
            {/* Admin columnas */}
            <button
              onClick={() => setShowAdminColumnas(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-800 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-table-alt-line text-sm" />
              Columnas
            </button>
            {/* Save total */}
            <div className="relative">
              <button
                onClick={handleSaveTotalGeneral}
                disabled={savingMult}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                {savingMult ? (
                  <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Guardando...</>
                ) : (
                  <><i className="ri-save-line text-sm" />Guardar total</>
                )}
              </button>
              {saveSuccess && (
                <div className="absolute right-0 top-full mt-2 z-50 flex items-center gap-2 bg-emerald-600 text-white text-xs font-semibold px-3 py-2 rounded-lg shadow-lg whitespace-nowrap animate-fade-in">
                  <i className="ri-checkbox-circle-line text-sm" />
                  Total guardado correctamente
                </div>
              )}
            </div>
          </div>
        )
      }
    >
      <div className="flex gap-5 h-[calc(100vh-140px)]">
        {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
        <div className="w-72 flex-shrink-0 h-full">
          <CotizacionSidebar
            cotizaciones={cabeceras}
            selectedId={selectedCabecera?.id ?? null}
            onSelect={setSelectedCabecera}
            onNew={() => { setEditingCabecera(null); setShowNuevaModal(true); }}
            onDuplicate={c => setDuplicatingFrom(c)}
            onDelete={handleDeleteCabecera}
          />
        </div>

        {/* ── Main content ─────────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {selectedCabecera ? (
            <>
              {/* Cabecera info bar */}
              <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-start justify-between gap-4 flex-shrink-0">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-emerald-100 flex-shrink-0">
                    <i className="ri-building-4-line text-emerald-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-bold text-slate-800">{selectedCabecera.cliente}</h2>
                      {cfg && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cfg.color}`}>
                          <i className={`${cfg.icon} mr-1`} />
                          {cfg.label}
                        </span>
                      )}
                      <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                        {MESES[selectedCabecera.mes - 1]} {selectedCabecera.anio} · v{selectedCabecera.version}
                      </span>
                      <span className="text-xs text-slate-400">{selectedCabecera.moneda}</span>
                    </div>
                    {selectedCabecera.notas && (
                      <p className="text-xs text-slate-500 mt-1.5 max-w-lg">{selectedCabecera.notas}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => { setEditingCabecera(selectedCabecera); setShowNuevaModal(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:border-slate-300 text-slate-600 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-pencil-line text-xs" />
                    Editar
                  </button>
                  <button
                    onClick={() => setDuplicatingFrom(selectedCabecera)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:border-slate-300 text-slate-600 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-file-copy-line text-xs" />
                    Duplicar
                  </button>
                </div>
              </div>

              {/* Content: selector + table */}
              <div className="flex gap-4 flex-1 min-h-0">
                {/* Subproceso selector */}
                <div className="w-56 flex-shrink-0 bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
                  <div className="px-3 py-3 border-b border-slate-100 flex-shrink-0">
                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Subprocesos</p>
                    <p className="text-xs text-slate-400 mt-0.5">{detalles.length} seleccionados</p>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    {loadingDetalles ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : (
                      <CotizacionSubprocesoSelector
                        filas={costoFilas}
                        selectedIds={selectedFilaIds}
                        onToggle={handleToggleFila}
                        onSelectAll={handleSelectAllProceso}
                        onDeselectAll={handleDeselectAllProceso}
                      />
                    )}
                  </div>
                </div>

                {/* Table */}
                <div className="flex-1 min-w-0 overflow-auto">
                  {loadingDetalles ? (
                    <div className="flex items-center justify-center py-16 bg-white rounded-xl border border-slate-200">
                      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <CotizacionDetalleTable
                      detalles={detallesConValores}
                      columnasDinamicas={columnasDinamicas}
                      moneda={selectedCabecera.moneda}
                      globalMultiplier={1}
                      totalLineas={detallesConValores.length}
                      onUpdateDetalle={handleUpdateDetalle}
                      onUpdateValorDinamico={handleUpdateValorDinamico}
                      onRemoveDetalle={handleRemoveDetalle}
                      onUpdateColumnaHeader={handleUpdateColumnaHeader}
                      onReorderColumnas={handleReorderColumnas}
                      fixedHeaders={fixedHeaders}
                      onUpdateFixedHeader={handleUpdateFixedHeader}
                      totalFormula={totalFormula}
                      onUpdateTotalFormula={handleUpdateTotalFormula}
                    />
                  )}
                </div>
              </div>
            </>
          ) : (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center gap-5 bg-white rounded-xl border border-slate-200 border-dashed">
              <div className="w-20 h-20 flex items-center justify-center rounded-2xl bg-slate-100">
                <i className="ri-file-list-3-line text-3xl text-slate-400" />
              </div>
              <div className="text-center">
                <p className="text-slate-700 font-bold text-lg">Ninguna cotización seleccionada</p>
                <p className="text-slate-400 text-sm mt-1.5 max-w-sm">
                  Selecciona una cotización del historial o crea una nueva para empezar
                </p>
              </div>
              <button
                onClick={() => { setEditingCabecera(null); setShowNuevaModal(true); }}
                className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-add-line" />
                Nueva cotización
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────────── */}
      {showNuevaModal && (
        <NuevaCotizacionModal
          editing={editingCabecera}
          defaultCliente={selectedCabecera?.cliente}
          onClose={() => { setShowNuevaModal(false); setEditingCabecera(null); }}
          onSave={handleSaveCabecera}
        />
      )}

      {duplicatingFrom && (
        <DuplicarCotizacionModal
          source={duplicatingFrom}
          nextVersion={nextVersion}
          onClose={() => setDuplicatingFrom(null)}
          onConfirm={handleDuplicate}
        />
      )}

      {showAdminColumnas && (() => {
        // Construir valores REALES de preview usando el motor de cálculo acumulado
        const firstRow = detallesConValores[0];
        const nLineas = detallesConValores.length;
        let adminPreviewValues: Record<string, number> | undefined;
        if (firstRow) {
          // buildRowVarContext aplica raw_values reales de columnas dinámicas
          // (cantidad_lineas, cantidad_unidades vienen del raw_value de la fila, no del sistema)
          const fullCtx = buildRowVarContext(firstRow, columnasDinamicas, Infinity, 1, nLineas);
          adminPreviewValues = { ...fullCtx };
        }
        return (
          <AdminColumnasDinamicasModal
            columnas={columnasDinamicas}
            onClose={() => setShowAdminColumnas(false)}
            onAdd={handleAddColumnaDinamica}
            onUpdate={handleUpdateColumnaDinamica}
            onDelete={handleDeleteColumnaDinamica}
            totalFormula={totalFormula}
            onSyncKeyRename={handleSyncKeyRename}
            previewRowValues={adminPreviewValues}
          />
        );
      })()}

      {showComparativa && selectedCabecera && (
        <CotizacionComparativa
          current={selectedCabecera}
          previous={previousCabecera}
          currentDetalles={detalles}
          previousDetalles={previousDetalles}
          onClose={() => setShowComparativa(false)}
        />
      )}

      {/* Fullscreen table overlay */}
      {tableFullscreen && selectedCabecera && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-100">
                <i className="ri-table-alt-line text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">{selectedCabecera.cliente}</p>
                <p className="text-xs text-slate-400">{MESES[selectedCabecera.mes - 1]} {selectedCabecera.anio} · v{selectedCabecera.version}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadCSV}
                disabled={detallesConValores.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:border-emerald-300 text-slate-600 hover:text-emerald-700 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40"
              >
                <i className="ri-download-2-line text-sm" />
                Descargar CSV
              </button>
              <button
                onClick={() => setTableFullscreen(false)}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-close-line text-sm" />
                Cerrar
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <CotizacionDetalleTable
              detalles={detallesConValores}
              columnasDinamicas={columnasDinamicas}
              moneda={selectedCabecera.moneda}
              globalMultiplier={1}
              totalLineas={detallesConValores.length}
              onUpdateDetalle={handleUpdateDetalle}
              onUpdateValorDinamico={handleUpdateValorDinamico}
              onRemoveDetalle={handleRemoveDetalle}
              onUpdateColumnaHeader={handleUpdateColumnaHeader}
              onReorderColumnas={handleReorderColumnas}
              fixedHeaders={fixedHeaders}
              onUpdateFixedHeader={handleUpdateFixedHeader}
              totalFormula={totalFormula}
              onUpdateTotalFormula={handleUpdateTotalFormula}
            />
          </div>
        </div>
      )}
    </AppLayout>
  );
}
