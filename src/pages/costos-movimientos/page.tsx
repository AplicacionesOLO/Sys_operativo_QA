import React, { useState, useEffect, useCallback, useMemo, useTransition, useDeferredValue } from 'react';
import { supabase } from '@/lib/supabase';
import AppLayout from '@/components/feature/AppLayout';
import { downloadExcelMultiSheet } from '@/lib/csvExport';
import { fetchBaseQueryData } from '@/lib/formulaBaseCache';
import type { FormulaContext } from '@/lib/formulaEngine';
import { EMPTY_FORMULA_CTX } from '@/lib/formulaEngine';
import type { InversionRecord } from '@/types/inversion';
import { evalFormula } from '@/lib/mathEvaluator';
import { buildVariableDefs, buildVariableMap, type VariableDef } from '@/lib/formulaVariables';
import { toAllDataSources } from '@/lib/formulaEngine';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  useMovimientosMasivoResumen, useMovimientosArticuloResumen,
  useMovimientosZonaCompaniaResumen, useMovimientosZonaArticuloMensual,
  useMovimientosClusterCompaniaResumen, useMovimientosClusterMensual,
  MovimientosRawTable, StatCard,
  type ArticuloResumenRow, type ZonaResumenRow, type ZonaArticuloCompaniaRow,
  type MovimientosCluster,
} from './components/MasivoHooks';
import ExportMenu from '@/components/base/ExportMenu';
import type { MovimientosZonaColumnaDinamica } from '@/types/costos_movimientos';
import ZonaCeldaFormulaEditor from './components/ZonaCeldaFormulaEditor';

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CostosMovimientosPage() {
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [formulaCtx, setFormulaCtx] = useState<FormulaContext>(EMPTY_FORMULA_CTX);
  const [tab, setTab] = useState<'resumen' | 'articulos' | 'zonas' | 'datos'>('resumen');
  const [clusters, setClusters] = useState<MovimientosCluster[]>([]);

  const { data: masivoData, load: loadMasivo } = useMovimientosMasivoResumen();
  const { data: resumenCompleto, loading: resumenLoading, load: loadResumen } = useMovimientosArticuloResumen();
  const hasMasivo = !!masivoData && masivoData.totalRegistros > 0;

  const loadData = useCallback(async () => {
    setLoading(true);
    const base = await fetchBaseQueryData();
    const { areasData, invData, gastosColData, gastosFilData, areaDistribData, moColData, moFilData, volColData, volFilData, empData, volDistData, factoresData, masivoZonData, masivoTotales } = base;
    // Fetch costos operación for formula variable generation (COSTOS_TOTAL_* tokens)
    const [{ data: costosColData }, { data: costosFilData }] = await Promise.all([
      supabase.from('costos_columnas').select('*').order('orden'),
      supabase.from('costos_operacion').select('*').order('orden'),
    ]);

    const areasWithCat = ((areasData ?? []) as any[]).map((a: any) => ({
      id: a.id, nombre: a.nombre, metros_cuadrados: a.metros_cuadrados ?? 0,
      metros_cubicos: a.metros_cubicos ?? 0, cantidad_racks: a.cantidad_racks ?? 0,
      categoria: a.categoria, costo_area: a.costo_area ?? 0, costo_area_formula: a.costo_area_formula,
    }));
    const categoryTotals: Record<string, number> = {};
    const categoryTotalsCubic: Record<string, number> = {};
    let totalM3Global = 0;
    areasWithCat.forEach(a => {
      const cat = a.categoria ?? 'Sin categoría';
      categoryTotals[cat] = (categoryTotals[cat] ?? 0) + (a.metros_cuadrados ?? 0);
      categoryTotalsCubic[cat] = (categoryTotalsCubic[cat] ?? 0) + (a.metros_cubicos ?? 0);
      totalM3Global += a.metros_cubicos ?? 0;
    });
    const enrichedAreaDist = ((areaDistribData ?? []) as any[]).map((d: any) => {
      const match = areasWithCat.find(a => a.nombre === d.area_name);
      const cat = match?.categoria ?? 'Sin categoría';
      const areaM2 = match?.metros_cuadrados ?? 0;
      const areaM3 = match?.metros_cubicos ?? 0;
      const catTotal = categoryTotals[cat] ?? 0;
      const catTotalCubic = categoryTotalsCubic[cat] ?? 0;
      return {
        ...d, categoria: cat,
        category_distribution_percentage: catTotal > 0 ? +((areaM2 / catTotal) * 100).toFixed(2) : 0,
        global_distribution_cubic_percentage: totalM3Global > 0 ? +((areaM3 / totalM3Global) * 100).toFixed(2) : 0,
        category_distribution_cubic_percentage: catTotalCubic > 0 ? +((areaM3 / catTotalCubic) * 100).toFixed(2) : 0,
      };
    });
    const t0 = (masivoTotales as any[])?.[0] ?? {};
    setFormulaCtx({
      inversiones: (invData as InversionRecord[]) ?? [],
      gastosColumnas: (gastosColData ?? []) as FormulaContext['gastosColumnas'],
      gastosFilas: (gastosFilData ?? []) as FormulaContext['gastosFilas'],
      areaDistribucion: enrichedAreaDist as FormulaContext['areaDistribucion'],
      manoObraColumnas: (moColData ?? []) as FormulaContext['manoObraColumnas'],
      manoObraFilas: (moFilData ?? []) as FormulaContext['manoObraFilas'],
      manoObraEmpleados: (empData ?? []) as FormulaContext['manoObraEmpleados'],
      volumenesColumnas: (volColData ?? []) as FormulaContext['volumenesColumnas'],
      volumenesFilas: (volFilData ?? []) as FormulaContext['volumenesFilas'],
      costosColumnas: (costosColData ?? []) as FormulaContext['costosColumnas'],
      costosFilas: (costosFilData ?? []) as FormulaContext['costosFilas'],
      areasData: areasWithCat.map(a => ({ nombre: a.nombre, metros_cuadrados: a.metros_cuadrados, cantidad_racks: a.cantidad_racks, metros_cubicos: a.metros_cubicos, costo_area: a.costo_area })),
      volDistribucion: (volDistData ?? []) as FormulaContext['volDistribucion'],
      factores: (factoresData ?? []) as FormulaContext['factores'],
      masivoZonas: ((masivoZonData ?? []) as any[]).map((r: any) => ({ zona: String(r.zona ?? ''), movimientos: Number(r.movimientos) || 0, unidades: Number(r.unidades) || 0, articulos_distintos: Number(r.articulos_distintos) || 0, meses_distintos: Number(r.meses_distintos) || 0, prom_movimientos_mes: Number(r.prom_movimientos_mes) || 0, prom_unidades_mes: Number(r.prom_unidades_mes) || 0 })),
      masivoArticulos: [],
      masivoZonaArticulos: [],
      masivoTotals: { totalArticulos: Number(t0.total_articulos) || 0, totalMovArticulos: Number(t0.total_movimientos) || 0, totalUnidArticulos: Number(t0.total_unidades) || 0, totalZonas: Number(t0.total_zonas) || 0, totalMovZonas: Number(t0.total_mov_zonas) || 0, totalUnidZonas: Number(t0.total_unid_zonas) || 0 },
    });
    setLoading(false);
  }, []);

  const loadClusters = useCallback(async () => {
    const { data } = await supabase.from('costos_movimientos_clusters').select('*').order('orden');
    setClusters((data ?? []) as MovimientosCluster[]);
  }, []);

  useEffect(() => { loadData(); loadMasivo(); loadClusters(); }, [loadData, loadMasivo, loadClusters]);

  const handleClearAll = async () => {
    if (!confirm('¿Eliminar TODOS los datos cargados de Costos Movimientos? Esta acción no se puede deshacer.')) return;
    setClearing(true);
    await supabase.from('costos_movimientos_raw').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    setClearing(false);
    loadMasivo();
    // Reset resumen
    window.location.reload();
  };

  useEffect(() => {
    if ((tab === 'articulos' || tab === 'zonas') && !resumenCompleto && hasMasivo) {
      loadResumen();
    }
  }, [tab, resumenCompleto, loadResumen, hasMasivo]);

  const fmt = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);

  if (loading) {
    return (
      <AppLayout title="Costos Movimientos" subtitle="Cargando módulo...">
        <div className="flex items-center justify-center py-32">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Cargando datos...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Costos Movimientos"
      subtitle="Análisis de movimientos por zona (Zona Almacenaje) · %zona% por artículo"
      actions={
        <div className="flex items-center gap-2">
          {hasMasivo && (
            <button onClick={handleClearAll} disabled={clearing} className="flex items-center gap-2 px-4 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50">
              <i className="ri-delete-bin-line" />
              {clearing ? 'Limpiando...' : 'Limpiar todo'}
            </button>
          )}
          <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap">
            <div className="w-4 h-4 flex items-center justify-center"><i className="ri-file-excel-2-line" /></div>
            Cargar Excel
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Datos masivos de Movimientos</h3>
              <p className="text-xs text-slate-400 mt-0.5">Agrupados por <strong>Zona Almacenaje</strong> · %zona% = (Cantidad artículo / Total zona) × 100</p>
            </div>
            {hasMasivo && <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-medium">{fmt(masivoData!.totalRegistros)} registros</span>}
          </div>

          {!hasMasivo ? (
            <div className="px-6 py-12 flex flex-col items-center gap-4">
              <div className="w-14 h-14 flex items-center justify-center rounded-full bg-indigo-50">
                <i className="ri-truck-line text-2xl text-indigo-400" />
              </div>
              <div className="text-center max-w-sm">
                <p className="text-slate-700 font-semibold text-sm">Sin datos de movimientos</p>
                <p className="text-slate-400 text-xs mt-1">Carga un archivo Excel con los datos de movimientos para ver el análisis por zona.</p>
              </div>
              <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap">
                <i className="ri-file-excel-2-line" /> Cargar Excel
              </button>
            </div>
          ) : (
            <div className="px-6 py-4">
              <div className="flex gap-1 mb-4 flex-wrap">
                <TabBtn tab="resumen"   current={tab} onClick={setTab} icon="ri-dashboard-line"    label="Resumen" />
                <TabBtn tab="articulos" current={tab} onClick={setTab} icon="ri-price-tag-3-line"  label="Por Artículo" badge={resumenCompleto?.totalArticulos} />
                <TabBtn tab="zonas"     current={tab} onClick={setTab} icon="ri-map-pin-line"       label="Por Zona (% zona)" badge={resumenCompleto?.totalZonas} />
                <TabBtn tab="datos"     current={tab} onClick={setTab} icon="ri-table-line"         label="Ver datos" />
              </div>

              {tab === 'resumen'   && <ResumenTab data={masivoData!} />}
              {tab === 'articulos' && <ArticuloResumenTable data={resumenCompleto?.articulos} loading={resumenLoading} globalTotals={resumenCompleto ? { totalMov: resumenCompleto.totalMovArticulos, totalUnid: resumenCompleto.totalUnidArticulos, totalCount: resumenCompleto.totalArticulos } : undefined} />}
              {tab === 'zonas'     && <ZonaResumenTable data={resumenCompleto?.zonas} loading={resumenLoading} globalTotals={resumenCompleto ? { totalMov: resumenCompleto.totalMovZonas, totalUnid: resumenCompleto.totalUnidZonas, totalCount: resumenCompleto.totalZonas } : undefined} formulaCtx={formulaCtx} clusters={clusters} onClustersChange={loadClusters} />}
              {tab === 'datos'     && <MovimientosRawTable headers={masivoData!.headers} />}
            </div>
          )}
        </div>
      </div>

      {showUpload && (
        <UploadModalWrapper onClose={() => setShowUpload(false)} onSuccess={() => { loadMasivo(); loadResumen(); }} />
      )}
    </AppLayout>
  );
}

// ── Upload Modal Wrapper ──────────────────────────────────────────────────────

function UploadModalWrapper({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const Modal = React.lazy(() => import('./components/ExcelUploadModal'));
  return (
    <React.Suspense fallback={null}>
      <Modal onClose={onClose} onSuccess={onSuccess} />
    </React.Suspense>
  );
}

// ── Tab Button ────────────────────────────────────────────────────────────────

function TabBtn({ tab, current, onClick, icon, label, badge }: { tab: string; current: string; onClick: (t: any) => void; icon: string; label: string; badge?: number }) {
  const isActive = current === tab;
  return (
    <button onClick={() => onClick(tab)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${isActive ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
      <div className="w-3.5 h-3.5 flex items-center justify-center"><i className={`${icon} text-[11px]`} /></div>
      {label}
      {badge !== undefined && badge > 0 && (
        <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${isActive ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'}`}>{badge}</span>
      )}
    </button>
  );
}

// ── Resumen Tab ───────────────────────────────────────────────────────────────

function ResumenTab({ data }: { data: { totalRegistros: number; headers: string[] } }) {
  const fmt = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon="ri-database-2-line" iconColor="text-indigo-500" bg="bg-indigo-50" label="Total registros" value={fmt(data.totalRegistros)} sub="movimientos cargados" />
        <StatCard icon="ri-table-line" iconColor="text-indigo-500" bg="bg-indigo-50" label="Columnas" value={String(data.headers.length)} sub="detectadas del archivo" />
        <StatCard icon="ri-map-pin-line" iconColor="text-violet-500" bg="bg-violet-50" label="Agrupación" value="Zona Almacenaje" sub="columna base para %zona%" />
      </div>
      <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
        <p className="text-xs font-medium text-slate-600 mb-2">Columnas detectadas ({data.headers.length})</p>
        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
          {data.headers.map(h => (
            <span key={h} className={`px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${['Zona Almacenaje','Artículo','Cantidad','Id Compañía','Fecha Generación','DESCRIPCIONLARGA'].includes(h) ? 'bg-indigo-100 text-indigo-700 font-medium border border-indigo-200' : 'bg-white border border-slate-200 text-slate-600'}`}>{h}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Artículo Resumen Table ────────────────────────────────────────────────────

function ArticuloResumenTable({ data, loading, globalTotals }: { data?: ArticuloResumenRow[]; loading: boolean; globalTotals?: { totalMov: number; totalUnid: number; totalCount: number } }) {
  const fmt = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);
  const fmtDec = (n: number) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<'movimientos' | 'unidades'>('movimientos');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  if (loading) return <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>;
  const rows = data ?? [];
  if (rows.length === 0) return <div className="flex items-center justify-center py-16"><p className="text-sm text-slate-400">No hay datos disponibles.</p></div>;

  const totalMov  = globalTotals?.totalMov  ?? rows.reduce((s, r) => s + r.movimientos, 0);
  const totalUnid = globalTotals?.totalUnid ?? rows.reduce((s, r) => s + r.unidades, 0);

  const filtered = rows.filter(r => !search || r.articulo.toLowerCase().includes(search.toLowerCase()) || r.descripcion.toLowerCase().includes(search.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => (a[sortKey] - b[sortKey]) * (sortDir === 'asc' ? 1 : -1));
  const toggleSort = (k: typeof sortKey) => { if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(k); setSortDir('desc'); } };
  const sortIcon = (k: typeof sortKey) => sortKey !== k ? 'ri-expand-up-down-line text-slate-300' : sortDir === 'asc' ? 'ri-sort-asc text-slate-700' : 'ri-sort-desc text-slate-700';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-rose-50 rounded-lg px-4 py-3 border border-rose-100"><p className="text-xs text-rose-600 font-medium">Artículos únicos</p><p className="text-lg font-bold text-rose-700 mt-0.5">{(globalTotals?.totalCount ?? rows.length).toLocaleString('es-CO')}</p></div>
        <div className="bg-indigo-50 rounded-lg px-4 py-3 border border-indigo-100"><p className="text-xs text-indigo-600 font-medium">Total movimientos</p><p className="text-lg font-bold text-indigo-700 mt-0.5">{fmt(totalMov)}</p></div>
        <div className="bg-sky-50 rounded-lg px-4 py-3 border border-sky-100"><p className="text-xs text-sky-600 font-medium">Total unidades (Cantidad)</p><p className="text-lg font-bold text-sky-700 mt-0.5">{fmt(totalUnid)}</p></div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><i className="ri-search-line text-sm text-slate-400" /></div>
          <input type="text" placeholder="Buscar por código o descripción..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none bg-white placeholder:text-slate-400" />
        </div>
        <ExportMenu filenameBase="movimientos-articulos" getExportData={() => ({ headers: ['Código','Descripción','Movimientos','% Mov','Unidades','% Unid'], rows: sorted.map(r => [r.articulo, r.descripcion, r.movimientos, totalMov > 0 ? ((r.movimientos/totalMov)*100).toFixed(2) : '0', r.unidades, totalUnid > 0 ? ((r.unidades/totalUnid)*100).toFixed(2) : '0']) })} />
      </div>
      <div className="border border-slate-200 rounded-lg overflow-auto max-h-[55vh]">
        <table className="text-xs whitespace-nowrap w-full">
          <thead><tr className="bg-slate-50 sticky top-0 z-10">
            <th className="px-3 py-2.5 text-left text-slate-500 font-semibold border-r border-slate-200">Artículo</th>
            <th className="px-3 py-2.5 text-left text-slate-500 font-semibold border-r border-slate-200">Descripción</th>
            <th className="px-3 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200 cursor-pointer hover:bg-slate-100" onClick={() => toggleSort('movimientos')}>Movimientos <i className={sortIcon('movimientos')} /></th>
            <th className="px-3 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200">% Mov</th>
            <th className="px-3 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200 cursor-pointer hover:bg-slate-100" onClick={() => toggleSort('unidades')}>Cantidad <i className={sortIcon('unidades')} /></th>
            <th className="px-3 py-2.5 text-right text-slate-500 font-semibold">% Cantidad</th>
          </tr></thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={row.articulo} className={`border-t border-slate-100 hover:bg-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                <td className="px-3 py-2 font-medium text-slate-700 border-r border-slate-100">{row.articulo}</td>
                <td className="px-3 py-2 text-slate-600 border-r border-slate-100 max-w-[300px] overflow-hidden text-ellipsis" title={row.descripcion}>{row.descripcion || '—'}</td>
                <td className="px-3 py-2 text-right font-medium text-slate-700 border-r border-slate-100">{fmt(row.movimientos)}</td>
                <td className="px-3 py-2 text-right text-slate-500 border-r border-slate-100">{(totalMov > 0 ? (row.movimientos/totalMov)*100 : 0).toFixed(2)}%</td>
                <td className="px-3 py-2 text-right font-medium text-slate-700 border-r border-slate-100">{fmt(row.unidades)}</td>
                <td className="px-3 py-2 text-right text-slate-500">{(totalUnid > 0 ? (row.unidades/totalUnid)*100 : 0).toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">{filtered.length} de {rows.length} artículos</p>
    </div>
  );
}

// ── Zona Resumen Table ────────────────────────────────────────────────────────

// ── Cluster Manager ───────────────────────────────────────────────────────────

function ClusterManager({ clusters, zonas, onChanged }: { clusters: MovimientosCluster[]; zonas: string[]; onChanged: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState('indigo');
  const [selectedZonas, setSelectedZonas] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const COLORS = ['indigo','violet','sky','teal','emerald','amber','rose','orange'];

  const openNew = () => { setEditId(null); setNombre(''); setColor('indigo'); setSelectedZonas([]); setShowForm(true); };
  const openEdit = (c: MovimientosCluster) => { setEditId(c.id); setNombre(c.nombre); setColor(c.color); setSelectedZonas([...c.zonas]); setShowForm(true); };
  const toggleZona = (z: string) => setSelectedZonas(prev => prev.includes(z) ? prev.filter(x => x !== z) : [...prev, z]);

  const handleSave = async () => {
    if (!nombre.trim() || selectedZonas.length === 0) return;
    setSaving(true);
    if (editId) {
      await supabase.from('costos_movimientos_clusters').update({ nombre: nombre.trim(), zonas: selectedZonas, color }).eq('id', editId);
    } else {
      await supabase.from('costos_movimientos_clusters').insert({ nombre: nombre.trim(), zonas: selectedZonas, color, orden: clusters.length });
    }
    setSaving(false); setShowForm(false); onChanged();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este cluster?')) return;
    await supabase.from('costos_movimientos_clusters').delete().eq('id', id);
    onChanged();
  };

  const colorClass = (c: string, active = false) => {
    const map: Record<string, string> = { indigo: active ? 'bg-indigo-500 text-white' : 'bg-indigo-100 text-indigo-700', violet: active ? 'bg-violet-500 text-white' : 'bg-violet-100 text-violet-700', sky: active ? 'bg-sky-500 text-white' : 'bg-sky-100 text-sky-700', teal: active ? 'bg-teal-500 text-white' : 'bg-teal-100 text-teal-700', emerald: active ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-700', amber: active ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-700', rose: active ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-700', orange: active ? 'bg-orange-500 text-white' : 'bg-orange-100 text-orange-700' };
    return map[c] ?? map['indigo'];
  };

  const usedZonas = new Set(clusters.flatMap(c => c.zonas));

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-700">Clusters de Zonas</p>
          <p className="text-xs text-slate-400 mt-0.5">Agrupa zonas para analizarlas como una sola unidad</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap">
          <i className="ri-add-line" /> Nuevo cluster
        </button>
      </div>

      {clusters.length === 0 && !showForm && (
        <p className="text-xs text-slate-400 italic py-2 text-center">Sin clusters. Crea uno para agrupar zonas.</p>
      )}

      {clusters.map(c => (
        <div key={c.id} className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${colorClass(c.color, true)}`}>{c.nombre}</span>
            <div className="flex flex-wrap gap-1">
              {c.zonas.map(z => <span key={z} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-xs rounded border border-slate-200">{z}</span>)}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => openEdit(c)} className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 cursor-pointer"><i className="ri-pencil-line text-xs" /></button>
            <button onClick={() => handleDelete(c.id)} className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 cursor-pointer"><i className="ri-delete-bin-line text-xs" /></button>
          </div>
        </div>
      ))}

      {showForm && (
        <div className="bg-white border border-indigo-200 rounded-lg p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">{editId ? 'Editar cluster' : 'Nuevo cluster'}</p>
          <div className="flex gap-3">
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del cluster (ej: Pesado)" className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none" />
            <div className="flex gap-1">
              {COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)} className={`w-7 h-7 rounded-full border-2 transition-all cursor-pointer ${colorClass(c, true)} ${color === c ? 'border-slate-800 scale-110' : 'border-transparent'}`} title={c} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">Seleccionar zonas para este cluster:</p>
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
              {zonas.map(z => {
                const inOther = usedZonas.has(z) && !selectedZonas.includes(z);
                return (
                  <button key={z} onClick={() => !inOther && toggleZona(z)} disabled={inOther} className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer whitespace-nowrap ${selectedZonas.includes(z) ? `${colorClass(color, true)} border-transparent` : inOther ? 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'}`}>
                    {z}
                    {inOther && <span className="ml-1 text-[10px]">(en uso)</span>}
                  </button>
                );
              })}
            </div>
            {selectedZonas.length > 0 && <p className="text-xs text-indigo-600 mt-1.5">{selectedZonas.length} zona(s) seleccionada(s): {selectedZonas.join(', ')}</p>}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer">Cancelar</button>
            <button onClick={handleSave} disabled={!nombre.trim() || selectedZonas.length === 0 || saving} className="px-4 py-1.5 text-xs bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white font-medium rounded-lg cursor-pointer">
              {saving ? 'Guardando...' : editId ? 'Actualizar' : 'Crear cluster'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ZonaResumenTable ──────────────────────────────────────────────────────────

type ActiveSelection =
  | { type: 'zone'; zona: string }
  | { type: 'cluster'; cluster: MovimientosCluster };

function ZonaResumenTable({ data, loading, globalTotals, formulaCtx, clusters, onClustersChange }: { data?: ZonaResumenRow[]; loading: boolean; globalTotals?: { totalMov: number; totalUnid: number; totalCount: number }; formulaCtx: FormulaContext; clusters: MovimientosCluster[]; onClustersChange: () => void }) {
  const fmt    = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);
  const fmtDec = (n: number) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const rows = data ?? [];
  const [activeSelection, setActiveSelection] = useState<ActiveSelection>(
    rows[0] ? { type: 'zone', zona: rows[0].zona } : { type: 'zone', zona: '' }
  );
  const [showClusterManager, setShowClusterManager] = useState(false);
  const [search, setSearch] = useState('');
  const [artPage, setArtPage] = useState(0);
  const [artSortKey, setArtSortKey] = useState<string>('FIXED:movimientos');
  const [artSortDir, setArtSortDir] = useState<'asc' | 'desc'>('desc');
  const [, startTransition] = useTransition();
  const deferredSearch = useDeferredValue(search);

  const isCluster = activeSelection.type === 'cluster';
  const activeZone = activeSelection.type === 'zone' ? activeSelection.zona : '';
  const activeCluster = activeSelection.type === 'cluster' ? activeSelection.cluster : null;
  const activeClusterZonas = activeCluster?.zonas ?? [];

  const { data: companiaDataZone,  loading: companiaLoadingZone  } = useMovimientosZonaCompaniaResumen(activeZone);
  const { data: mensualDataZone }  = useMovimientosZonaArticuloMensual(activeZone);
  const { data: companiaDataCluster, loading: companiaLoadingCluster } = useMovimientosClusterCompaniaResumen(activeClusterZonas);
  const { data: mensualDataCluster } = useMovimientosClusterMensual(activeClusterZonas);

  const companiaData    = isCluster ? companiaDataCluster  : companiaDataZone;
  const articuloMensualData = isCluster ? mensualDataCluster : mensualDataZone;
  const companiaLoading = isCluster ? companiaLoadingCluster : companiaLoadingZone;

  // Zones not belonging to any cluster
  const allZoneNames = rows.map(r => r.zona);
  const clusteredZones = new Set(clusters.flatMap(c => c.zonas));
  const unclusteredZones = allZoneNames.filter(z => !clusteredZones.has(z));

  const [zonaColumnas, setZonaColumnas] = useState<MovimientosZonaColumnaDinamica[]>([]);
  const [celdasFormulas, setCeldasFormulas] = useState<Record<string, any[]>>({});
  const [colLoading, setColLoading] = useState(false);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [editingColumnFormula, setEditingColumnFormula] = useState<{ columnaId: string; colNombre: string; formula: string; position: { top: number; left: number }; columnTokens: { token: string; label: string; value?: number }[]; enrichedVarMap: Record<string, number> } | null>(null);
  const [colOrder, setColOrder] = useState<string[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const totalMov  = globalTotals?.totalMov  ?? rows.reduce((s, r) => s + r.movimientos, 0);
  const totalUnid = globalTotals?.totalUnid ?? rows.reduce((s, r) => s + r.unidades, 0);

  const activeZoneArtsAll = companiaData ?? [];
  const ART_PAGE_SIZE = 100;

  const articuloMensualMap = useMemo(() => {
    const map: Record<string, Record<number, { movimientos: number; unidades: number }>> = {};
    for (const row of articuloMensualData ?? []) {
      const key = `${row.idCompania}|${row.articulo}`;
      if (!map[key]) map[key] = {};
      map[key][row.mes] = { movimientos: row.movimientos, unidades: row.unidades };
    }
    return map;
  }, [articuloMensualData]);

  const mesesDisponibles = useMemo(() => {
    const seen = new Set<number>();
    const result: { mes: number; nombre: string }[] = [];
    for (const row of articuloMensualData ?? []) {
      if (!seen.has(row.mes)) { seen.add(row.mes); result.push({ mes: row.mes, nombre: row.mes_nombre }); }
    }
    return result.sort((a, b) => a.mes - b.mes);
  }, [articuloMensualData]);

  const getArtPromedios = useCallback((idCompania: string, articulo: string) => {
    const key = `${idCompania}|${articulo}`;
    const mesData = articuloMensualMap[key];
    if (!mesData) return { promMov: 0, promUnid: 0 };
    const meses = Object.keys(mesData).length;
    let tMov = 0, tUnid = 0;
    for (const m of Object.values(mesData)) { tMov += m.movimientos; tUnid += m.unidades; }
    return { promMov: meses > 0 ? Math.round(tMov / meses) : 0, promUnid: meses > 0 ? Math.round(tUnid / meses) : 0 };
  }, [articuloMensualMap]);

  const columnOrder = useMemo(() => {
    const derived = [
      'FIXED:idCompania', 'FIXED:codigo', 'FIXED:descripcion',
      'FIXED:movimientos', 'FIXED:pctMov', 'FIXED:unidades', 'FIXED:pctUnid',
      'FIXED:promMovMes', 'FIXED:promUnidMes', 'FIXED:pctPromMovMes', 'FIXED:pctPromUnidMes',
      ...mesesDisponibles.flatMap(m => [`MES:${m.mes}:mov`, `MES:${m.mes}:unid`]),
      ...zonaColumnas.map(c => c.id),
    ];
    const derivedSet = new Set(derived);
    if (colOrder.length === derived.length && colOrder.every(k => derivedSet.has(k))) return colOrder;
    return derived;
  }, [colOrder, mesesDisponibles, zonaColumnas]);

  // Auto-select first unclustered zone when data arrives and none is selected
  useEffect(() => {
    if (activeSelection.type === 'zone' && !activeSelection.zona && unclusteredZones.length > 0) {
      setActiveSelection({ type: 'zone', zona: unclusteredZones[0] });
    }
  }, [unclusteredZones]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchToZone = useCallback((zona: string) => {
    setSearch(''); setArtPage(0);
    setArtSortKey('FIXED:movimientos'); setArtSortDir('desc');
    startTransition(() => setActiveSelection({ type: 'zone', zona }));
  }, []);

  const switchToCluster = useCallback((cluster: MovimientosCluster) => {
    setSearch(''); setArtPage(0);
    setArtSortKey('FIXED:movimientos'); setArtSortDir('desc');
    startTransition(() => setActiveSelection({ type: 'cluster', cluster }));
  }, []);

  // Load dynamic columns for the active zone/cluster label
  const colsKey = isCluster ? (activeCluster?.id ?? '') : activeZone;

  const loadZonaColumnas = useCallback(async (zona: string) => {
    setColLoading(true); setColOrder([]);
    const { data: cols } = await supabase.from('costos_movimientos_zona_columnas').select('*').eq('zona', zona).order('orden');
    const colArray = (cols ?? []) as MovimientosZonaColumnaDinamica[];
    setZonaColumnas(colArray);
    if (colArray.length > 0) {
      const { data: cells } = await supabase.from('costos_movimientos_zona_celdas').select('*').in('columna_id', colArray.map(c => c.id));
      const byCol: Record<string, any[]> = {};
      for (const cell of (cells ?? [])) {
        if (!byCol[cell.columna_id]) byCol[cell.columna_id] = [];
        byCol[cell.columna_id].push(cell);
      }
      setCeldasFormulas(byCol);
    } else {
      setCeldasFormulas({});
    }
    setColLoading(false);
  }, []);

  useEffect(() => {
    const key = isCluster ? `_cluster_${activeCluster?.id ?? ''}` : activeZone;
    if (key && key !== '_cluster_') loadZonaColumnas(key);
  }, [colsKey, loadZonaColumnas, isCluster, activeCluster, activeZone]);

  // System variable map for formula editor
  const systemVarDefs = useMemo((): VariableDef[] => {
    if (!formulaCtx) return [];
    try { return buildVariableDefs(toAllDataSources(formulaCtx)); } catch { return []; }
  }, [formulaCtx]);

  const systemVarMap = useMemo((): Record<string, number> => {
    if (!formulaCtx || systemVarDefs.length === 0) return {};
    try { return buildVariableMap(systemVarDefs, toAllDataSources(formulaCtx)); } catch { return {}; }
  }, [formulaCtx, systemVarDefs]);

  // Computed zone/cluster stats
  const activeZoneRow = rows.find(r => r.zona === activeZone);
  const clusterTotalMov  = isCluster ? rows.filter(r => activeClusterZonas.includes(r.zona)).reduce((s, r) => s + r.movimientos, 0) : 0;
  const clusterTotalUnid = isCluster ? rows.filter(r => activeClusterZonas.includes(r.zona)).reduce((s, r) => s + r.unidades, 0) : 0;
  const zoneTotalMov  = isCluster ? clusterTotalMov  : (activeZoneRow?.movimientos ?? 0);
  const zoneTotalUnid = isCluster ? clusterTotalUnid : (activeZoneRow?.unidades    ?? 0);

  const sumAllPromMovArts  = useMemo(() => activeZoneArtsAll.reduce((s, a) => s + getArtPromedios(a.idCompania, a.articulo).promMov, 0), [activeZoneArtsAll, getArtPromedios]);
  const sumAllPromUnidArts = useMemo(() => activeZoneArtsAll.reduce((s, a) => s + getArtPromedios(a.idCompania, a.articulo).promUnid, 0), [activeZoneArtsAll, getArtPromedios]);

  const buildRowVarMap = useCallback((art: ZonaArticuloCompaniaRow) => {
    const proms = getArtPromedios(art.idCompania, art.articulo);
    return {
      MOV: art.movimientos, UNID: art.unidades,
      ZONA_MOV: zoneTotalMov, ZONA_UNID: zoneTotalUnid,
      PCT_MOV:  zoneTotalMov  > 0 ? (art.movimientos / zoneTotalMov)  * 100 : 0,
      PCT_UNID: zoneTotalUnid > 0 ? (art.unidades    / zoneTotalUnid) * 100 : 0,
      PROM_MOV_MES:  proms.promMov,
      PROM_UNID_MES: proms.promUnid,
      PCT_PROM_MOV_MES:  sumAllPromMovArts  > 0 ? (proms.promMov  / sumAllPromMovArts)  * 100 : 0,
      PCT_PROM_UNID_MES: sumAllPromUnidArts > 0 ? (proms.promUnid / sumAllPromUnidArts) * 100 : 0,
      ...systemVarMap,
    };
  }, [getArtPromedios, zoneTotalMov, zoneTotalUnid, sumAllPromMovArts, sumAllPromUnidArts, systemVarMap]);

  // Computed cells per column per article
  // Sanitize a column name to a valid token key (same pattern as formulaVariables)
  const colNameToToken = useCallback((nombre: string) =>
    nombre.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase(), []);

  const computedCells = useMemo(() => {
    const result: Record<string, Record<string, { value: number | null; formula: string | null; error: boolean; isGlobal: boolean }>> = {};
    // Per-article accumulator: token → value (enables cross-column references)
    const artAccum: Record<string, Record<string, number>> = {};
    for (const art of activeZoneArtsAll) {
      artAccum[`${art.idCompania}|${art.articulo}`] = {};
    }

    for (const col of zonaColumnas) {
      result[col.id] = {};
      const colToken = colNameToToken(col.nombre);
      const colFormula = col.formula?.trim();

      if (!colFormula) {
        for (const art of activeZoneArtsAll) {
          artAccum[`${art.idCompania}|${art.articulo}`][colToken] = 0;
          result[col.id][art.articulo] = { value: null, formula: null, error: false, isGlobal: false };
        }
        continue;
      }

      const hasRowVars = /\{(MOV|UNID|PCT_MOV|PCT_UNID|PROM_MOV_MES|PROM_UNID_MES|PCT_PROM_MOV_MES|PCT_PROM_UNID_MES|ZONA_MOV|ZONA_UNID)\}/i.test(colFormula);

      if (!hasRowVars) {
        // Global formula — same result for all rows (no row-level vars)
        const r = evalFormula(colFormula, { ...systemVarMap });
        const val = r.ok ? r.value : null;
        for (const art of activeZoneArtsAll) {
          artAccum[`${art.idCompania}|${art.articulo}`][colToken] = val ?? 0;
          result[col.id][art.articulo] = { value: val, formula: colFormula, error: !r.ok, isGlobal: true };
        }
      } else {
        for (const art of activeZoneArtsAll) {
          const k = `${art.idCompania}|${art.articulo}`;
          const cells = celdasFormulas[col.id] ?? [];
          const cellFormula = cells.find(c => c.articulo === art.articulo && (!c.id_compania || c.id_compania === art.idCompania))?.formula ?? colFormula;
          // varMap includes base article vars + all previously-computed column values
          const varMap = { ...buildRowVarMap(art), ...artAccum[k] };
          const r = evalFormula(cellFormula, varMap);
          const val = r.ok ? r.value : null;
          artAccum[k][colToken] = val ?? 0;
          result[col.id][art.articulo] = { value: val, formula: cellFormula, error: !r.ok, isGlobal: false };
        }
      }
    }
    return result;
  }, [zonaColumnas, celdasFormulas, activeZoneArtsAll, buildRowVarMap, systemVarMap, colNameToToken]);

  // Footer totals per dynamic column
  const footerTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const col of zonaColumnas) {
      totals[col.id] = Object.values(computedCells[col.id] ?? {}).reduce((s, c) => s + (!c.isGlobal && c.value !== null ? c.value : 0), 0);
    }
    return totals;
  }, [zonaColumnas, computedCells]);

  // Filtering + sorting articles
  const zoneFilteredArts = useMemo(() => {
    if (!deferredSearch) return activeZoneArtsAll;
    const q = deferredSearch.toLowerCase();
    return activeZoneArtsAll.filter(a => a.articulo.toLowerCase().includes(q) || a.descripcion.toLowerCase().includes(q) || a.idCompania.toLowerCase().includes(q));
  }, [activeZoneArtsAll, deferredSearch]);

  const zoneFilteredMov  = useMemo(() => zoneFilteredArts.reduce((s, a) => s + a.movimientos, 0), [zoneFilteredArts]);
  const zoneFilteredUnid = useMemo(() => zoneFilteredArts.reduce((s, a) => s + a.unidades, 0), [zoneFilteredArts]);

  const sortedArtsAll = useMemo(() => {
    return [...zoneFilteredArts].sort((a, b) => {
      const dir = artSortDir === 'asc' ? 1 : -1;
      if (artSortKey === 'FIXED:movimientos') return (a.movimientos - b.movimientos) * dir;
      if (artSortKey === 'FIXED:unidades') return (a.unidades - b.unidades) * dir;
      if (artSortKey === 'FIXED:pctMov') return ((a.movimientos / Math.max(zoneTotalMov, 1)) - (b.movimientos / Math.max(zoneTotalMov, 1))) * dir;
      if (artSortKey === 'FIXED:promMovMes')    return (getArtPromedios(a.idCompania, a.articulo).promMov  - getArtPromedios(b.idCompania, b.articulo).promMov)  * dir;
      if (artSortKey === 'FIXED:promUnidMes')   return (getArtPromedios(a.idCompania, a.articulo).promUnid - getArtPromedios(b.idCompania, b.articulo).promUnid) * dir;
      if (artSortKey === 'FIXED:pctPromMovMes')  return ((sumAllPromMovArts  > 0 ? getArtPromedios(a.idCompania, a.articulo).promMov  / sumAllPromMovArts  : 0) - (sumAllPromMovArts  > 0 ? getArtPromedios(b.idCompania, b.articulo).promMov  / sumAllPromMovArts  : 0)) * dir;
      if (artSortKey === 'FIXED:pctPromUnidMes') return ((sumAllPromUnidArts > 0 ? getArtPromedios(a.idCompania, a.articulo).promUnid / sumAllPromUnidArts : 0) - (sumAllPromUnidArts > 0 ? getArtPromedios(b.idCompania, b.articulo).promUnid / sumAllPromUnidArts : 0)) * dir;
      const colId = artSortKey;
      const va = computedCells[colId]?.[a.articulo]?.value ?? 0;
      const vb = computedCells[colId]?.[b.articulo]?.value ?? 0;
      return (va - vb) * dir;
    });
  }, [zoneFilteredArts, artSortKey, artSortDir, zoneTotalMov, getArtPromedios, computedCells]);

  const totalArtPages = Math.ceil(sortedArtsAll.length / ART_PAGE_SIZE);
  const paginatedArts = sortedArtsAll.slice(artPage * ART_PAGE_SIZE, (artPage + 1) * ART_PAGE_SIZE);

  const toggleArtSort = (key: string) => {
    if (artSortKey === key) setArtSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setArtSortKey(key); setArtSortDir('desc'); }
    setArtPage(0);
  };
  const sortIcon = (key: string) => artSortKey !== key ? 'ri-expand-up-down-line text-slate-300' : artSortDir === 'asc' ? 'ri-sort-asc text-slate-700' : 'ri-sort-desc text-slate-700';

  // Column management
  const handleAddColumn = useCallback(async () => {
    if (!newColName.trim()) return;
    // Use cluster key or zone name as the storage key
    const zoneKey = isCluster ? `_cluster_${activeCluster?.id ?? ''}` : activeZone;
    if (!zoneKey) return;
    const maxOrden = zonaColumnas.length;
    const { data: newCol, error } = await supabase
      .from('costos_movimientos_zona_columnas')
      .insert({ zona: zoneKey, nombre: newColName.trim(), tipo: 'formula', orden: maxOrden })
      .select()
      .maybeSingle();
    if (error) {
      console.error('Error al crear columna:', error);
      alert(`No se pudo crear la columna: ${error.message}`);
      return;
    }
    if (newCol) { setZonaColumnas(prev => [...prev, newCol as MovimientosZonaColumnaDinamica]); }
    setNewColName(''); setAddingColumn(false);
  }, [newColName, activeZone, isCluster, activeCluster, zonaColumnas]);

  const handleDeleteColumn = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar esta columna?')) return;
    await supabase.from('costos_movimientos_zona_columnas').delete().eq('id', id);
    setZonaColumnas(prev => prev.filter(c => c.id !== id));
    setCeldasFormulas(prev => { const n = { ...prev }; delete n[id]; return n; });
  }, []);

  const handleRenameColumn = useCallback(async (id: string, nombre: string) => {
    await supabase.from('costos_movimientos_zona_columnas').update({ nombre }).eq('id', id);
    setZonaColumnas(prev => prev.map(c => c.id === id ? { ...c, nombre } : c));
  }, []);

  const handleOpenColumnFormulaEditor = useCallback((col: MovimientosZonaColumnaDinamica, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Build list of ALL previous columns (before this one) as available tokens
    const colIdx = zonaColumnas.findIndex(c => c.id === col.id);
    const prevCols = colIdx > 0 ? zonaColumnas.slice(0, colIdx) : [];
    const sampleArt = activeZoneArtsAll[0];
    const columnTokens = prevCols.map(pc => ({
      token: colNameToToken(pc.nombre),
      label: pc.nombre,
      value: sampleArt ? (computedCells[pc.id]?.[sampleArt.articulo]?.value ?? undefined) : undefined,
    }));
    // Enrich varMap with previous column values for the sample article
    const prevColValues: Record<string, number> = {};
    prevCols.forEach(pc => {
      if (sampleArt) {
        const v = computedCells[pc.id]?.[sampleArt.articulo]?.value;
        if (v !== null && v !== undefined) prevColValues[colNameToToken(pc.nombre)] = v;
      }
    });
    const enrichedVarMap = sampleArt ? { ...buildRowVarMap(sampleArt), ...prevColValues } : { ...systemVarMap, ...prevColValues };
    setEditingColumnFormula({ columnaId: col.id, colNombre: col.nombre, formula: col.formula ?? '', position: { top: rect.bottom + 4, left: rect.left }, columnTokens, enrichedVarMap });
  }, [zonaColumnas, activeZoneArtsAll, computedCells, colNameToToken, buildRowVarMap, systemVarMap]);

  const handleSaveColumnFormula = useCallback(async (formula: string) => {
    if (!editingColumnFormula) return;
    const { columnaId } = editingColumnFormula;
    await supabase.from('costos_movimientos_zona_columnas').update({ formula: formula || null }).eq('id', columnaId);
    // Force reload from DB so computedCells picks up the saved formula
    const key = isCluster ? `_cluster_${activeCluster?.id ?? ''}` : activeZone;
    if (key) await loadZonaColumnas(key);
    setEditingColumnFormula(null);
  }, [editingColumnFormula, isCluster, activeCluster, activeZone, loadZonaColumnas]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const current = columnOrder;
    const oldIdx = current.indexOf(String(active.id));
    const newIdx = current.indexOf(String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    const next = [...current];
    next.splice(oldIdx, 1);
    next.splice(newIdx, 0, String(active.id));
    setColOrder(next);
  }, [columnOrder]);

  const ZONE_COLORS = ['bg-indigo-500','bg-violet-500','bg-sky-500','bg-teal-500','bg-amber-500','bg-rose-500','bg-emerald-500','bg-orange-500'];
  const clusterColorMap: Record<string,string> = { indigo:'bg-indigo-500', violet:'bg-violet-500', sky:'bg-sky-500', teal:'bg-teal-500', emerald:'bg-emerald-500', amber:'bg-amber-500', rose:'bg-rose-500', orange:'bg-orange-500' };

  const [exportingRaw, setExportingRaw] = React.useState(false);

  const handleExportRaw = useCallback(async () => {
    setExportingRaw(true);
    try {
      const label = isCluster ? (activeCluster?.nombre ?? 'Cluster') : activeZone;
      const zonas = isCluster ? activeClusterZonas : (activeZone ? [activeZone] : []);
      if (!zonas.length) return;

      const { data: json } = await supabase.rpc('fn_movimientos_raw_por_zonas', { p_zonas: zonas });
      const allRows: any[] = Array.isArray(json) ? json : [];

      const headers = [
        'Id Movimiento','Artículo','Descripción','Id Compañía','Zona Almacenaje',
        'Tipo Movimiento','Tipo Trabajo','Id Proceso','Id Subproceso',
        'Cantidad','Cantidad Almacenaje','Ubicación',
        'Fecha Generación','Fecha Cierre','Estado','Situación','Turno','Id Recurso',
      ];
      const rows = allRows.map(r => [
        r.id_movimiento, r.articulo, r.descripcion, r.id_compania, r.zona_almacenaje,
        r.tipo_movimiento, r.tipo_trabajo, r.id_proceso, r.id_subproceso,
        r.cantidad, r.cantidad_almacenaje, r.ubicacion,
        r.fecha_generacion, r.fecha_cierre, r.estado, r.situacion, r.turno, r.id_recurso,
      ]);
      downloadExcelMultiSheet(`movimientos_individuales_${label.replace(/[^a-zA-Z0-9]/g,'_').slice(0,40)}.xlsx`, [
        { name: 'Movimientos', headers, rows },
      ]);
    } finally { setExportingRaw(false); }
  }, [isCluster, activeCluster, activeClusterZonas, activeZone]);

  const handleExportZona = useCallback(() => {
    const fmtN = (n: number|null|undefined) => n != null ? Math.round(n * 100) / 100 : 0;
    const label = isCluster ? (activeCluster?.nombre ?? 'Cluster') : activeZone;

    // Sheet 1: Zone summary
    const summaryHeaders = ['Zona','Movimientos','% Total Mov.','Cantidad','% Total Cant.','Artículos distintos'];
    const summaryRows = rows.map(r => [
      r.zona, r.movimientos,
      fmtN(totalMov > 0 ? (r.movimientos / totalMov) * 100 : 0),
      r.unidades,
      fmtN(totalUnid > 0 ? (r.unidades / totalUnid) * 100 : 0),
      r.articulos_distintos ?? 0,
    ]);

    // Sheet 2: Active zone/cluster article detail
    const fixedH = ['Cía.','Artículo','Descripción','Movimientos','% Zona Mov.','Cantidad','% Zona Cant.','Prom.Mov/Mes','Prom.Cant/Mes'];
    const colH = zonaColumnas.map(c => c.nombre);
    const detailHeaders = [...fixedH, ...colH];
    const detailRows = sortedArtsAll.map(art => {
      const proms = getArtPromedios(art.idCompania, art.articulo);
      return [
        art.idCompania, art.articulo, art.descripcion,
        art.movimientos,
        fmtN(zoneTotalMov > 0 ? (art.movimientos / zoneTotalMov) * 100 : 0),
        art.unidades,
        fmtN(zoneTotalUnid > 0 ? (art.unidades / zoneTotalUnid) * 100 : 0),
        fmtN(proms.promMov), fmtN(proms.promUnid),
        ...zonaColumnas.map(c => fmtN(computedCells[c.id]?.[art.articulo]?.value)),
      ];
    });

    // Sheet 3: Formula definitions
    const fmlaHeaders = ['Columna','Fórmula'];
    const fmlaRows = zonaColumnas.filter(c => c.formula).map(c => [c.nombre, c.formula ?? '']);

    downloadExcelMultiSheet(`movimientos_zona_${label.replace(/[^a-zA-Z0-9]/g,'_').slice(0,40)}.xlsx`, [
      { name: 'Resumen Zonas',     headers: summaryHeaders, rows: summaryRows },
      { name: `Detalle ${label}`.slice(0,31), headers: detailHeaders, rows: detailRows },
      ...(fmlaRows.length > 0 ? [{ name: 'Fórmulas', headers: fmlaHeaders, rows: fmlaRows }] : []),
    ]);
  }, [rows, sortedArtsAll, zonaColumnas, computedCells, getArtPromedios,
      totalMov, totalUnid, zoneTotalMov, zoneTotalUnid,
      isCluster, activeCluster, activeZone]);

  if (loading) return <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (rows.length === 0) return <div className="flex items-center justify-center py-16"><p className="text-sm text-slate-400">No hay datos de zonas disponibles.</p></div>;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-indigo-50 rounded-lg px-4 py-3 border border-indigo-100"><p className="text-xs text-indigo-600 font-medium">Zonas distintas</p><p className="text-lg font-bold text-indigo-700">{rows.length}</p></div>
        <div className="bg-slate-50 rounded-lg px-4 py-3 border border-slate-200"><p className="text-xs text-slate-500 font-medium">Total mov. global</p><p className="text-lg font-bold text-slate-700">{fmt(totalMov)}</p></div>
        <div className="bg-sky-50 rounded-lg px-4 py-3 border border-sky-100"><p className="text-xs text-sky-600 font-medium">Total cant. global</p><p className="text-lg font-bold text-sky-700">{fmt(totalUnid)}</p></div>
      </div>

      {/* Cluster manager toggle */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">Selecciona una zona o cluster para ver el desglose por artículo</p>
        <div className="flex items-center gap-2">
          <button onClick={handleExportZona} disabled={companiaLoading} className="flex items-center gap-1.5 px-3 py-1.5 border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-wait text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap">
            {companiaLoading ? <><div className="w-3 h-3 border border-indigo-500 border-t-transparent rounded-full animate-spin"/>Cargando...</> : <><i className="ri-file-excel-2-line text-emerald-600"/>Resumen .xlsx</>}
          </button>
          <button onClick={handleExportRaw} disabled={exportingRaw} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-wait text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap">
            {exportingRaw ? <><div className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin"/>Descargando...</> : <><i className="ri-list-check-3 text-slate-500"/>Movimientos individuales .xlsx</>}
          </button>
          <button onClick={() => setShowClusterManager(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap">
            <i className={`ri-settings-${showClusterManager ? 'fill' : '2-line'} text-sm`} />
            {showClusterManager ? 'Ocultar clusters' : 'Gestionar clusters'}
            {clusters.length > 0 && <span className="ml-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-semibold">{clusters.length}</span>}
          </button>
        </div>
      </div>

      {showClusterManager && (
        <ClusterManager clusters={clusters} zonas={allZoneNames} onChanged={onClustersChange} />
      )}

      {/* Tabs: clusters first, then unclustered zones */}
      <div className="flex gap-1.5 flex-wrap">
        {/* Cluster tabs */}
        {clusters.map(cluster => {
          const isActive = activeSelection.type === 'cluster' && activeSelection.cluster.id === cluster.id;
          const clusterMov = rows.filter(r => cluster.zonas.includes(r.zona)).reduce((s, r) => s + r.movimientos, 0);
          const pct = totalMov > 0 ? (clusterMov / totalMov) * 100 : 0;
          const dotBg = clusterColorMap[cluster.color] ?? 'bg-indigo-500';
          return (
            <button key={cluster.id} onClick={() => switchToCluster(cluster)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 border ${isActive ? `${dotBg} text-white border-transparent shadow-sm` : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-300 hover:bg-indigo-50'}`}>
              <i className={`ri-stack-line text-xs ${isActive ? 'text-white/80' : 'text-slate-400'}`} />
              {cluster.nombre}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${isActive ? 'bg-white/20 text-white' : 'bg-indigo-100 text-indigo-700'}`}>{pct.toFixed(1)}%</span>
              <span className={`text-[10px] ${isActive ? 'text-white/60' : 'text-slate-400'}`}>({cluster.zonas.length} zonas)</span>
            </button>
          );
        })}

        {/* Separator if both clusters and zones */}
        {clusters.length > 0 && unclusteredZones.length > 0 && (
          <div className="flex items-center px-1"><div className="h-5 w-px bg-slate-200" /></div>
        )}

        {/* Individual unclustered zone tabs */}
        {unclusteredZones.map((zona, zi) => {
          const zone = rows.find(r => r.zona === zona);
          const isActive = activeSelection.type === 'zone' && activeSelection.zona === zona;
          const pct = totalMov > 0 && zone ? (zone.movimientos / totalMov) * 100 : 0;
          const dotColor = ZONE_COLORS[zi % ZONE_COLORS.length];
          return (
            <button key={zona} onClick={() => switchToZone(zona)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 border ${isActive ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'}`}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-white/70' : dotColor}`} />
              {zona}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{pct.toFixed(1)}%</span>
            </button>
          );
        })}
      </div>

      {/* Active stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border border-indigo-100 rounded-lg px-4 py-3">
          <p className="text-xs text-slate-500">{isCluster ? `Movimientos en cluster "${activeCluster?.nombre}"` : `Movimientos en zona`}</p>
          <p className="text-base font-bold text-indigo-700">{fmt(zoneTotalMov)}</p>
          <p className="text-xs text-slate-400">{totalMov > 0 ? ((zoneTotalMov/totalMov)*100).toFixed(2) : 0}% del total</p>
        </div>
        <div className="bg-white border border-sky-100 rounded-lg px-4 py-3">
          <p className="text-xs text-slate-500">Cantidad (abs)</p>
          <p className="text-base font-bold text-sky-700">{fmt(zoneTotalUnid)}</p>
          <p className="text-xs text-slate-400">{totalUnid > 0 ? ((zoneTotalUnid/totalUnid)*100).toFixed(2) : 0}% del total</p>
        </div>
        <div className="bg-white border border-violet-100 rounded-lg px-4 py-3">
          <p className="text-xs text-slate-500">{isCluster ? 'Zonas en cluster' : 'Artículos distintos'}</p>
          <p className="text-base font-bold text-violet-700">{isCluster ? activeClusterZonas.length : fmt(activeZoneRow?.articulos_distintos ?? 0)}</p>
          <p className="text-xs text-slate-400">{activeZoneArtsAll.length} compañía-artículo</p>
        </div>
      </div>

      {/* Article table per zone */}
      {companiaLoading ? (
        <div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><i className="ri-search-line text-sm text-slate-400" /></div>
              <input type="text" placeholder="Buscar artículo o compañía..." value={search} onChange={e => { setSearch(e.target.value); setArtPage(0); }} className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none bg-white placeholder:text-slate-400" />
            </div>
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="border border-slate-200 rounded-lg overflow-auto max-h-[60vh]">
              <table className="text-xs whitespace-nowrap w-full">
                <thead>
                  <tr className="bg-slate-50 sticky top-0 z-10">
                    <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
                      {columnOrder.map(colKey => {
                        if (colKey.startsWith('FIXED:')) {
                          const key = colKey.slice(6);
                          const headers: Record<string,string> = { idCompania:'Cía.', codigo:'Artículo', descripcion:'Descripción', movimientos:'Mov.', pctMov:'% Zona Mov.', unidades:'Cantidad', pctUnid:'% Zona Cant.', promMovMes:'Prom.Mov/Mes', promUnidMes:'Prom.Cant/Mes', pctPromMovMes:'% Prom.Mov/Mes', pctPromUnidMes:'% Prom.Cant/Mes' };
                          const sortable = ['movimientos','unidades','pctMov','promMovMes','promUnidMes','pctPromMovMes','pctPromUnidMes'].includes(key);
                          return (
                            <SortableFixedHeader key={colKey} id={colKey} className="px-3 py-2.5 text-left text-slate-500 font-semibold border-r border-slate-200 bg-slate-50">
                              {sortable ? <span onClick={() => toggleArtSort(`FIXED:${key}`)} className="cursor-pointer hover:text-slate-700 flex items-center gap-1">{headers[key] ?? key}<i className={`${sortIcon(`FIXED:${key}`)} ml-0.5`} /></span> : <span>{headers[key] ?? key}</span>}
                            </SortableFixedHeader>
                          );
                        } else if (colKey.startsWith('MES:')) {
                          const [, mesNum, subType] = colKey.split(':');
                          const mes = mesesDisponibles.find(m => m.mes === parseInt(mesNum));
                          return <th key={colKey} className="px-2 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200 bg-teal-50/40">{mes?.nombre ?? mesNum} {subType === 'mov' ? '(Mov)' : '(Cant)'}</th>;
                        } else {
                          const col = zonaColumnas.find(c => c.id === colKey);
                          if (!col) return null;
                          return (
                            <SortableColHeader key={col.id} col={col} onDelete={handleDeleteColumn} onEditFormula={handleOpenColumnFormulaEditor} onRename={handleRenameColumn} onSort={() => toggleArtSort(col.id)} sortIconClass={sortIcon(col.id)} />
                          );
                        }
                      })}
                    </SortableContext>
                    <th className="px-1 py-2.5 bg-slate-50">
                      {addingColumn ? (
                        <div className="flex items-center gap-1 px-1">
                          <input type="text" value={newColName} onChange={e => setNewColName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddColumn(); if (e.key === 'Escape') { setAddingColumn(false); setNewColName(''); } }} placeholder="Nombre..." className="w-[120px] px-2 py-1 text-xs border border-indigo-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white" autoFocus />
                          <button onClick={handleAddColumn} disabled={!newColName.trim()} className="w-6 h-6 flex items-center justify-center rounded-md bg-indigo-500 hover:bg-indigo-600 text-white cursor-pointer disabled:opacity-50"><i className="ri-check-line text-xs" /></button>
                          <button onClick={() => { setAddingColumn(false); setNewColName(''); }} className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 cursor-pointer"><i className="ri-close-line text-xs" /></button>
                        </div>
                      ) : (
                        <button onClick={() => setAddingColumn(true)} className="w-8 h-8 flex items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-indigo-400 hover:text-indigo-500 hover:bg-indigo-50 cursor-pointer transition-all" title="Agregar columna de fórmula"><i className="ri-add-line text-sm" /></button>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedArts.length === 0 ? (
                    <tr><td colSpan={columnOrder.length + 1} className="px-3 py-10 text-center text-slate-400">{search ? 'Sin resultados' : 'Sin artículos en esta zona'}</td></tr>
                  ) : paginatedArts.map((art, ai) => {
                    const artPctMov  = zoneFilteredMov  > 0 ? (art.movimientos / zoneFilteredMov)  * 100 : 0;
                    const artPctUnid = zoneFilteredUnid > 0 ? (art.unidades    / zoneFilteredUnid) * 100 : 0;
                    const proms = getArtPromedios(art.idCompania, art.articulo);
                    return (
                      <tr key={`${activeZone}-${art.idCompania}-${art.articulo}`} className={`border-t border-slate-100 hover:bg-indigo-50/40 ${ai % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                        {columnOrder.map(colKey => {
                          if (colKey.startsWith('FIXED:')) {
                            const key = colKey.slice(6);
                            switch (key) {
                              case 'idCompania':   return <td key={colKey} className="px-3 py-2 font-medium text-slate-700 border-r border-slate-100">{art.idCompania || '—'}</td>;
                              case 'codigo':       return <td key={colKey} className="px-3 py-2 font-medium text-slate-700 border-r border-slate-100">{art.articulo}</td>;
                              case 'descripcion':  return <td key={colKey} className="px-3 py-2 text-slate-600 border-r border-slate-100 max-w-[320px] overflow-hidden text-ellipsis" title={art.descripcion}>{art.descripcion || '—'}</td>;
                              case 'movimientos':  return <td key={colKey} className="px-3 py-2 text-right font-medium text-slate-700 border-r border-slate-100">{fmt(art.movimientos)}</td>;
                              case 'pctMov':       return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><div className="flex items-center justify-end gap-2"><div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-400 rounded-full" style={{ width: `${Math.min(artPctMov, 100)}%` }} /></div><span className="text-slate-500 w-10 text-right">{artPctMov.toFixed(2)}%</span></div></td>;
                              case 'unidades':     return <td key={colKey} className="px-3 py-2 text-right font-medium text-slate-700 border-r border-slate-100">{fmt(art.unidades)}</td>;
                              case 'pctUnid':      return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><div className="flex items-center justify-end gap-2"><div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-violet-400 rounded-full" style={{ width: `${Math.min(artPctUnid, 100)}%` }} /></div><span className="text-slate-500 w-10 text-right">{artPctUnid.toFixed(2)}%</span></div></td>;
                              case 'promMovMes':    return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100 bg-amber-50/30"><div className="flex items-center justify-end gap-2" title={`${fmtDec(sumAllPromMovArts > 0 ? (proms.promMov / sumAllPromMovArts) * 100 : 0)}% del total`}><div className="w-10 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0"><div className="h-full bg-indigo-400 rounded-full" style={{ width: `${Math.max(sumAllPromMovArts > 0 ? (proms.promMov / sumAllPromMovArts) * 100 : 0, 0.3)}%` }} /></div><span className="text-slate-600 font-medium w-10 text-right">{fmtDec(proms.promMov)}</span></div></td>;
                              case 'promUnidMes':   return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100 bg-amber-50/30"><div className="flex items-center justify-end gap-2" title={`${fmtDec(sumAllPromUnidArts > 0 ? (proms.promUnid / sumAllPromUnidArts) * 100 : 0)}% del total`}><div className="w-10 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0"><div className="h-full bg-indigo-400 rounded-full" style={{ width: `${Math.max(sumAllPromUnidArts > 0 ? (proms.promUnid / sumAllPromUnidArts) * 100 : 0, 0.3)}%` }} /></div><span className="text-slate-700 font-semibold w-10 text-right">{fmtDec(proms.promUnid)}</span></div></td>;
                              case 'pctPromMovMes':  return <td key={colKey} className="px-2 py-2 text-right border-r border-slate-100 bg-emerald-50/20"><span className="text-emerald-700 font-medium text-xs">{fmtDec(sumAllPromMovArts  > 0 ? (proms.promMov  / sumAllPromMovArts)  * 100 : 0)}%</span></td>;
                              case 'pctPromUnidMes': return <td key={colKey} className="px-2 py-2 text-right border-r border-slate-100 bg-rose-50/20"><span className="text-rose-700 font-medium text-xs">{fmtDec(sumAllPromUnidArts > 0 ? (proms.promUnid / sumAllPromUnidArts) * 100 : 0)}%</span></td>;
                              default: return null;
                            }
                          } else if (colKey.startsWith('MES:')) {
                            const parts = colKey.split(':');
                            const mesNum = parseInt(parts[1]);
                            const subType = parts[2];
                            const k = `${art.idCompania}|${art.articulo}`;
                            const md = articuloMensualMap[k]?.[mesNum];
                            return <td key={colKey} className="px-2 py-2 text-right border-r border-slate-100 bg-teal-50/20"><span className={subType === 'mov' ? 'text-slate-600' : 'text-amber-700 font-medium'}>{md ? fmt(subType === 'mov' ? md.movimientos : md.unidades) : '—'}</span></td>;
                          } else {
                            const col = zonaColumnas.find(c => c.id === colKey);
                            if (!col) return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-slate-300">—</span></td>;
                            const cell = computedCells[col.id]?.[art.articulo];
                            const hasFormula = !!cell?.formula;
                            return (
                              <td key={col.id} onClick={e => handleOpenColumnFormulaEditor(col, e)} className={`px-3 py-2 text-right border-r border-slate-100 cursor-pointer transition-colors ${hasFormula ? 'hover:bg-indigo-100/60' : 'hover:bg-slate-100'}`} title={hasFormula ? cell?.formula ?? '' : 'Clic para agregar fórmula'}>
                                {hasFormula ? (cell?.error ? <span className="text-rose-500"><i className="ri-error-warning-line mr-1" />Error</span> : cell?.isGlobal ? <span className="text-slate-300 text-[10px] italic">—</span> : cell?.value !== null ? <span className="text-indigo-700 font-medium tabular-nums">{new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cell.value!)}</span> : <span className="text-slate-300">—</span>) : <span className="text-slate-300 text-[10px]">—</span>}
                              </td>
                            );
                          }
                        })}
                        <td className="px-1 py-2" />
                      </tr>
                    );
                  })}
                </tbody>
                {paginatedArts.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-100/80">
                      {columnOrder.map(colKey => {
                        if (colKey.startsWith('FIXED:')) {
                          const key = colKey.slice(6);
                          switch (key) {
                            case 'idCompania': return <td key={colKey} className="px-3 py-2 font-semibold text-slate-600 border-r border-slate-100 text-xs">{zoneFilteredArts.length} artículos</td>;
                            case 'movimientos': return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-slate-700">{fmt(zoneFilteredMov)}</span></td>;
                            case 'pctMov': return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-indigo-600">100%</span></td>;
                            case 'unidades': return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-slate-700">{fmt(zoneFilteredUnid)}</span></td>;
                            case 'pctUnid':        return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-violet-600">100%</span></td>;
                            case 'promMovMes':     return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100 bg-amber-50/40"><span className="text-xs font-bold text-amber-700">{fmtDec(zoneFilteredArts.length > 0 ? zoneFilteredArts.reduce((s,a) => s + getArtPromedios(a.idCompania,a.articulo).promMov,  0) / zoneFilteredArts.length : 0)}</span></td>;
                            case 'promUnidMes':    return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100 bg-amber-50/40"><span className="text-xs font-bold text-amber-700">{fmtDec(zoneFilteredArts.length > 0 ? zoneFilteredArts.reduce((s,a) => s + getArtPromedios(a.idCompania,a.articulo).promUnid, 0) / zoneFilteredArts.length : 0)}</span></td>;
                            case 'pctPromMovMes':  return <td key={colKey} className="px-2 py-2 text-right border-r border-slate-100 bg-emerald-50/30"><span className="text-xs font-bold text-emerald-700">100%</span></td>;
                            case 'pctPromUnidMes': return <td key={colKey} className="px-2 py-2 text-right border-r border-slate-100 bg-rose-50/30"><span className="text-xs font-bold text-rose-700">100%</span></td>;
                            default: return <td key={colKey} className="px-2 py-2 border-r border-slate-100" />;
                          }
                        } else if (colKey.startsWith('MES:')) {
                          return <td key={colKey} className="px-2 py-2 border-r border-slate-100" />;
                        } else {
                          return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-indigo-700 tabular-nums">{new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(footerTotals[colKey] ?? 0)}</span></td>;
                        }
                      })}
                      <td className="px-1 py-2" />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </DndContext>

          {totalArtPages > 1 && (
            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-xs text-slate-400">{artPage * ART_PAGE_SIZE + 1}–{Math.min((artPage + 1) * ART_PAGE_SIZE, sortedArtsAll.length)} de {sortedArtsAll.length}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setArtPage(p => Math.max(0, p - 1))} disabled={artPage === 0} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 cursor-pointer whitespace-nowrap"><i className="ri-arrow-left-s-line" /> Anterior</button>
                <button onClick={() => setArtPage(p => Math.min(totalArtPages - 1, p + 1))} disabled={artPage >= totalArtPages - 1} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 cursor-pointer whitespace-nowrap">Siguiente <i className="ri-arrow-right-s-line" /></button>
              </div>
            </div>
          )}

          {editingColumnFormula && (
            <ZonaCeldaFormulaEditor
              formula={editingColumnFormula.formula}
              varMap={editingColumnFormula.enrichedVarMap}
              onSave={handleSaveColumnFormula}
              onCancel={() => setEditingColumnFormula(null)}
              position={editingColumnFormula.position}
              systemVarDefs={systemVarDefs}
              systemVarMap={systemVarMap}
              columnTokens={editingColumnFormula.columnTokens}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Sortable Fixed Header ─────────────────────────────────────────────────────

function SortableFixedHeader({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 20 : undefined, position: 'relative' };
  return (
    <th ref={setNodeRef} style={style} className={className}>
      <div className="flex items-center gap-1.5">
        <button {...attributes} {...listeners} className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 cursor-grab active:cursor-grabbing flex-shrink-0"><i className="ri-draggable text-xs" /></button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </th>
  );
}

// ── Sortable Dynamic Column Header ────────────────────────────────────────────

function SortableColHeader({ col, onDelete, onEditFormula, onRename, onSort, sortIconClass }: { col: MovimientosZonaColumnaDinamica; onDelete: (id: string) => void; onEditFormula: (col: MovimientosZonaColumnaDinamica, e: React.MouseEvent) => void; onRename: (id: string, nombre: string) => void; onSort: () => void; sortIconClass: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.id });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(col.nombre);
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 20 : undefined, position: 'relative' };
  const hasFormula = !!col.formula?.trim();
  const handleSave = () => { const t = name.trim(); if (t && t !== col.nombre) onRename(col.id, t); else setName(col.nombre); setEditing(false); };
  return (
    <th ref={setNodeRef} style={style} className={`px-2 py-2.5 border-r font-semibold ${hasFormula ? 'bg-indigo-100/60 border-indigo-200' : 'bg-indigo-50/50 border-indigo-100'}`}>
      <div className="flex items-center gap-1.5">
        <button {...attributes} {...listeners} className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 cursor-grab active:cursor-grabbing flex-shrink-0"><i className="ri-draggable text-xs" /></button>
        <div className="flex items-center gap-1 min-w-0 flex-1">
          {editing ? (
            <input type="text" value={name} onChange={e => setName(e.target.value)} onBlur={handleSave} onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setName(col.nombre); setEditing(false); } }} className="text-xs text-indigo-700 bg-white border border-indigo-300 rounded px-1.5 py-0.5 w-full min-w-[80px] focus:outline-none" autoFocus />
          ) : (
            <div className="flex items-center gap-0.5 min-w-0 group/name">
              <span onClick={onSort} className="text-xs text-indigo-700 whitespace-nowrap max-w-[120px] overflow-hidden text-ellipsis cursor-pointer hover:underline">{col.nombre}</span>
              <div className="w-3 h-3 flex items-center justify-center flex-shrink-0 cursor-pointer" onClick={onSort}><i className={sortIconClass} /></div>
              <button onClick={() => { setName(col.nombre); setEditing(true); }} className="w-4 h-4 flex items-center justify-center rounded text-slate-300 hover:text-indigo-500 cursor-pointer flex-shrink-0 opacity-0 group-hover/name:opacity-100"><i className="ri-pencil-line text-[10px]" /></button>
            </div>
          )}
          {hasFormula && <span className="text-[10px] px-1 py-0.5 rounded bg-indigo-200 text-indigo-700 font-mono font-bold flex-shrink-0">fx</span>}
        </div>
        <button onClick={e => onEditFormula(col, e)} className={`w-5 h-5 flex items-center justify-center rounded cursor-pointer flex-shrink-0 ${hasFormula ? 'text-indigo-600 hover:text-indigo-800 hover:bg-indigo-200' : 'text-slate-400 hover:text-indigo-500 hover:bg-indigo-100'}`}><i className={`${hasFormula ? 'ri-pencil-line' : 'ri-functions'} text-xs`} /></button>
        <button onClick={() => onDelete(col.id)} className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 cursor-pointer flex-shrink-0"><i className="ri-close-line text-xs" /></button>
      </div>
    </th>
  );
}
