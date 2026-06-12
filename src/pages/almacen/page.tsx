import React, { useState, useEffect, useCallback, useMemo, useTransition, useDeferredValue } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchBaseQueryData } from '@/lib/formulaBaseCache';
import AppLayout from '@/components/feature/AppLayout';
import type { CostoAlmacenColumna, CostoAlmacenFila, ColumnType, FormulaConfig, ZonaColumnaDinamica, ZonaCeldaFormula, AlmacenZonaArticuloCompaniaRow, AlmacenResumenCompleto } from '@/types/almacen';
import type { FormulaContext } from '@/lib/formulaEngine';
import { EMPTY_FORMULA_CTX } from '@/lib/formulaEngine';
import type { InversionRecord } from '@/types/inversion';
import CostosAlmacenTable from './components/CostosAlmacenTable';
import AddColumnModal from './components/AddColumnModal';
import ExcelUploadModal from './components/ExcelUploadModal';
import ZonaCeldaFormulaEditor from './components/ZonaCeldaFormulaEditor';
import { evalFormula } from '@/lib/mathEvaluator';
import { buildVariableDefs, buildVariableMap, type VariableDef } from '@/lib/formulaVariables';
import { toAllDataSources } from '@/lib/formulaEngine';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, horizontalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  useMasivoResumen, useAlmacenResumenCompleto, useAlmacenZonaCompaniaResumen, useAlmacenClusterCompaniaResumen,
  MasivoRawTable, StatCard,
} from './components/MasivoHooks';
import ExportMenu from '@/components/base/ExportMenu';
import { useZonaClusters, type ZonaCluster } from '@/hooks/useZonaClusters';
import ZonaClusterManager, { clusterActiveBg } from '@/components/feature/ZonaClusterManager';

type ModalState = { open: false } | { open: true; editing: CostoAlmacenColumna | null };

export default function AlmacenPage() {
  const [columnas, setColumnas] = useState<CostoAlmacenColumna[]>([]);
  const [filas, setFilas] = useState<CostoAlmacenFila[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [modalState, setModalState] = useState<ModalState>({ open: false });
  const [showUpload, setShowUpload] = useState(false);
  const [formulaCtx, setFormulaCtx] = useState<FormulaContext>(EMPTY_FORMULA_CTX);

  const { data: masivoData, load: loadMasivo } = useMasivoResumen();
  const { data: resumenCompleto, loading: resumenLoading, load: loadResumen } = useAlmacenResumenCompleto();

  const [tab, setTab] = useState<'resumen' | 'articulos' | 'zonas' | 'datos' | 'operacion'>('resumen');

  const hasMasivo = !!masivoData && masivoData.totalRegistros > 0;

  const loadData = useCallback(async () => {
    setLoading(true);
    // Shared reference data (cached) + almacen-specific tables fetched in parallel
    const [
      base,
      { data: colData },
      { data: filData },
      { data: costosOpColData },
      { data: costosOpFilData },
    ] = await Promise.all([
      fetchBaseQueryData(),
      supabase.from('costos_almacen_columnas').select('*').order('orden'),
      supabase.from('costos_almacen_operacion').select('*').order('orden'),
      supabase.from('costos_columnas').select('*').order('orden'),
      supabase.from('costos_operacion').select('*').order('orden'),
    ]);

    const {
      areasData, invData, gastosColData, gastosFilData, areaDistribData,
      moColData, moFilData, empData, volColData, volFilData,
      volDistData, factoresData,
    } = base;

    const cols = (colData as CostoAlmacenColumna[]) ?? [];
    const rows = (filData as CostoAlmacenFila[]) ?? [];
    setColumnas(cols);
    setFilas(rows);

    const areasWithCat = ((areasData ?? []) as any[]).map((a: any) => ({
      id: a.id,
      nombre: a.nombre,
      metros_cuadrados: a.metros_cuadrados ?? 0,
      metros_cubicos: a.metros_cubicos ?? 0,
      cantidad_racks: a.cantidad_racks ?? 0,
      categoria: a.categoria,
      costo_area: a.costo_area ?? 0,
      costo_area_formula: a.costo_area_formula,
    }));
    const categoryTotals: Record<string, number> = {};
    areasWithCat.forEach(a => {
      const cat = a.categoria ?? 'Sin categoría';
      categoryTotals[cat] = (categoryTotals[cat] ?? 0) + (a.metros_cuadrados ?? 0);
    });
    const enrichedAreaDist = ((areaDistribData ?? []) as { area_name: string; global_distribution_percentage: number }[]).map(d => {
      const match = areasWithCat.find(a => a.nombre === d.area_name);
      const cat = match?.categoria ?? 'Sin categoría';
      const areaM2 = match?.metros_cuadrados ?? 0;
      const catTotal = categoryTotals[cat] ?? 0;
      const catPct = catTotal > 0 ? (areaM2 / catTotal) * 100 : 0;
      return {
        ...d,
        categoria: cat,
        category_distribution_percentage: +catPct.toFixed(2),
      };
    });

    const mappedAreasData = areasWithCat.map(a => ({
      nombre: a.nombre,
      metros_cuadrados: a.metros_cuadrados ?? 0,
      cantidad_racks: a.cantidad_racks ?? 0,
      metros_cubicos: a.metros_cubicos ?? 0,
      costo_area: a.costo_area ?? 0,
    }));

    const ctx: FormulaContext = {
      inversiones: (invData as InversionRecord[]) ?? [],
      gastosColumnas: (gastosColData ?? []) as FormulaContext['gastosColumnas'],
      gastosFilas: (gastosFilData ?? []) as FormulaContext['gastosFilas'],
      areaDistribucion: enrichedAreaDist as FormulaContext['areaDistribucion'],
      manoObraColumnas: (moColData ?? []) as FormulaContext['manoObraColumnas'],
      manoObraFilas: (moFilData ?? []) as FormulaContext['manoObraFilas'],
      manoObraEmpleados: (empData ?? []) as FormulaContext['manoObraEmpleados'],
      volumenesColumnas: (volColData ?? []) as FormulaContext['volumenesColumnas'],
      volumenesFilas: (volFilData ?? []) as FormulaContext['volumenesFilas'],
      costosColumnas: (costosOpColData ?? []) as FormulaContext['costosColumnas'],
      costosFilas: (costosOpFilData ?? []) as FormulaContext['costosFilas'],
      areasData: mappedAreasData,
      volDistribucion: (volDistData ?? []) as FormulaContext['volDistribucion'],
      factores: (factoresData ?? []) as FormulaContext['factores'],
      masivoArticulos: [],
      masivoZonas: [],
      masivoZonaArticulos: [],
      masivoTotals: undefined,
    };
    setFormulaCtx(ctx);
    setLoading(false);
  }, []);

  const { clusters, loadClusters } = useZonaClusters('costos_almacen_clusters');
  useEffect(() => { loadData(); loadMasivo(); loadClusters(); }, [loadData, loadMasivo, loadClusters]);

  useEffect(() => {
    if ((tab === 'articulos' || tab === 'zonas') && !resumenCompleto && hasMasivo) {
      loadResumen();
    }
  }, [tab, resumenCompleto, loadResumen, hasMasivo]);

  const handleSaveColumn = async (data: { nombre: string; tipo: ColumnType; opciones: string[]; formula?: FormulaConfig }) => {
    const isEditing = modalState.open && modalState.editing;
    const payload = { nombre: data.nombre, tipo: data.tipo, opciones: data.opciones, formula: data.formula ?? null };
    if (isEditing && modalState.editing) {
      await supabase.from('costos_almacen_columnas').update(payload).eq('id', modalState.editing.id);
    } else {
      await supabase.from('costos_almacen_columnas').insert({ ...payload, orden: columnas.length });
    }
    setModalState({ open: false });
    await loadData();
  };

  const handleDeleteColumn = async (id: string) => {
    if (!confirm('¿Eliminar esta columna? Se perderán todos los valores registrados en ella.')) return;
    await supabase.from('costos_almacen_columnas').delete().eq('id', id);
    setColumnas(prev => prev.filter(c => c.id !== id));
  };

  const handleAddFila = async () => {
    const { data: newFila } = await supabase.from('costos_almacen_operacion').insert({ proceso: 'Nuevo proceso', subproceso: '', valores: {}, orden: filas.length }).select().maybeSingle();
    if (newFila) setFilas(prev => [...prev, newFila as CostoAlmacenFila]);
  };

  const handleUpdateFila = useCallback(async (id: string, field: string, value: string | number) => {
    setSavingId(id);
    setFilas(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f));
    await supabase.from('costos_almacen_operacion').update({ [field]: value }).eq('id', id);
    setSavingId(null);
  }, []);

  const handleUpdateCell = useCallback(async (id: string, columnaId: string, value: string | number) => {
    setSavingId(id);
    setFilas(prev => prev.map(f => {
      if (f.id !== id) return f;
      return { ...f, valores: { ...f.valores, [columnaId]: value } };
    }));
    const fila = filas.find(f => f.id === id);
    if (!fila) { setSavingId(null); return; }
    await supabase.from('costos_almacen_operacion').update({ valores: { ...fila.valores, [columnaId]: value } }).eq('id', id);
    setSavingId(null);
  }, [filas]);

  const handleDeleteFila = async (id: string) => {
    await supabase.from('costos_almacen_operacion').delete().eq('id', id);
    setFilas(prev => prev.filter(f => f.id !== id));
  };

  const handleSaveRowFormula = useCallback(async (rowId: string, colId: string, formula: FormulaConfig) => {
    const fila = filas.find(f => f.id === rowId);
    if (!fila) return;
    const newFormulas = { ...(fila.formulas ?? {}), [colId]: formula };
    setFilas(prev => prev.map(f => f.id === rowId ? { ...f, formulas: newFormulas } : f));
    await supabase.from('costos_almacen_operacion').update({ formulas: newFormulas }).eq('id', rowId);
  }, [filas]);

  const handleClearRowFormula = useCallback(async (rowId: string, colId: string) => {
    const fila = filas.find(f => f.id === rowId);
    if (!fila) return;
    const newFormulas = { ...(fila.formulas ?? {}) };
    delete newFormulas[colId];
    setFilas(prev => prev.map(f => f.id === rowId ? { ...f, formulas: newFormulas } : f));
    await supabase.from('costos_almacen_operacion').update({ formulas: newFormulas }).eq('id', rowId);
  }, [filas]);

  const fmt = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);

  if (loading) {
    return (
      <AppLayout title="Almacén" subtitle="Cargando módulo...">
        <div className="flex items-center justify-center py-32">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Cargando datos...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Almacén"
      subtitle="Datos masivos de almacenaje + matriz de costos de almacén con fórmulas"
      actions={
        <div className="flex items-center gap-2">
          <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap">
            <div className="w-4 h-4 flex items-center justify-center"><i className="ri-file-excel-2-line" /></div>
            Cargar Excel masivo
          </button>
          {tab === 'operacion' && (
            <>
              <button onClick={() => setModalState({ open: true, editing: null })} className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap">
                <div className="w-4 h-4 flex items-center justify-center"><i className="ri-add-line" /></div>
                Agregar columna
              </button>
              <button onClick={handleAddFila} className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap">
                <div className="w-4 h-4 flex items-center justify-center"><i className="ri-add-line" /></div>
                Agregar fila
              </button>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Datos masivos de almacenaje</h3>
              <p className="text-xs text-slate-400 mt-0.5">Archivo cargado tal cual, sin transformaciones</p>
            </div>
            {hasMasivo && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 font-medium">{fmt(masivoData!.totalRegistros)} registros</span>
            )}
          </div>

          {!hasMasivo ? (
            <div className="px-6 py-12 flex flex-col items-center gap-4">
              <div className="w-14 h-14 flex items-center justify-center rounded-full bg-teal-50">
                <i className="ri-database-2-line text-2xl text-teal-400" />
              </div>
              <div className="text-center max-w-sm">
                <p className="text-slate-700 font-semibold text-sm">Sin datos masivos</p>
                <p className="text-slate-400 text-xs mt-1">Carga un archivo Excel con los datos de almacenaje para ver el resumen y usarlo en fórmulas.</p>
              </div>
              <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap">
                <div className="w-4 h-4 flex items-center justify-center"><i className="ri-file-excel-2-line" /></div>Cargar Excel
              </button>
            </div>
          ) : (
            <div className="px-6 py-4">
              <div className="flex gap-1 mb-4 flex-wrap">
                <TabBtn tab="resumen" current={tab} onClick={setTab} icon="ri-dashboard-line" label="Resumen" />
                <TabBtn tab="articulos" current={tab} onClick={setTab} icon="ri-price-tag-3-line" label="Por Artículo" badge={resumenCompleto?.totalArticulos} />
                <TabBtn tab="zonas" current={tab} onClick={setTab} icon="ri-store-2-line" label="Por Zona Almacenaje" badge={resumenCompleto?.totalZonas} />
                <TabBtn tab="datos" current={tab} onClick={setTab} icon="ri-table-line" label="Ver datos" />
                <TabBtn tab="operacion" current={tab} onClick={setTab} icon="ri-calculator-line" label="Operación" badge={columnas.length > 0 ? columnas.length : undefined} badgeLabel="cols" />
              </div>

              {tab === 'resumen' && <ResumenTab data={masivoData!} resumen={resumenCompleto} />}
              {tab === 'articulos' && <ArticuloResumenTable data={resumenCompleto?.articulos} loading={resumenLoading} globalTotals={resumenCompleto ? { totalUnid: resumenCompleto.totalUnidades, totalCount: resumenCompleto.totalArticulos } : undefined} />}
              {tab === 'zonas' && <ZonaResumenTable data={resumenCompleto?.zonas} loading={resumenLoading} globalTotals={resumenCompleto ? { totalUnid: resumenCompleto.totalUnidades, totalCount: resumenCompleto.totalZonas } : undefined} formulaCtx={formulaCtx} clusters={clusters} onClustersChange={loadClusters} />}
              {tab === 'datos' && <MasivoRawTable headers={masivoData!.headers} />}
              {tab === 'operacion' && (
                <CostosAlmacenTable
                  columnas={columnas}
                  filas={filas}
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
                  formulaCtx={formulaCtx}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {modalState.open && (
        <AddColumnModal
          onClose={() => setModalState({ open: false })}
          onSave={handleSaveColumn}
          editing={modalState.editing}
          formulaCtx={formulaCtx}
        />
      )}

      {showUpload && (
        <ExcelUploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={() => { loadData(); loadMasivo(); loadResumen(); }}
        />
      )}
    </AppLayout>
  );
}

// ── Tab Button ─────────────────────────────────────────────────────────────

function TabBtn({ tab, current, onClick, icon, label, badge, badgeLabel }: {
  tab: string; current: string; onClick: (t: any) => void;
  icon: string; label: string; badge?: number; badgeLabel?: string;
}) {
  const isActive = current === tab;
  return (
    <button onClick={() => onClick(tab)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${isActive ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
      <div className="w-3.5 h-3.5 flex items-center justify-center"><i className={`${icon} text-[11px]`} /></div>
      {label}
      {badge !== undefined && badge > 0 && (
        <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${isActive ? 'bg-white/20 text-white' : 'bg-teal-100 text-teal-700'}`}>
          {badge}{badgeLabel ? ` ${badgeLabel}` : ''}
        </span>
      )}
    </button>
  );
}

// ── Resumen Tab ────────────────────────────────────────────────────────────

function ResumenTab({ data, resumen }: { data: { totalRegistros: number; headers: string[] }; resumen?: AlmacenResumenCompleto }) {
  const fmt = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="ri-database-2-line" iconColor="text-teal-500" bg="bg-teal-50" label="Total registros" value={fmt(data.totalRegistros)} sub="filas cargadas" />
        <StatCard icon="ri-barcode-line" iconColor="text-rose-500" bg="bg-rose-50" label="SKU distintos" value={resumen ? fmt(resumen.totalArticulos) : '—'} sub="artículos únicos" />
        <StatCard icon="ri-map-pin-line" iconColor="text-amber-500" bg="bg-amber-50" label="Ubicaciones" value={resumen ? fmt(resumen.totalUbicaciones) : '—'} sub="posiciones distintas" />
        <StatCard icon="ri-table-line" iconColor="text-emerald-500" bg="bg-emerald-50" label="Columnas" value={String(data.headers.length)} sub="detectadas del archivo" />
      </div>
      <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
        <p className="text-xs font-medium text-slate-600 mb-2">Columnas detectadas ({data.headers.length})</p>
        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
          {data.headers.map(h => <span key={h} className="px-2 py-0.5 bg-white border border-slate-200 text-slate-600 text-xs rounded-full whitespace-nowrap">{h}</span>)}
        </div>
      </div>
    </div>
  );
}

// ── Artículo Resumen Table ─────────────────────────────────────────────────

function ArticuloResumenTable({ data, loading, globalTotals }: { data?: AlmacenResumenCompleto['articulos']; loading: boolean; globalTotals?: { totalUnid: number; totalCount: number } }) {
  const fmt = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);
  const fmtDec = (n: number) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<'cantidad_unidades' | 'registros' | 'zonas_distintas'>('cantidad_unidades');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  if (loading) return <div className="flex items-center justify-center py-16"><div className="flex flex-col items-center gap-3"><div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" /><p className="text-xs text-slate-400">Calculando resumen por artículo...</p></div></div>;
  const rows = data ?? [];
  if (rows.length === 0) return <div className="flex items-center justify-center py-16"><p className="text-sm text-slate-400">No hay datos disponibles.</p></div>;

  const totalUnid = globalTotals?.totalUnid ?? rows.reduce((s, r) => s + r.cantidad_unidades, 0);
  const totalCount = globalTotals?.totalCount ?? rows.length;

  const filtered = rows.filter(row => !search || row.articulo.toLowerCase().includes(search.toLowerCase()) || row.descripcion.toLowerCase().includes(search.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => { const dir = sortDir === 'asc' ? 1 : -1; return (a[sortKey] - b[sortKey]) * dir; });
  const toggleSort = (key: typeof sortKey) => { if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setSortDir('desc'); } };
  const sortIcon = (key: typeof sortKey) => sortKey !== key ? 'ri-expand-up-down-line text-slate-300' : sortDir === 'asc' ? 'ri-sort-asc text-slate-700' : 'ri-sort-desc text-slate-700';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-rose-50 rounded-lg px-4 py-3 border border-rose-100"><p className="text-xs text-rose-600 font-medium">Artículos únicos</p><p className="text-lg font-bold text-rose-700 mt-0.5">{totalCount.toLocaleString('es-CO')}</p></div>
        <div className="bg-teal-50 rounded-lg px-4 py-3 border border-teal-100"><p className="text-xs text-teal-600 font-medium">Total unidades</p><p className="text-lg font-bold text-teal-700 mt-0.5">{fmt(totalUnid)}</p></div>
        <div className="bg-emerald-50 rounded-lg px-4 py-3 border border-emerald-100"><p className="text-xs text-emerald-600 font-medium">Promedio unid/artículo</p><p className="text-lg font-bold text-emerald-700 mt-0.5">{fmtDec(totalCount > 0 ? totalUnid / totalCount : 0)}</p></div>
        <div className="bg-sky-50 rounded-lg px-4 py-3 border border-sky-100"><p className="text-xs text-sky-600 font-medium">Ubicaciones totales</p><p className="text-lg font-bold text-sky-700 mt-0.5">{fmt(rows.reduce((s, r) => s + r.registros, 0))}</p></div>
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><div className="w-3.5 h-3.5 flex items-center justify-center"><i className="ri-search-line text-sm text-slate-400" /></div></div>
          <input type="text" placeholder="Buscar por código o descripción..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-100 focus:border-teal-300 outline-none bg-white text-slate-700 placeholder:text-slate-400" />
        </div>
        <ExportMenu
          filenameBase="almacen-articulos"
          getExportData={() => {
            const headers = ['Código', 'Descripción', 'Cantidad Unidades', '% Cantidad', 'Cant. Ubicaciones', 'Zonas Distintas'];
            const exportRows = sorted.map(row => [
              row.articulo, row.descripcion || '', row.cantidad_unidades,
              totalUnid > 0 ? ((row.cantidad_unidades / totalUnid) * 100).toFixed(2) : '0',
              row.registros, row.zonas_distintas,
            ]);
            return { headers, rows: exportRows };
          }}
        />
      </div>
      <div className="border border-slate-200 rounded-lg overflow-auto max-h-[55vh]">
        <table className="text-xs whitespace-nowrap w-full">
          <thead><tr className="bg-slate-50 sticky top-0 z-10">
            <th className="px-3 py-2.5 text-left text-slate-500 font-semibold border-r border-slate-200">Código</th>
            <th className="px-3 py-2.5 text-left text-slate-500 font-semibold border-r border-slate-200">Descripción</th>
            <th className="px-3 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200 cursor-pointer hover:bg-slate-100" onClick={() => toggleSort('cantidad_unidades')}><span>Unidades</span><div className="w-3 h-3 flex items-center justify-center inline ml-1"><i className={sortIcon('cantidad_unidades')} /></div></th>
            <th className="px-3 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200">% Unid</th>
            <th className="px-3 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200 cursor-pointer hover:bg-slate-100" onClick={() => toggleSort('registros')}><span>Cant. Ubicaciones</span><div className="w-3 h-3 flex items-center justify-center inline ml-1"><i className={sortIcon('registros')} /></div></th>
            <th className="px-3 py-2.5 text-right text-slate-500 font-semibold cursor-pointer hover:bg-slate-100" onClick={() => toggleSort('zonas_distintas')}><span>Zonas</span><div className="w-3 h-3 flex items-center justify-center inline ml-1"><i className={sortIcon('zonas_distintas')} /></div></th>
          </tr></thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={row.articulo} className={`border-t border-slate-100 hover:bg-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                <td className="px-3 py-2 font-medium text-slate-700 border-r border-slate-100">{row.articulo}</td>
                <td className="px-3 py-2 text-slate-600 border-r border-slate-100 max-w-[300px] overflow-hidden text-ellipsis" title={row.descripcion}>{row.descripcion || '—'}</td>
                <td className="px-3 py-2 text-right text-slate-600 border-r border-slate-100 font-medium">{fmt(row.cantidad_unidades)}</td>
                <td className="px-3 py-2 text-right border-r border-slate-100"><span className="text-slate-500">{fmtDec(totalUnid > 0 ? (row.cantidad_unidades / totalUnid) * 100 : 0)}%</span></td>
                <td className="px-3 py-2 text-right text-slate-600 border-r border-slate-100">{fmt(row.registros)}</td>
                <td className="px-3 py-2 text-right text-slate-600">{row.zonas_distintas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-400"><span>{filtered.length} de {rows.length} artículos</span></div>
    </div>
  );
}

// ── Zona Resumen Table (4 categorías: Racks, Racks-Dobles, Pesado, Piso) ───

function ZonaResumenTable({ data, loading, globalTotals, formulaCtx, clusters, onClustersChange }: { data?: AlmacenResumenCompleto['zonas']; loading: boolean; globalTotals?: { totalUnid: number; totalCount: number }; formulaCtx: FormulaContext; clusters: ZonaCluster[]; onClustersChange: () => void }) {
  const fmt = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);
  const fmtDec = (n: number) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const fmtPct = (n: number) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const [search, setSearch] = useState('');
  const [companiaFilter, setCompaniaFilter] = useState<string>('all');

  const rows = data ?? [];
  const totalUnid = globalTotals?.totalUnid ?? rows.reduce((s, r) => s + r.cantidad_unidades, 0);
  const totalCount = globalTotals?.totalCount ?? rows.length;

  const [activeCategoria, setActiveCategoria] = useState<string>(rows[0]?.zona_categoria ?? '');
  const { data: companiaData, loading: companiaLoading } = useAlmacenZonaCompaniaResumen(activeCategoria);
  // Cluster support
  const [activeCluster, setActiveCluster] = useState<ZonaCluster | null>(null);
  const [showClusterMgr, setShowClusterMgr] = useState(false);
  const { data: clusterArts } = useAlmacenClusterCompaniaResumen(activeCluster?.zonas ?? []);
  const activeZoneArtsAll = (activeCluster ? clusterArts : companiaData) ?? [];
  const companiasUnicas = useMemo(() => {
    const set = new Set<string>();
    activeZoneArtsAll.forEach(a => { if (a.idCompania) set.add(a.idCompania); });
    return [...set].sort();
  }, [activeZoneArtsAll]);
  const [artSortKey, setArtSortKey] = useState<string>('cantidad_unidades');
  const [artSortDir, setArtSortDir] = useState<'asc' | 'desc'>('desc');
  const [zoneSwitching, setZoneSwitching] = useState(false);
  const ART_PAGE_SIZE = 100;
  const [artPage, setArtPage] = useState(0);
  const [isPending, startTransition] = useTransition();
  const deferredSearch = useDeferredValue(search);

  // Zone totals
  const zoneTotalUnids = activeZoneArtsAll.reduce((s, a) => s + a.cantidad_unidades, 0);
  const zoneTotalRegs = activeZoneArtsAll.reduce((s, a) => s + a.registros, 0);

  // Dynamic zona columns
  const [zonaColumnas, setZonaColumnas] = useState<ZonaColumnaDinamica[]>([]);
  const [colLoading, setColLoading] = useState(false);
  const [editingColumnFormula, setEditingColumnFormula] = useState<{ columnaId: string; colNombre: string; formula: string; position: { top: number; left: number } } | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColName, setNewColName] = useState('');

  // Column order
  const [colOrder, setColOrder] = useState<string[]>([]);

  const columnOrder = useMemo(() => {
    const derived = [
      'FIXED:idCompania', 'FIXED:codigo', 'FIXED:descripcion',
      'FIXED:cantidad_unidades', 'FIXED:pctCantidad', 'FIXED:registros',
      ...zonaColumnas.map(c => c.id),
    ];
    const derivedSet = new Set(derived);
    if (colOrder.length === derived.length && colOrder.every(k => derivedSet.has(k))) {
      return colOrder;
    }
    return derived;
  }, [colOrder, zonaColumnas]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const switchCategoria = useCallback((categoria: string) => {
    if (categoria === activeCategoria) return;
    setZoneSwitching(true);
    setSearch('');
    setCompaniaFilter('all');
    setArtSortKey('cantidad_unidades');
    setArtSortDir('desc');
    setArtPage(0);
    startTransition(() => {
      setActiveCategoria(categoria);
    });
  }, [activeCategoria]);

  const loadZonaColumnas = useCallback(async (categoria: string) => {
    setColLoading(true);
    setColOrder([]);
    const { data: cols } = await supabase.from('costos_almacen_zona_columnas').select('*').eq('zona', categoria).order('orden');
    const colArray = (cols ?? []) as ZonaColumnaDinamica[];
    setZonaColumnas(colArray);
    const savedKey = `almacen-zone-order-${categoria}`;
    try {
      const saved = localStorage.getItem(savedKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setColOrder(parsed);
        else setColOrder([]);
      }
    } catch {
      setColOrder([]);
    }
    setColLoading(false);
  }, []);

  useEffect(() => {
    if (activeCategoria) {
      loadZonaColumnas(activeCategoria).finally(() => setZoneSwitching(false));
      setEditingColumnFormula(null);
      setAddingColumn(false);
    }
  }, [activeCategoria, loadZonaColumnas]);

  useEffect(() => { setArtPage(0); }, [deferredSearch, companiaFilter]);

  // System variables for formulas (only costos group visible in Almacén editor)
  const systemVarDefs = useMemo<VariableDef[]>(() => {
    try {
      const data = toAllDataSources(formulaCtx);
      const allDefs = buildVariableDefs(data);
      return allDefs.filter(d => d.group === 'costos' && !d.token.startsWith('SUM_COSTOS_'));
    } catch { return []; }
  }, [formulaCtx]);

  const systemVarMap = useMemo<Record<string, number>>(() => {
    try {
      const data = toAllDataSources(formulaCtx);
      const allDefs = buildVariableDefs(data);
      return buildVariableMap(allDefs, data);
    } catch { return {}; }
  }, [formulaCtx]);

  // Almacén-specific row variables for the formula editor (no system cross-module variables)
  const almacenVarDefs = useMemo<VariableDef[]>(() => [
    { token: 'CANTIDAD', label: 'Cantidad Unidades', description: 'Unidades del artículo en esta categoría', group: 'masivo' as any },
    { token: 'ZONA_CANTIDAD', label: 'Total Unid. Categoría', description: 'Total de unidades de la categoría', group: 'masivo' as any },
    { token: 'PCT_CANTIDAD', label: '% Unid. del artículo', description: 'Porcentaje de unidades sobre total de categoría', group: 'masivo' as any },
    { token: 'CANT_UBICACIONES', label: 'Cant. Ubicaciones', description: 'Ubicaciones distintas donde aparece este artículo', group: 'masivo' as any },
    { token: 'ZONA_UBICACIONES', label: 'Total Ubic. Categoría', description: 'Total de ubicaciones de toda la categoría', group: 'masivo' as any },
  ], []);

  const sumAllCantidadArts = useMemo(() => {
    return activeZoneArtsAll.reduce((s, a) => s + a.cantidad_unidades, 0);
  }, [activeZoneArtsAll]);

  const buildRowVarMap = useCallback((art: AlmacenZonaArticuloCompaniaRow): Record<string, number> => {
    const artVars: Record<string, number> = {
      'CANTIDAD': art.cantidad_unidades,
      'ZONA_CANTIDAD': zoneTotalUnids,
      'PCT_CANTIDAD': zoneTotalUnids > 0 ? (art.cantidad_unidades / zoneTotalUnids) * 100 : 0,
      'CANT_UBICACIONES': art.registros,
      'ZONA_UBICACIONES': zoneTotalRegs,
    };
    return { ...systemVarMap, ...artVars };
  }, [zoneTotalUnids, zoneTotalRegs, systemVarMap]);

  // Precompute all dynamic cell values
  const computedCells = useMemo(() => {
    const result: Record<string, Record<string, { value: number | null; formula: string; error: boolean; isGlobal: boolean }>> = {};
    if (!zonaColumnas.length || !activeZoneArtsAll.length) return result;

    for (const col of zonaColumnas) {
      result[col.id] = {};
      const colFormula = col.formula?.trim();
      if (!colFormula) {
        for (const art of activeZoneArtsAll) {
          result[col.id][art.articulo] = { value: null, formula: '', error: false, isGlobal: false };
        }
        continue;
      }
      const hasRowVars = /\{(CANTIDAD|CANT_UBICACIONES|PCT_CANTIDAD)\}/i.test(colFormula);
      for (const art of activeZoneArtsAll) {
        const varMap = buildRowVarMap(art);
        const r = evalFormula(colFormula, varMap);
        result[col.id][art.articulo] = { value: r.ok ? r.value : null, formula: colFormula, error: !r.ok, isGlobal: !hasRowVars };
      }
    }
    return result;
  }, [zonaColumnas, activeZoneArtsAll, buildRowVarMap]);

  // Filtered & sorted articles
  const filteredArts = useMemo(() => {
    let arts = activeZoneArtsAll.filter(a =>
      !deferredSearch || a.articulo.toLowerCase().includes(deferredSearch.toLowerCase()) || a.descripcion.toLowerCase().includes(deferredSearch.toLowerCase())
    );
    if (companiaFilter !== 'all') {
      arts = arts.filter(a => a.idCompania === companiaFilter);
    }
    return arts;
  }, [activeZoneArtsAll, deferredSearch, companiaFilter]);

  const getSortValue = useCallback((art: AlmacenZonaArticuloCompaniaRow, colKey: string): number | string => {
    if (colKey.startsWith('FIXED:')) {
      const key = colKey.slice(6);
      switch (key) {
        case 'idCompania': return (art.idCompania || '').toLowerCase();
        case 'codigo': return art.articulo.toLowerCase();
        case 'descripcion': return (art.descripcion || '').toLowerCase();
        case 'cantidad_unidades': return art.cantidad_unidades;
        case 'pctCantidad': return zoneTotalUnids > 0 ? (art.cantidad_unidades / zoneTotalUnids) * 100 : 0;
        case 'registros': return art.registros;
        default: return 0;
      }
    } else {
      const cell = computedCells[colKey]?.[art.articulo];
      return cell?.value ?? 0;
    }
  }, [zoneTotalUnids, computedCells]);

  const sortedArtsAll = useMemo(() =>
    [...filteredArts].sort((a, b) => {
      const dir = artSortDir === 'asc' ? 1 : -1;
      const va = getSortValue(a, artSortKey);
      const vb = getSortValue(b, artSortKey);
      if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * dir;
      return ((va as number) - (vb as number)) * dir;
    }), [filteredArts, artSortKey, artSortDir, getSortValue]);

  const totalArtPages = Math.ceil(sortedArtsAll.length / ART_PAGE_SIZE);

  const paginatedArts = useMemo(() => {
    const start = artPage * ART_PAGE_SIZE;
    return sortedArtsAll.slice(start, start + ART_PAGE_SIZE);
  }, [sortedArtsAll, artPage]);

  // Footer totals
  const footerTotals = useMemo(() => {
    const result: Record<string, number> = {};
    for (const col of zonaColumnas) {
      const colFormula = col.formula?.trim();
      const hasRowVars = /\{(CANTIDAD|CANT_UBICACIONES|PCT_CANTIDAD)\}/i.test(colFormula || '');
      const isGlobal = !hasRowVars && !!colFormula;

      if (isGlobal && sortedArtsAll.length > 0) {
        const cell = computedCells[col.id]?.[sortedArtsAll[0].articulo];
        result[col.id] = cell?.value ?? 0;
      } else {
        result[col.id] = sortedArtsAll.reduce((s, art) => {
          const cell = computedCells[col.id]?.[art.articulo];
          return s + (cell?.value ?? 0);
        }, 0);
      }
    }
    return result;
  }, [zonaColumnas, sortedArtsAll, computedCells]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = columnOrder.findIndex(id => id === active.id);
    const newIdx = columnOrder.findIndex(id => id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = [...columnOrder];
    const [moved] = reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, moved);
    setColOrder(reordered);
    localStorage.setItem(`almacen-zone-order-${activeCategoria}`, JSON.stringify(reordered));
    const dynCols = reordered.filter(k => !k.startsWith('FIXED:'));
    for (let i = 0; i < dynCols.length; i++) {
      const col = zonaColumnas.find(c => c.id === dynCols[i]);
      if (col && col.orden !== i) {
        await supabase.from('costos_almacen_zona_columnas').update({ orden: i }).eq('id', dynCols[i]);
      }
    }
  }, [columnOrder, zonaColumnas, activeCategoria]);

  const handleAddColumn = useCallback(async () => {
    const name = newColName.trim();
    if (!name) return;
    const orden = zonaColumnas.length;
    const { data: newCol } = await supabase.from('costos_almacen_zona_columnas').insert({ zona: activeCategoria, nombre: name, tipo: 'formula', orden }).select().maybeSingle();
    if (newCol) {
      setZonaColumnas(prev => [...prev, newCol as ZonaColumnaDinamica]);
    }
    setNewColName('');
    setAddingColumn(false);
  }, [newColName, activeCategoria, zonaColumnas]);

  const handleDeleteColumn = useCallback(async (colId: string) => {
    if (!confirm('¿Eliminar esta columna y todas sus celdas?')) return;
    await supabase.from('costos_almacen_zona_celdas').delete().eq('columna_id', colId);
    await supabase.from('costos_almacen_zona_columnas').delete().eq('id', colId);
    setZonaColumnas(prev => prev.filter(c => c.id !== colId));
    setEditingColumnFormula(null);
  }, []);

  const handleRenameColumn = useCallback(async (colId: string, nombre: string) => {
    setZonaColumnas(prev => prev.map(c => c.id === colId ? { ...c, nombre } : c));
    await supabase.from('costos_almacen_zona_columnas').update({ nombre }).eq('id', colId);
  }, []);

  const handleOpenColumnFormulaEditor = useCallback((col: ZonaColumnaDinamica, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setEditingColumnFormula({
      columnaId: col.id,
      colNombre: col.nombre,
      formula: col.formula ?? '',
      position: { top: rect.bottom + 4, left: rect.left },
    });
  }, []);

  const handleSaveColumnFormula = useCallback(async (formula: string) => {
    if (!editingColumnFormula) return;
    const { columnaId } = editingColumnFormula;
    setZonaColumnas(prev => prev.map(c => c.id === columnaId ? { ...c, formula: formula || undefined } : c));
    await supabase.from('costos_almacen_zona_columnas').update({ formula: formula || null }).eq('id', columnaId);
    setEditingColumnFormula(null);
  }, [editingColumnFormula]);

  const toggleArtSort = (key: string) => {
    if (artSortKey === key) setArtSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setArtSortKey(key); setArtSortDir('desc'); }
  };
  const sortIcon = (key: string) =>
    artSortKey !== key ? 'ri-expand-up-down-line text-slate-300' : artSortDir === 'asc' ? 'ri-sort-asc text-slate-700' : 'ri-sort-desc text-slate-700';

  const activeCategoriaData = rows.find(r => r.zona_categoria === activeCategoria);
  const pctGlobalUnid = totalUnid > 0 && activeCategoriaData ? (activeCategoriaData.cantidad_unidades / totalUnid) * 100 : 0;

  if (loading) return <div className="flex items-center justify-center py-16"><div className="flex flex-col items-center gap-3"><div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" /><p className="text-xs text-slate-400">Calculando resumen por zona...</p></div></div>;
  if (rows.length === 0) return <div className="flex items-center justify-center py-16"><p className="text-sm text-slate-400">No hay datos disponibles.</p></div>;

  const zonaTabColors = [
    { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', activeBg: 'bg-teal-500', activeText: 'text-white', dot: 'bg-teal-400' },
    { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', activeBg: 'bg-emerald-500', activeText: 'text-white', dot: 'bg-emerald-400' },
    { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700', activeBg: 'bg-sky-500', activeText: 'text-white', dot: 'bg-sky-400' },
    { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', activeBg: 'bg-rose-500', activeText: 'text-white', dot: 'bg-rose-400' },
    { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', activeBg: 'bg-amber-500', activeText: 'text-white', dot: 'bg-amber-400' },
    { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', activeBg: 'bg-violet-500', activeText: 'text-white', dot: 'bg-violet-400' },
    { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', activeBg: 'bg-orange-500', activeText: 'text-white', dot: 'bg-orange-400' },
  ];

  const filteredUnidTotal = filteredArts.reduce((s, a) => s + a.cantidad_unidades, 0);

  return (
    <div className="space-y-5">
      {/* Global summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white rounded-lg px-4 py-3 border border-slate-200"><p className="text-xs text-slate-500 font-medium">Zonas activas</p><p className="text-lg font-bold text-slate-800 mt-0.5">{totalCount.toLocaleString('es-CO')}</p></div>
        <div className="bg-white rounded-lg px-4 py-3 border border-slate-200"><p className="text-xs text-slate-500 font-medium">Total unidades</p><p className="text-lg font-bold text-slate-800 mt-0.5">{fmt(totalUnid)}</p></div>
        <div className="bg-white rounded-lg px-4 py-3 border border-slate-200"><p className="text-xs text-slate-500 font-medium">SKU distintos</p><p className="text-lg font-bold text-slate-800 mt-0.5">{rows.reduce((s, r) => s + r.articulos_distintos, 0).toLocaleString('es-CO')}</p></div>
        <div className="bg-white rounded-lg px-4 py-3 border border-slate-200"><p className="text-xs text-slate-500 font-medium">Ubicaciones totales</p><p className="text-lg font-bold text-slate-800 mt-0.5">{rows.reduce((s, r) => s + r.ubicaciones_distintas, 0).toLocaleString('es-CO')}</p></div>
        <div className="bg-white rounded-lg px-4 py-3 border border-slate-200"><p className="text-xs text-slate-500 font-medium">Promedio unid/zona</p><p className="text-lg font-bold text-slate-800 mt-0.5">{fmtDec(totalCount > 0 ? totalUnid / totalCount : 0)}</p></div>
      </div>

      {/* Cluster manager */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">Selecciona categoría o cluster de zonas</p>
        <button onClick={() => setShowClusterMgr(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap">
          <i className={`ri-stack-${showClusterMgr ? 'fill' : 'line'} text-sm`} />
          Clusters {clusters.length > 0 && <span className="ml-1 px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded-full text-[10px] font-semibold">{clusters.length}</span>}
        </button>
      </div>
      {showClusterMgr && <ZonaClusterManager tableName="costos_almacen_clusters" clusters={clusters} zonas={rows.map(r => r.zona_categoria)} onChanged={onClustersChange} />}

      {/* Category pills */}
      <div className="flex gap-2 flex-wrap">
        {clusters.map(cluster => {
          const isActive = activeCluster?.id === cluster.id;
          const cUd = rows.filter(r => cluster.zonas.includes(r.zona_categoria)).reduce((s, r) => s + r.cantidad_unidades, 0);
          const pct = totalUnid > 0 ? (cUd / totalUnid) * 100 : 0;
          return (
            <button key={cluster.id} onClick={() => { setActiveCluster(cluster); setActiveCategoria(''); }}
              className={`px-4 py-2.5 rounded-xl border text-sm font-medium transition-all cursor-pointer whitespace-nowrap flex items-center gap-2 ${isActive ? `${clusterActiveBg(cluster.color)} border-transparent` : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
              <i className={`ri-stack-line text-xs ${isActive ? 'text-white/80' : 'text-slate-400'}`} />{cluster.nombre}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{pct.toFixed(1)}%</span>
            </button>
          );
        })}
        {clusters.length > 0 && rows.some(r => !clusters.flatMap(c => c.zonas).includes(r.zona_categoria)) && <div className="flex items-center px-1"><div className="h-5 w-px bg-slate-200" /></div>}
        {rows.map((row, i) => {
          if (clusters.some(c => c.zonas.includes(row.zona_categoria))) return null;
          const isActive = !activeCluster && activeCategoria === row.zona_categoria;
          const c = zonaTabColors[i % zonaTabColors.length];
          return (
            <button
              key={row.zona_categoria}
              onClick={() => { setActiveCluster(null); switchCategoria(row.zona_categoria); }}
              className={`px-4 py-2.5 rounded-xl border text-sm font-medium transition-all cursor-pointer whitespace-nowrap flex items-center gap-2.5 ${
                isActive
                  ? `${c.activeBg} ${c.activeText} border-transparent`
                  : `bg-white ${c.border} ${c.text} hover:bg-slate-50`
              }`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-white/60' : c.dot}`} />
              <span className="font-semibold max-w-[280px] truncate">{row.zona_categoria}</span>
              <span className={`text-xs ${isActive ? 'text-white/70' : 'text-slate-400'}`}>
                {fmt(row.cantidad_unidades)} uds
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
              }`}>
                {row.articulos_distintos} art.
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
              }`}>
                {row.ubicaciones_distintas} ubic.
              </span>
              {row.zonas_raw > 1 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                  {row.zonas_raw} zonas crudas
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active category detail */}
      {activeCategoriaData && (
        <div className="space-y-4">
          {/* Category header + stats */}
          <div className="flex flex-col lg:flex-row lg:items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-800">
                  <i className="ri-store-2-line text-lg text-white" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-800 max-w-[600px] truncate">{activeCategoria}</h4>
                  <p className="text-xs text-slate-400">
                    {fmtPct(pctGlobalUnid)}% del total global de unidades · {activeCategoriaData.articulos_distintos} artículos · {activeCategoriaData.ubicaciones_distintas} ubicaciones{activeCategoriaData.zonas_raw > 1 ? ` · ${activeCategoriaData.zonas_raw} zonas agrupadas` : ''}
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 flex-shrink-0">
              <div className="bg-teal-50 rounded-lg px-4 py-2.5 border border-teal-100 text-center min-w-[90px]">
                <p className="text-[10px] text-teal-600 font-medium uppercase tracking-wider">Unidades</p>
                <p className="text-base font-bold text-teal-700 mt-0.5">{fmt(zoneTotalUnids)}</p>
              </div>
              <div className="bg-emerald-50 rounded-lg px-4 py-2.5 border border-emerald-100 text-center min-w-[90px]">
                <p className="text-[10px] text-emerald-600 font-medium uppercase tracking-wider">Cant. Ubicaciones</p>
                <p className="text-base font-bold text-emerald-700 mt-0.5">{fmt(zoneTotalRegs)}</p>
              </div>
              <div className="bg-sky-50 rounded-lg px-4 py-2.5 border border-sky-100 text-center min-w-[90px]">
                <p className="text-[10px] text-sky-600 font-medium uppercase tracking-wider">Artículos</p>
                <p className="text-base font-bold text-sky-700 mt-0.5">{activeZoneArtsAll.length}</p>
              </div>
              <div className="bg-amber-50 rounded-lg px-4 py-2.5 border border-amber-100 text-center min-w-[90px]">
                <p className="text-[10px] text-amber-600 font-medium uppercase tracking-wider">Ubicaciones</p>
                <p className="text-base font-bold text-amber-700 mt-0.5">{activeCategoriaData.ubicaciones_distintas}</p>
              </div>
              <div className="bg-rose-50 rounded-lg px-4 py-2.5 border border-rose-100 text-center min-w-[90px]">
                <p className="text-[10px] text-rose-600 font-medium uppercase tracking-wider">% Global</p>
                <p className="text-base font-bold text-rose-700 mt-0.5">{fmtPct(pctGlobalUnid)}%</p>
              </div>
              <div className="bg-violet-50 rounded-lg px-4 py-2.5 border border-violet-100 text-center min-w-[90px]">
                <p className="text-[10px] text-violet-600 font-medium uppercase tracking-wider">Compañías</p>
                <p className="text-base font-bold text-violet-700 mt-0.5">{companiasUnicas.length}</p>
              </div>
            </div>
          </div>

          {/* Search + filter + export */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <div className="w-3.5 h-3.5 flex items-center justify-center"><i className="ri-search-line text-sm text-slate-400" /></div>
              </div>
              <input
                type="text"
                placeholder={`Buscar artículo en ${activeCategoria}...`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-100 focus:border-teal-300 outline-none bg-white text-slate-700 placeholder:text-slate-400"
              />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <select
                value={companiaFilter}
                onChange={e => setCompaniaFilter(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-100 focus:border-teal-300 outline-none bg-white text-slate-700 min-w-[160px]"
              >
                <option value="all">Todas las compañías</option>
                {companiasUnicas.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ExportMenu
                filenameBase={`almacen-zona-${activeCategoria.slice(0, 30)}`}
                getExportData={() => {
                  const headers = ['Id Compañía', 'Código', 'Descripción', 'Cantidad Unidades', '% Cantidad', 'Cant. Ubicaciones', ...zonaColumnas.map(c => c.nombre)];
                  const exportRows = sortedArtsAll.map(art => {
                    const artPct = filteredUnidTotal > 0 ? (art.cantidad_unidades / filteredUnidTotal) * 100 : 0;
                    return [
                      art.idCompania || '', art.articulo, art.descripcion || '',
                      art.cantidad_unidades, artPct.toFixed(2), art.registros,
                      ...zonaColumnas.map(col => {
                        const cell = computedCells[col.id]?.[art.articulo];
                        return cell?.value !== null && cell?.value !== undefined ? String(cell.value) : '';
                      }),
                    ];
                  });
                  return { headers, rows: exportRows };
                }}
              />
            </div>
          </div>

          {/* Loading overlay */}
          {(zoneSwitching || isPending) && (
            <div className="relative">
              <div className="absolute inset-0 z-20 bg-white/80 backdrop-blur-sm rounded-lg flex items-center justify-center" style={{ minHeight: 200 }}>
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm font-semibold text-slate-700">Cargando <strong className="text-teal-600">{activeCategoria.slice(0, 40)}</strong>...</p>
                </div>
              </div>
            </div>
          )}
          {colLoading && !zoneSwitching && !isPending && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-teal-50 border border-teal-200 rounded-lg mb-2">
              <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <span className="text-sm font-medium text-teal-700">Cargando columnas de <strong>{activeCategoria.slice(0, 50)}</strong>...</span>
            </div>
          )}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="border border-slate-200 rounded-lg overflow-auto max-h-[55vh]">
            <table className="text-xs whitespace-nowrap w-full">
              <thead>
                <tr className="bg-slate-50 sticky top-0 z-10">
                  <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
                    {columnOrder.map(colKey => {
                      if (colKey.startsWith('FIXED:')) {
                        const key = colKey.slice(6);
                        switch (key) {
                          case 'idCompania': return <SortableFixedHeader key={colKey} id={colKey} className="px-3 py-2.5 text-left text-slate-500 font-semibold border-r border-slate-200 cursor-pointer hover:bg-slate-100"><span onClick={() => toggleArtSort(colKey)}>Id Compañía<div className="w-3 h-3 flex items-center justify-center inline ml-1"><i className={sortIcon(colKey)} /></div></span></SortableFixedHeader>;
                          case 'codigo': return <SortableFixedHeader key={colKey} id={colKey} className="px-3 py-2.5 text-left text-slate-500 font-semibold border-r border-slate-200 cursor-pointer hover:bg-slate-100"><span onClick={() => toggleArtSort(colKey)}>Código<div className="w-3 h-3 flex items-center justify-center inline ml-1"><i className={sortIcon(colKey)} /></div></span></SortableFixedHeader>;
                          case 'descripcion': return <SortableFixedHeader key={colKey} id={colKey} className="px-3 py-2.5 text-left text-slate-500 font-semibold border-r border-slate-200 cursor-pointer hover:bg-slate-100"><span onClick={() => toggleArtSort(colKey)}>Descripción<div className="w-3 h-3 flex items-center justify-center inline ml-1"><i className={sortIcon(colKey)} /></div></span></SortableFixedHeader>;
                          case 'cantidad_unidades': return <SortableFixedHeader key={colKey} id={colKey} className="px-3 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200 cursor-pointer hover:bg-slate-100"><span onClick={() => toggleArtSort(colKey)}>Cantidad<div className="w-3 h-3 flex items-center justify-center inline ml-1"><i className={sortIcon(colKey)} /></div></span></SortableFixedHeader>;
                          case 'pctCantidad': return <SortableFixedHeader key={colKey} id={colKey} className="px-3 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200 cursor-pointer hover:bg-slate-100"><span onClick={() => toggleArtSort(colKey)}>% Cantidad<div className="w-3 h-3 flex items-center justify-center inline ml-1"><i className={sortIcon(colKey)} /></div></span></SortableFixedHeader>;
                          case 'registros': return <SortableFixedHeader key={colKey} id={colKey} className="px-3 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200 cursor-pointer hover:bg-slate-100"><span onClick={() => toggleArtSort(colKey)}>Cant. Ubicaciones<div className="w-3 h-3 flex items-center justify-center inline ml-1"><i className={sortIcon(colKey)} /></div></span></SortableFixedHeader>;
                          default: return null;
                        }
                      } else {
                        const col = zonaColumnas.find(c => c.id === colKey);
                        if (!col) return null;
                        return <SortableColHeader key={col.id} col={col} onDelete={handleDeleteColumn} onEditFormula={handleOpenColumnFormulaEditor} onRename={handleRenameColumn} onSort={() => toggleArtSort(colKey)} sortIconClass={sortIcon(colKey)} />;
                      }
                    })}
                    {colLoading && zonaColumnas.length === 0 && (
                      <th className="px-3 py-2.5 bg-slate-50 border-r border-slate-100">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-4 bg-slate-200 rounded animate-pulse" />
                          <div className="w-4 h-4 border-2 border-teal-400 border-t-transparent rounded-full animate-spin ml-1" />
                        </div>
                      </th>
                    )}
                  </SortableContext>
                  <th className="px-1 py-2.5 bg-slate-50">
                    {colLoading ? (
                      <div className="flex items-center justify-center px-2">
                        <div className="w-5 h-5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : addingColumn ? (
                      <div className="flex items-center gap-1 px-1">
                        <input
                          type="text"
                          value={newColName}
                          onChange={e => setNewColName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleAddColumn(); if (e.key === 'Escape') { setAddingColumn(false); setNewColName(''); } }}
                          placeholder="Nombre..."
                          className="w-[120px] px-2 py-1 text-xs border border-teal-300 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-400 bg-white"
                          autoFocus
                        />
                        <button onClick={handleAddColumn} disabled={!newColName.trim()} className="w-6 h-6 flex items-center justify-center rounded-md bg-teal-500 hover:bg-teal-600 text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                          <i className="ri-check-line text-xs" />
                        </button>
                        <button onClick={() => { setAddingColumn(false); setNewColName(''); }} className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 cursor-pointer">
                          <i className="ri-close-line text-xs" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingColumn(true)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-teal-400 hover:text-teal-500 hover:bg-teal-50 cursor-pointer transition-all"
                        title="Agregar columna de fórmula"
                      >
                        <i className="ri-add-line text-sm" />
                      </button>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedArts.length === 0 ? (
                  <tr>
                    <td colSpan={columnOrder.length + 1} className="px-3 py-10 text-center text-slate-400">
                      {search ? 'Sin resultados para esta búsqueda' : `Sin artículos en ${activeCategoria}`}
                    </td>
                  </tr>
                ) : (
                  paginatedArts.map((art, ai) => {
                    const artPct = filteredUnidTotal > 0 ? (art.cantidad_unidades / filteredUnidTotal) * 100 : 0;
                    return (
                      <tr key={`${activeCategoria}-${art.idCompania}-${art.articulo}`} className={`border-t border-slate-100 hover:bg-teal-50/50 ${ai % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                        {columnOrder.map(colKey => {
                          if (colKey.startsWith('FIXED:')) {
                            const key = colKey.slice(6);
                            switch (key) {
                              case 'idCompania': return <td key={colKey} className="px-3 py-2 font-medium text-slate-700 border-r border-slate-100">{art.idCompania || '—'}</td>;
                              case 'codigo': return <td key={colKey} className="px-3 py-2 font-medium text-slate-700 border-r border-slate-100">{art.articulo}</td>;
                              case 'descripcion': return <td key={colKey} className="px-3 py-2 text-slate-600 border-r border-slate-100 max-w-[320px] overflow-hidden text-ellipsis" title={art.descripcion}>{art.descripcion || '—'}</td>;
                              case 'cantidad_unidades': return <td key={colKey} className="px-3 py-2 text-right text-slate-600 border-r border-slate-100 font-medium">{fmt(art.cantidad_unidades)}</td>;
                              case 'pctCantidad': return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><div className="flex items-center justify-end gap-2"><div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0"><div className="h-full bg-teal-400 rounded-full transition-all" style={{ width: `${Math.min(artPct, 100)}%` }} /></div><span className="text-slate-500 w-10 text-right">{fmtPct(artPct)}%</span></div></td>;
                              case 'registros': return <td key={colKey} className="px-3 py-2 text-right text-slate-500 border-r border-slate-100">{fmt(art.registros)}</td>;
                              default: return null;
                            }
                          } else {
                            if (colLoading) {
                              return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><div className="flex justify-end"><div className="w-16 h-4 bg-slate-200 rounded animate-pulse" /></div></td>;
                            }
                            const col = zonaColumnas.find(c => c.id === colKey);
                            if (!col) return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-slate-300">—</span></td>;
                            const cell = computedCells[col.id]?.[art.articulo];
                            const hasFormula = !!cell?.formula;
                            const isGlobalFormula = cell?.isGlobal ?? false;
                            return (
                              <td key={col.id} onClick={(e) => handleOpenColumnFormulaEditor(col, e)} className={`px-3 py-2 text-right border-r border-slate-100 cursor-pointer transition-colors ${hasFormula ? 'hover:bg-teal-100/60' : 'hover:bg-slate-100'}`} title={hasFormula ? cell?.formula : 'Clic para agregar fórmula'}>
                                {hasFormula ? (
                                  cell?.error ? (
                                    <span className="text-rose-500"><i className="ri-error-warning-line mr-1" />Error</span>
                                  ) : cell?.value !== null && cell?.value !== undefined ? (
                                    <span className="text-teal-700 font-medium tabular-nums">{new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cell.value)}</span>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )
                                ) : (
                                  <span className="text-slate-300 text-[10px]">—</span>
                                )}
                              </td>
                            );
                          }
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
              {paginatedArts.length > 0 && (() => {
                const isFiltered = !!search || companiaFilter !== 'all';
                const artsForFooter = isFiltered ? filteredArts : activeZoneArtsAll;
                const count = artsForFooter.length;
                const displayUnid = isFiltered ? filteredUnidTotal : zoneTotalUnids;
                return (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-100/80">
                    {columnOrder.map((colKey) => {
                      if (colKey.startsWith('FIXED:')) {
                        const key = colKey.slice(6);
                        switch (key) {
                          case 'idCompania': return <td key={colKey} className="px-3 py-2 font-semibold text-slate-600 border-r border-slate-100">{isFiltered ? `${filteredArts.length} de ${activeZoneArtsAll.length} artículos` : `Total: ${activeZoneArtsAll.length} artículos`}</td>;
                          case 'codigo': return <td key={colKey} className="px-3 py-2 border-r border-slate-100" />;
                          case 'descripcion': return <td key={colKey} className="px-3 py-2 border-r border-slate-100" />;
                          case 'cantidad_unidades': return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-slate-700">{fmt(displayUnid)}</span></td>;
                          case 'pctCantidad': return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-teal-600">100%</span></td>;
                          case 'registros': return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-slate-600">{fmt(artsForFooter.reduce((s, a) => s + a.registros, 0))}</span></td>;
                          default: return <td key={colKey} className="px-2 py-2 border-r border-slate-100" />;
                        }
                      } else {
                        if (colLoading) {
                          return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><div className="flex justify-end"><div className="w-14 h-4 bg-slate-200 rounded animate-pulse" /></div></td>;
                        }
                        return (
                          <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100">
                            <span className="text-xs font-bold text-teal-700 tabular-nums">
                              {new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(footerTotals[colKey] ?? 0)}
                            </span>
                          </td>
                        );
                      }
                    })}
                    <td className="px-1 py-2 bg-slate-100/80" />
                  </tr>
                </tfoot>
                );
              })()}
            </table>
          </div>
          </DndContext>

          {/* Pagination */}
          {totalArtPages > 1 && (
            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-xs text-slate-400">
                Mostrando {artPage * ART_PAGE_SIZE + 1}–{Math.min((artPage + 1) * ART_PAGE_SIZE, sortedArtsAll.length)} de {sortedArtsAll.length} artículos
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setArtPage(p => Math.max(0, p - 1))}
                  disabled={artPage === 0}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap flex items-center gap-1"
                >
                  <i className="ri-arrow-left-s-line" /> Anterior
                </button>
                {Array.from({ length: Math.min(totalArtPages, 7) }, (_, i) => {
                  let pageNum: number;
                  if (totalArtPages <= 7) {
                    pageNum = i;
                  } else if (artPage <= 2) {
                    pageNum = i;
                  } else if (artPage >= totalArtPages - 3) {
                    pageNum = totalArtPages - 7 + i;
                  } else {
                    pageNum = artPage - 3 + i;
                  }
                  if (pageNum < 0 || pageNum >= totalArtPages) return null;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setArtPage(pageNum)}
                      className={`w-8 h-8 text-xs rounded-lg transition-colors cursor-pointer font-medium whitespace-nowrap ${
                        pageNum === artPage
                          ? 'bg-slate-800 text-white'
                          : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {pageNum + 1}
                    </button>
                  );
                })}
                <button
                  onClick={() => setArtPage(p => Math.min(totalArtPages - 1, p + 1))}
                  disabled={artPage >= totalArtPages - 1}
                  className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap flex items-center gap-1"
                >
                  Siguiente <i className="ri-arrow-right-s-line" />
                </button>
              </div>
            </div>
          )}

          {/* Formula editor popover */}
          {editingColumnFormula && (() => {
            const sampleArt = activeZoneArtsAll[0];
            const varMap = sampleArt ? buildRowVarMap(sampleArt) : {};
            return (
              <ZonaCeldaFormulaEditor
                formula={editingColumnFormula.formula}
                varMap={varMap}
                onSave={handleSaveColumnFormula}
                onCancel={() => setEditingColumnFormula(null)}
                position={editingColumnFormula.position}
                systemVarDefs={systemVarDefs}
                systemVarMap={systemVarMap}
              />
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ── Sortable Fixed Column Header ──────────────────────────────────────────

function SortableFixedHeader({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 20 : undefined,
    position: 'relative' as const,
  };
  return (
    <th ref={setNodeRef} style={style} className={className}>
      <div className="flex items-center gap-1.5">
        <button
          {...attributes}
          {...listeners}
          className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 cursor-grab active:cursor-grabbing flex-shrink-0"
          title="Arrastrar para reordenar"
        >
          <i className="ri-draggable text-xs" />
        </button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </th>
  );
}

// ── Sortable Dynamic Column Header ────────────────────────────────────────

function SortableColHeader({ col, onDelete, onEditFormula, onRename, onSort, sortIconClass }: { col: ZonaColumnaDinamica; onDelete: (id: string) => void; onEditFormula: (col: ZonaColumnaDinamica, e: React.MouseEvent) => void; onRename: (id: string, nombre: string) => void; onSort: () => void; sortIconClass: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.id });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(col.nombre);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 20 : undefined,
    position: 'relative' as const,
  };

  const hasFormula = !!col.formula?.trim();

  const handleSave = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== col.nombre) {
      onRename(col.id, trimmed);
    } else {
      setName(col.nombre);
    }
    setEditing(false);
  };

  return (
    <th ref={setNodeRef} style={style} className={`px-2 py-2.5 border-r font-semibold ${hasFormula ? 'bg-teal-100/60 border-teal-200' : 'bg-teal-50/50 border-teal-100'}`}>
      <div className="flex items-center gap-1.5">
        <button
          {...attributes}
          {...listeners}
          className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 cursor-grab active:cursor-grabbing flex-shrink-0"
          title="Arrastrar para reordenar"
        >
          <i className="ri-draggable text-xs" />
        </button>
        <div className="flex items-center gap-1 min-w-0 flex-1">
          {editing ? (
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onBlur={handleSave}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setName(col.nombre); setEditing(false); } }}
              className="text-xs text-teal-700 bg-white border border-teal-300 rounded px-1.5 py-0.5 w-full min-w-[80px] focus:outline-none focus:ring-1 focus:ring-teal-400"
              autoFocus
            />
          ) : (
            <div className="flex items-center gap-0.5 min-w-0 group/name">
              <span onClick={onSort} className="text-xs text-teal-700 whitespace-nowrap max-w-[120px] overflow-hidden text-ellipsis cursor-pointer hover:underline">{col.nombre}</span>
              <div className="w-3 h-3 flex items-center justify-center flex-shrink-0 cursor-pointer" onClick={onSort}><i className={sortIconClass} /></div>
              <button
                onClick={() => { setName(col.nombre); setEditing(true); }}
                className="w-4 h-4 flex items-center justify-center rounded text-slate-300 hover:text-teal-500 hover:bg-teal-100 cursor-pointer flex-shrink-0 opacity-0 group-hover/name:opacity-100 transition-opacity"
                title="Renombrar columna"
              >
                <i className="ri-pencil-line text-[10px]" />
              </button>
            </div>
          )}
          {hasFormula && (
            <span className="text-[10px] px-1 py-0.5 rounded bg-teal-200 text-teal-700 font-mono font-bold flex-shrink-0">fx</span>
          )}
        </div>
        <button
          onClick={(e) => onEditFormula(col, e)}
          className={`w-5 h-5 flex items-center justify-center rounded cursor-pointer flex-shrink-0 transition-colors ${hasFormula ? 'text-teal-600 hover:text-teal-800 hover:bg-teal-200' : 'text-slate-400 hover:text-teal-500 hover:bg-teal-100'}`}
          title={hasFormula ? 'Editar fórmula de columna' : 'Agregar fórmula a columna'}
        >
          <i className={`${hasFormula ? 'ri-pencil-line' : 'ri-functions'} text-xs`} />
        </button>
        <button
          onClick={() => onDelete(col.id)}
          className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 cursor-pointer flex-shrink-0"
          title="Eliminar columna"
        >
          <i className="ri-close-line text-xs" />
        </button>
      </div>
    </th>
  );
}