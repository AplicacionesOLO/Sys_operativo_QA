import React, { useState, useEffect, useCallback, useMemo, useTransition, useDeferredValue } from 'react';
import { supabase } from '@/lib/supabase';
import AppLayout from '@/components/feature/AppLayout';
import type { FormulaContext } from '@/lib/formulaEngine';
import { EMPTY_FORMULA_CTX } from '@/lib/formulaEngine';
import type { InversionRecord } from '@/types/inversion';
import CrossdockingZonaCeldaFormulaEditor from './components/ZonaCeldaFormulaEditor';
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
  useCrossdockingMasivoResumen, useCrossdockingArticuloResumen, useCrossdockingZonaCompaniaResumen, useCrossdockingZonaArticuloMensual,
  CrossdockingRawTable, StatCard,
  type ArticuloResumenRow, type ZonaResumenRow, type ZonaArticuloDetalleRow, type ZonaArticuloCompaniaRow, type ZonaArticuloMensualRow, type ResumenCompleto,
} from './components/MasivoHooks';
import ExportMenu from '@/components/base/ExportMenu';
import type { CrossdockingZonaColumnaDinamica } from '@/types/costos_crossdocking';

export default function CostosCrossdockingPage() {
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [formulaCtx, setFormulaCtx] = useState<FormulaContext>(EMPTY_FORMULA_CTX);

  const { data: masivoData, load: loadMasivo } = useCrossdockingMasivoResumen();
  const { data: resumenCompleto, loading: resumenLoading, load: loadResumen } = useCrossdockingArticuloResumen();

  const [tab, setTab] = useState<'resumen' | 'articulos' | 'zonas' | 'datos' | 'operacion'>('resumen');

  const hasMasivo = !!masivoData && masivoData.totalRegistros > 0;

  const loadData = useCallback(async () => {
    setLoading(true);
    const [
      { data: areasData },
      { data: invData }, { data: gastosColData }, { data: gastosFilData },
      { data: areaDistribData }, { data: moColData }, { data: moFilData },
      { data: volColData }, { data: volFilData }, { data: empData },
      { data: volDistData }, { data: factoresData },
      { data: costosOpColData }, { data: costosOpFilData },
    ] = await Promise.all([
      supabase.from('areas').select('id, nombre, metros_cuadrados, cantidad_racks, metros_cubicos, categoria, costo_area, costo_area_formula').order('nombre'),
      supabase.from('inversiones').select('*').order('created_at'),
      supabase.from('gastos_varios_columnas').select('id, nombre, tipo').order('orden'),
      supabase.from('gastos_varios').select('id, area, concepto, parent_id, es_total, tipo_fila, valores'),
      supabase.from('area_distribution').select('area_name, global_distribution_percentage'),
      supabase.from('mano_obra_columnas').select('id, nombre, tipo, is_sensitive').order('orden'),
      supabase.from('mano_obra').select('id, area, valores'),
      supabase.from('volumenes_columnas').select('id, nombre, tipo').order('orden'),
      supabase.from('volumenes').select('id, proceso, subproceso, valores'),
      supabase.from('mano_obra_empleados').select('*').eq('is_active', true),
      supabase.from('volumen_distribucion').select('id, nombre, porcentaje, porcentaje_inbound, porcentaje_outbound, categoria, is_active, unidades, es_zona_franca').eq('is_active', true).order('orden'),
      supabase.from('factores').select('*'),
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
      const catPct = catTotal > 0 ? (areaM2 / catTotal) * 100 : 0;
      const catPctCubic = catTotalCubic > 0 ? (areaM3 / catTotalCubic) * 100 : 0;
      const globalCubicPct = totalM3Global > 0 ? (areaM3 / totalM3Global) * 100 : 0;
      return { ...d, categoria: cat, category_distribution_percentage: +catPct.toFixed(2), global_distribution_cubic_percentage: +globalCubicPct.toFixed(2), category_distribution_cubic_percentage: +catPctCubic.toFixed(2) };
    });

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
      areasData: areasWithCat.map(a => ({ nombre: a.nombre, metros_cuadrados: a.metros_cuadrados, cantidad_racks: a.cantidad_racks, metros_cubicos: a.metros_cubicos, costo_area: a.costo_area })),
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

  useEffect(() => { loadData(); loadMasivo(); }, [loadData, loadMasivo]);

  useEffect(() => {
    if ((tab === 'articulos' || tab === 'zonas') && !resumenCompleto && hasMasivo) {
      loadResumen();
    }
  }, [tab, resumenCompleto, loadResumen, hasMasivo]);

  const fmt = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);

  if (loading) {
    return (
      <AppLayout title="Costos Crossdocking" subtitle="Cargando módulo...">
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
      title="Costos Crossdocking"
      subtitle="Datos masivos de crossdocking + resumen por zona y artículo"
      actions={
        <div className="flex items-center gap-2">
          <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap">
            <div className="w-4 h-4 flex items-center justify-center"><i className="ri-file-excel-2-line" /></div>
            Cargar Excel masivo
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Datos masivos de Crossdocking</h3>
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
                <p className="text-slate-400 text-xs mt-1">Carga un archivo Excel con los datos de crossdocking para ver el resumen.</p>
              </div>
              <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap">
                <div className="w-4 h-4 flex items-center justify-center"><i className="ri-file-excel-2-line" /></div>Cargar Excel
              </button>
            </div>
          ) : (
            <div className="px-6 py-4">
              <div className="flex gap-1 mb-4">
                <TabBtn tab="resumen" current={tab} onClick={setTab} icon="ri-dashboard-line" label="Resumen" />
                <TabBtn tab="articulos" current={tab} onClick={setTab} icon="ri-price-tag-3-line" label="Resumen por Artículo" badge={resumenCompleto?.totalArticulos} />
                <TabBtn tab="zonas" current={tab} onClick={setTab} icon="ri-map-pin-line" label="Resumen por Zona" badge={resumenCompleto?.totalZonas} />
                <TabBtn tab="datos" current={tab} onClick={setTab} icon="ri-table-line" label="Ver datos" />
                <TabBtn tab="operacion" current={tab} onClick={setTab} icon="ri-calculator-line" label="Operación" />
              </div>

              {tab === 'resumen' && <CrossdockingResumenTab data={masivoData!} />}
              {tab === 'articulos' && <CrossdockingArticuloResumenTable data={resumenCompleto?.articulos} loading={resumenLoading} globalTotals={resumenCompleto ? { totalMov: resumenCompleto.totalMovArticulos, totalUnid: resumenCompleto.totalUnidArticulos, totalCount: resumenCompleto.totalArticulos } : undefined} />}
              {tab === 'zonas' && <CrossdockingZonaResumenTable data={resumenCompleto?.zonas} loading={resumenLoading} globalTotals={resumenCompleto ? { totalMov: resumenCompleto.totalMovZonas, totalUnid: resumenCompleto.totalUnidZonas, totalCount: resumenCompleto.totalZonas } : undefined} formulaCtx={formulaCtx} />}
              {tab === 'datos' && <CrossdockingRawTable headers={masivoData!.headers} />}
              {tab === 'operacion' && (
                <div className="py-16 flex flex-col items-center gap-4">
                  <div className="w-14 h-14 flex items-center justify-center rounded-full bg-slate-100">
                    <i className="ri-tools-line text-2xl text-slate-400" />
                  </div>
                  <div className="text-center max-w-sm">
                    <p className="text-slate-700 font-semibold text-sm">Módulo en construcción</p>
                    <p className="text-slate-400 text-xs mt-1">La matriz de costos con fórmulas para crossdocking estará disponible pronto.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showUpload && (
        <UploadModalWrapper onClose={() => setShowUpload(false)} onSuccess={() => { loadData(); loadMasivo(); loadResumen(); }} />
      )}
    </AppLayout>
  );
}

// ── Upload Modal Wrapper (lazy import to avoid circular deps) ────────────

function UploadModalWrapper({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const CrossdockingExcelUploadModal = React.lazy(() => import('./components/ExcelUploadModal'));
  return (
    <React.Suspense fallback={null}>
      <CrossdockingExcelUploadModal onClose={onClose} onSuccess={onSuccess} />
    </React.Suspense>
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

function CrossdockingResumenTab({ data }: { data: { totalRegistros: number; headers: string[] } }) {
  const fmt = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon="ri-database-2-line" iconColor="text-teal-500" bg="bg-teal-50" label="Total registros" value={fmt(data.totalRegistros)} sub="filas cargadas" />
        <StatCard icon="ri-table-line" iconColor="text-emerald-500" bg="bg-emerald-50" label="Columnas" value={String(data.headers.length)} sub="detectadas del archivo" />
        <StatCard icon="ri-file-excel-2-line" iconColor="text-green-500" bg="bg-green-50" label="Formato" value="RAW" sub="sin transformar" />
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

// ── Articulo Resumen Table ─────────────────────────────────────────────────

function CrossdockingArticuloResumenTable({ data, loading, globalTotals }: { data?: ArticuloResumenRow[]; loading: boolean; globalTotals?: { totalMov: number; totalUnid: number; totalCount: number } }) {
  const fmt = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);
  const fmtDec = (n: number) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const fmtPct = (n: number) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<'movimientos' | 'unidades' | 'prom_movimientos_mes' | 'prom_unidades_mes'>('movimientos');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  if (loading) return <div className="flex items-center justify-center py-16"><div className="flex flex-col items-center gap-3"><div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" /><p className="text-xs text-slate-400">Calculando resumen por artículo...</p></div></div>;

  const rows = data ?? [];
  if (rows.length === 0) return <div className="flex items-center justify-center py-16"><p className="text-sm text-slate-400">No hay datos disponibles.</p></div>;

  const totalMov = globalTotals?.totalMov ?? rows.reduce((s, r) => s + r.movimientos, 0);
  const totalUnid = globalTotals?.totalUnid ?? rows.reduce((s, r) => s + r.unidades, 0);
  const totalCount = globalTotals?.totalCount ?? rows.length;

  const filtered = rows.filter(row => !search || row.articulo.toLowerCase().includes(search.toLowerCase()) || row.descripcion.toLowerCase().includes(search.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => { const dir = sortDir === 'asc' ? 1 : -1; return (a[sortKey] - b[sortKey]) * dir; });
  const toggleSort = (key: typeof sortKey) => { if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setSortDir('desc'); } };
  const sortIcon = (key: typeof sortKey) => sortKey !== key ? 'ri-expand-up-down-line text-slate-300' : sortDir === 'asc' ? 'ri-sort-asc text-slate-700' : 'ri-sort-desc text-slate-700';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-rose-50 rounded-lg px-4 py-3 border border-rose-100"><p className="text-xs text-rose-600 font-medium">Artículos únicos</p><p className="text-lg font-bold text-rose-700 mt-0.5">{totalCount.toLocaleString('es-CO')}</p></div>
        <div className="bg-emerald-50 rounded-lg px-4 py-3 border border-emerald-100"><p className="text-xs text-emerald-600 font-medium">Total movimientos</p><p className="text-lg font-bold text-emerald-700 mt-0.5">{fmt(totalMov)}</p></div>
        <div className="bg-sky-50 rounded-lg px-4 py-3 border border-sky-100"><p className="text-xs text-sky-600 font-medium">Total unidades</p><p className="text-lg font-bold text-sky-700 mt-0.5">{fmt(totalUnid)}</p></div>
        <div className="bg-violet-50 rounded-lg px-4 py-3 border border-violet-100"><p className="text-xs text-violet-600 font-medium">Promedio unid/artículo</p><p className="text-lg font-bold text-violet-700 mt-0.5">{fmtDec(totalCount > 0 ? totalUnid / totalCount : 0)}</p></div>
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><div className="w-3.5 h-3.5 flex items-center justify-center"><i className="ri-search-line text-sm text-slate-400" /></div></div>
          <input type="text" placeholder="Buscar por código o descripción..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-100 focus:border-teal-300 outline-none bg-white text-slate-700 placeholder:text-slate-400" />
        </div>
        <ExportMenu
          filenameBase="crossdocking-resumen-articulos"
          getExportData={() => {
            const headers = ['Código', 'Descripción', 'Movimientos', '% Mov', 'Unidades', '% Unid', 'Meses', 'Prom. Mov/Mes', 'Prom. Unid/Mes'];
            const exportRows = sorted.map(row => [
              row.articulo, row.descripcion || '', row.movimientos,
              totalMov > 0 ? ((row.movimientos / totalMov) * 100).toFixed(2) : '0',
              row.unidades,
              totalUnid > 0 ? ((row.unidades / totalUnid) * 100).toFixed(2) : '0',
              row.meses_distintos, row.prom_movimientos_mes.toFixed(2), row.prom_unidades_mes.toFixed(2),
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
            <th className="px-3 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200 cursor-pointer hover:bg-slate-100" onClick={() => toggleSort('movimientos')}><span>Movimientos</span><div className="w-3 h-3 flex items-center justify-center inline ml-1"><i className={sortIcon('movimientos')} /></div></th>
            <th className="px-3 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200">% Mov</th>
            <th className="px-3 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200 cursor-pointer hover:bg-slate-100" onClick={() => toggleSort('unidades')}><span>Unidades</span><div className="w-3 h-3 flex items-center justify-center inline ml-1"><i className={sortIcon('unidades')} /></div></th>
            <th className="px-3 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200">% Unid</th>
            <th className="px-3 py-2.5 text-center text-slate-500 font-semibold border-r border-slate-200">Meses</th>
            <th className="px-3 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200 cursor-pointer hover:bg-slate-100" onClick={() => toggleSort('prom_movimientos_mes')}><span>Prom. Mov/Mes</span><div className="w-3 h-3 flex items-center justify-center inline ml-1"><i className={sortIcon('prom_movimientos_mes')} /></div></th>
            <th className="px-3 py-2.5 text-right text-slate-500 font-semibold cursor-pointer hover:bg-slate-100" onClick={() => toggleSort('prom_unidades_mes')}><span>Prom. Unid/Mes</span><div className="w-3 h-3 flex items-center justify-center inline ml-1"><i className={sortIcon('prom_unidades_mes')} /></div></th>
          </tr></thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={row.articulo} className={`border-t border-slate-100 hover:bg-slate-50 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                <td className="px-3 py-2 font-medium text-slate-700 border-r border-slate-100">{row.articulo}</td>
                <td className="px-3 py-2 text-slate-600 border-r border-slate-100 max-w-[300px] overflow-hidden text-ellipsis" title={row.descripcion}>{row.descripcion || '—'}</td>
                <td className="px-3 py-2 text-right text-slate-600 border-r border-slate-100 font-medium">{fmt(row.movimientos)}</td>
                <td className="px-3 py-2 text-right border-r border-slate-100"><span className="text-slate-500">{fmtPct(totalMov > 0 ? (row.movimientos / totalMov) * 100 : 0)}%</span></td>
                <td className="px-3 py-2 text-right text-slate-600 border-r border-slate-100 font-medium">{fmt(row.unidades)}</td>
                <td className="px-3 py-2 text-right border-r border-slate-100"><span className="text-slate-500">{fmtPct(totalUnid > 0 ? (row.unidades / totalUnid) * 100 : 0)}%</span></td>
                <td className="px-3 py-2 text-center text-slate-500 border-r border-slate-100">{row.meses_distintos}</td>
                <td className="px-3 py-2 text-right text-slate-600 border-r border-slate-100">{fmtDec(row.prom_movimientos_mes)}</td>
                <td className="px-3 py-2 text-right text-slate-700 font-semibold">{fmtDec(row.prom_unidades_mes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-slate-400"><span>{filtered.length} de {rows.length} artículos</span></div>
    </div>
  );
}

// ── Zona Resumen Table (la más importante) ─────────────────────────────────

function CrossdockingZonaResumenTable({ data, loading, globalTotals, formulaCtx }: { data?: ZonaResumenRow[]; loading: boolean; globalTotals?: { totalMov: number; totalUnid: number; totalCount: number }; formulaCtx: FormulaContext }) {
  const fmt = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);
  const fmtDec = (n: number) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const fmtPct = (n: number) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const [search, setSearch] = useState('');
  const [companiaFilter, setCompaniaFilter] = useState<string>('all');

  const rows = data ?? [];
  const totalMov = globalTotals?.totalMov ?? rows.reduce((s, r) => s + r.movimientos, 0);
  const totalUnid = globalTotals?.totalUnid ?? rows.reduce((s, r) => s + r.unidades, 0);
  const totalCount = globalTotals?.totalCount ?? rows.length;

  const [activeZone, setActiveZone] = useState<string>(rows[0]?.zona ?? '');
  const { data: companiaData, loading: companiaLoading } = useCrossdockingZonaCompaniaResumen(activeZone);
  const { data: articuloMensualData } = useCrossdockingZonaArticuloMensual(activeZone);
  const activeZoneArtsAll = companiaData ?? [];
  const companiasUnicas = useMemo(() => {
    const set = new Set<string>();
    activeZoneArtsAll.forEach(a => { if (a.idCompania) set.add(a.idCompania); });
    return [...set].sort();
  }, [activeZoneArtsAll]);
  const [artSortKey, setArtSortKey] = useState<string>('FIXED:movimientos');
  const [artSortDir, setArtSortDir] = useState<'asc' | 'desc'>('desc');
  const [zoneSwitching, setZoneSwitching] = useState(false);
  const ART_PAGE_SIZE = 100;
  const [artPage, setArtPage] = useState(0);
  const [isPending, startTransition] = useTransition();
  const deferredSearch = useDeferredValue(search);

  const articuloMensualMap = useMemo(() => {
    const map: Record<string, Record<number, { movimientos: number; unidades: number }>> = {};
    if (!articuloMensualData) return map;
    for (const row of articuloMensualData) {
      const key = `${row.idCompania}|${row.articulo}`;
      if (!map[key]) map[key] = {};
      map[key][row.mes] = { movimientos: row.movimientos, unidades: row.unidades };
    }
    return map;
  }, [articuloMensualData]);

  const mesesDisponibles = useMemo(() => {
    if (!articuloMensualData) return [];
    const seen = new Set<number>();
    const result: { mes: number; nombre: string }[] = [];
    for (const row of articuloMensualData) {
      if (!seen.has(row.mes)) {
        seen.add(row.mes);
        result.push({ mes: row.mes, nombre: row.mes_nombre });
      }
    }
    result.sort((a, b) => a.mes - b.mes);
    return result;
  }, [articuloMensualData]);

  const getArtPromedios = useCallback((idCompania: string, articulo: string) => {
    const key = `${idCompania}|${articulo}`;
    const mesData = articuloMensualMap[key];
    if (!mesData) return { promMov: 0, promUnid: 0, mesesActivos: 0 };
    const meses = Object.keys(mesData).length;
    let totalMov = 0, totalUnid = 0;
    for (const m of Object.values(mesData)) { totalMov += m.movimientos; totalUnid += m.unidades; }
    return { promMov: meses > 0 ? Math.round(totalMov / meses) : 0, promUnid: meses > 0 ? Math.round(totalUnid / meses) : 0, mesesActivos: meses };
  }, [articuloMensualMap]);

  // Dynamic zona columns
  const [zonaColumnas, setZonaColumnas] = useState<CrossdockingZonaColumnaDinamica[]>([]);
  const [celdasFormulas, setCeldasFormulas] = useState<Record<string, any[]>>({});
  const [colLoading, setColLoading] = useState(false);
  const [editingColumnFormula, setEditingColumnFormula] = useState<{ columnaId: string; colNombre: string; formula: string; position: { top: number; left: number } } | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColName, setNewColName] = useState('');

  const [colOrder, setColOrder] = useState<string[]>([]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const columnOrder = useMemo(() => {
    const derived = [
      'FIXED:idCompania', 'FIXED:codigo', 'FIXED:descripcion',
      'FIXED:movimientos', 'FIXED:pctMov', 'FIXED:unidades', 'FIXED:pctUnid',
      'FIXED:promMovMes', 'FIXED:promUnidMes', 'FIXED:pctPromMovMes', 'FIXED:pctPromUnidMes',
      ...mesesDisponibles.flatMap(m => [`MES:${m.mes}:mov`, `MES:${m.mes}:unid`]),
      ...zonaColumnas.map(c => c.id),
    ];
    const derivedSet = new Set(derived);
    if (colOrder.length === derived.length && colOrder.every(k => derivedSet.has(k))) {
      return colOrder;
    }
    return derived;
  }, [colOrder, mesesDisponibles, zonaColumnas]);

  const switchZone = useCallback((zona: string) => {
    if (zona === activeZone) return;
    setZoneSwitching(true);
    setSearch('');
    setCompaniaFilter('all');
    setArtSortKey('FIXED:movimientos');
    setArtSortDir('desc');
    setArtPage(0);
    startTransition(() => { setActiveZone(zona); });
  }, [activeZone]);

  const loadZonaColumnas = useCallback(async (zona: string) => {
    setColLoading(true);
    setColOrder([]);
    const { data: cols } = await supabase.from('costos_crossdocking_zona_columnas').select('*').eq('zona', zona).order('orden');
    const colArray = (cols ?? []) as CrossdockingZonaColumnaDinamica[];
    setZonaColumnas(colArray);
    if (colArray.length > 0) {
      const colIds = colArray.map(c => c.id);
      const { data: cells } = await supabase.from('costos_crossdocking_zona_celdas').select('*').in('columna_id', colIds);
      const byCol: Record<string, any[]> = {};
      colIds.forEach(id => { byCol[id] = []; });
      (cells ?? []).forEach(c => { if (byCol[c.columna_id]) byCol[c.columna_id].push(c); });
      setCeldasFormulas(byCol);
    } else { setCeldasFormulas({}); }
    const savedKey = `costos-crossdocking-zone-order-${zona}`;
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
    if (activeZone) {
      loadZonaColumnas(activeZone).finally(() => setZoneSwitching(false));
      setEditingColumnFormula(null);
      setAddingColumn(false);
    }
  }, [activeZone, loadZonaColumnas]);

  useEffect(() => { setArtPage(0); }, [deferredSearch, companiaFilter]);

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
    localStorage.setItem(`costos-crossdocking-zone-order-${activeZone}`, JSON.stringify(reordered));
    const dynCols = reordered.filter(k => !k.startsWith('FIXED:') && !k.startsWith('MES:'));
    for (let i = 0; i < dynCols.length; i++) {
      const col = zonaColumnas.find(c => c.id === dynCols[i]);
      if (col && col.orden !== i) {
        await supabase.from('costos_crossdocking_zona_columnas').update({ orden: i }).eq('id', dynCols[i]);
      }
    }
  }, [columnOrder, zonaColumnas, activeZone]);

  const handleAddColumn = useCallback(async () => {
    const name = newColName.trim();
    if (!name) return;
    const orden = zonaColumnas.length;
    const { data: newCol } = await supabase.from('costos_crossdocking_zona_columnas').insert({ zona: activeZone, nombre: name, tipo: 'formula', orden }).select().maybeSingle();
    if (newCol) {
      setZonaColumnas(prev => [...prev, newCol as CrossdockingZonaColumnaDinamica]);
      setCeldasFormulas(prev => ({ ...prev, [newCol.id]: [] }));
    }
    setNewColName('');
    setAddingColumn(false);
  }, [newColName, activeZone, zonaColumnas]);

  const handleDeleteColumn = useCallback(async (colId: string) => {
    if (!confirm('¿Eliminar esta columna y todas sus fórmulas?')) return;
    await supabase.from('costos_crossdocking_zona_celdas').delete().eq('columna_id', colId);
    await supabase.from('costos_crossdocking_zona_columnas').delete().eq('id', colId);
    setZonaColumnas(prev => prev.filter(c => c.id !== colId));
    setCeldasFormulas(prev => { const n = { ...prev }; delete n[colId]; return n; });
    setEditingColumnFormula(null);
  }, []);

  const handleRenameColumn = useCallback(async (colId: string, nombre: string) => {
    setZonaColumnas(prev => prev.map(c => c.id === colId ? { ...c, nombre } : c));
    await supabase.from('costos_crossdocking_zona_columnas').update({ nombre }).eq('id', colId);
  }, []);

  const handleOpenColumnFormulaEditor = useCallback((col: CrossdockingZonaColumnaDinamica, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setEditingColumnFormula({ columnaId: col.id, colNombre: col.nombre, formula: col.formula ?? '', position: { top: rect.bottom + 4, left: rect.left } });
  }, []);

  const handleSaveColumnFormula = useCallback(async (formula: string) => {
    if (!editingColumnFormula) return;
    const { columnaId } = editingColumnFormula;
    setZonaColumnas(prev => prev.map(c => c.id === columnaId ? { ...c, formula: formula || undefined } : c));
    await supabase.from('costos_crossdocking_zona_columnas').update({ formula: formula || null }).eq('id', columnaId);
    setEditingColumnFormula(null);
  }, [editingColumnFormula]);

  const zoneTotalMov = activeZoneArtsAll.reduce((s, a) => s + a.movimientos, 0);
  const zoneTotalUnid = activeZoneArtsAll.reduce((s, a) => s + a.unidades, 0);

  const systemVarDefs = useMemo<VariableDef[]>(() => {
    try { const data = toAllDataSources(formulaCtx); return buildVariableDefs(data).filter(d => !d.token.startsWith('SUM_COSTOS_')); }
    catch { return []; }
  }, [formulaCtx]);

  const systemVarMap = useMemo<Record<string, number>>(() => {
    try { const data = toAllDataSources(formulaCtx); return buildVariableMap(buildVariableDefs(data), data); }
    catch { return {}; }
  }, [formulaCtx]);

  const sumAllPromMovArts = useMemo(() => { let sum = 0; for (const art of activeZoneArtsAll) sum += getArtPromedios(art.idCompania, art.articulo).promMov; return sum; }, [activeZoneArtsAll, getArtPromedios]);
  const sumAllPromUnidArts = useMemo(() => { let sum = 0; for (const art of activeZoneArtsAll) sum += getArtPromedios(art.idCompania, art.articulo).promUnid; return sum; }, [activeZoneArtsAll, getArtPromedios]);

  const buildRowVarMap = useCallback((art: ZonaArticuloCompaniaRow): Record<string, number> => {
    const proms = getArtPromedios(art.idCompania, art.articulo);
    const pctPromMov = sumAllPromMovArts > 0 ? (proms.promMov / sumAllPromMovArts) * 100 : 0;
    const pctPromUnid = sumAllPromUnidArts > 0 ? (proms.promUnid / sumAllPromUnidArts) * 100 : 0;
    const artVars: Record<string, number> = {
      'MOV': art.movimientos, 'UNID': art.unidades, 'ZONA_MOV': zoneTotalMov, 'ZONA_UNID': zoneTotalUnid,
      'PCT_MOV': zoneTotalMov > 0 ? (art.movimientos / zoneTotalMov) * 100 : 0,
      'PCT_UNID': zoneTotalUnid > 0 ? (art.unidades / zoneTotalUnid) * 100 : 0,
      'PROM_MOV_MES': proms.promMov, 'PROM_UNID_MES': proms.promUnid,
      'PCT_PROM_MOV_MES': pctPromMov, 'PCT_PROM_UNID_MES': pctPromUnid,
    };
    return { ...systemVarMap, ...artVars };
  }, [zoneTotalMov, zoneTotalUnid, systemVarMap, getArtPromedios, sumAllPromMovArts, sumAllPromUnidArts]);

  const computedCells = useMemo(() => {
    const result: Record<string, Record<string, { value: number | null; formula: string; error: boolean; isGlobal: boolean }>> = {};
    if (!zonaColumnas.length || !activeZoneArtsAll.length) return result;
    for (const col of zonaColumnas) {
      result[col.id] = {};
      const colFormula = col.formula?.trim();
      if (!colFormula) {
        for (const art of activeZoneArtsAll) result[col.id][art.articulo] = { value: null, formula: '', error: false, isGlobal: false };
        continue;
      }
      const hasRowVars = /\{(MOV|UNID|PCT_MOV|PCT_UNID|PROM_MOV_MES|PROM_UNID_MES|PCT_PROM_MOV_MES|PCT_PROM_UNID_MES)\}/i.test(colFormula);
      for (const art of activeZoneArtsAll) {
        const varMap = buildRowVarMap(art);
        const r = evalFormula(colFormula, varMap);
        result[col.id][art.articulo] = { value: r.ok ? r.value : null, formula: colFormula, error: !r.ok, isGlobal: !hasRowVars };
      }
    }
    return result;
  }, [zonaColumnas, activeZoneArtsAll, buildRowVarMap]);

  const filteredArts = useMemo(() => {
    let arts = activeZoneArtsAll.filter(a => !deferredSearch || a.articulo.toLowerCase().includes(deferredSearch.toLowerCase()) || a.descripcion.toLowerCase().includes(deferredSearch.toLowerCase()));
    if (companiaFilter !== 'all') arts = arts.filter(a => a.idCompania === companiaFilter);
    return arts;
  }, [activeZoneArtsAll, deferredSearch, companiaFilter]);

  const zoneFilteredMov = filteredArts.reduce((s, a) => s + a.movimientos, 0);
  const zoneFilteredUnid = filteredArts.reduce((s, a) => s + a.unidades, 0);

  const getSortValue = useCallback((art: ZonaArticuloCompaniaRow, colKey: string): number | string => {
    if (colKey.startsWith('FIXED:')) {
      const key = colKey.slice(6);
      switch (key) {
        case 'idCompania': return (art.idCompania || '').toLowerCase();
        case 'codigo': return art.articulo.toLowerCase();
        case 'descripcion': return (art.descripcion || '').toLowerCase();
        case 'movimientos': return art.movimientos;
        case 'pctMov': return zoneTotalMov > 0 ? (art.movimientos / zoneTotalMov) * 100 : 0;
        case 'unidades': return art.unidades;
        case 'pctUnid': return zoneTotalUnid > 0 ? (art.unidades / zoneTotalUnid) * 100 : 0;
        case 'promMovMes': return getArtPromedios(art.idCompania, art.articulo).promMov;
        case 'promUnidMes': return getArtPromedios(art.idCompania, art.articulo).promUnid;
        case 'pctPromMovMes': {
          const p = getArtPromedios(art.idCompania, art.articulo);
          return sumAllPromMovArts > 0 ? (p.promMov / sumAllPromMovArts) * 100 : 0;
        }
        case 'pctPromUnidMes': {
          const p = getArtPromedios(art.idCompania, art.articulo);
          return sumAllPromUnidArts > 0 ? (p.promUnid / sumAllPromUnidArts) * 100 : 0;
        }
        default: return 0;
      }
    } else if (colKey.startsWith('MES:')) {
      const parts = colKey.split(':');
      const mesNum = parseInt(parts[1]);
      const subType = parts[2];
      const mapKey = `${art.idCompania}|${art.articulo}`;
      const md = articuloMensualMap[mapKey]?.[mesNum];
      return subType === 'mov' ? (md?.movimientos ?? 0) : (md?.unidades ?? 0);
    } else {
      const cell = computedCells[colKey]?.[art.articulo];
      return cell?.value ?? 0;
    }
  }, [zoneTotalMov, zoneTotalUnid, getArtPromedios, sumAllPromMovArts, sumAllPromUnidArts, articuloMensualMap, computedCells]);

  const sortedArtsAll = useMemo(() => [...filteredArts].sort((a, b) => { const dir = artSortDir === 'asc' ? 1 : -1; const va = getSortValue(a, artSortKey); const vb = getSortValue(b, artSortKey); if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * dir; return ((va as number) - (vb as number)) * dir; }), [filteredArts, artSortKey, artSortDir, getSortValue]);
  const totalArtPages = Math.ceil(sortedArtsAll.length / ART_PAGE_SIZE);
  const paginatedArts = useMemo(() => { const start = artPage * ART_PAGE_SIZE; return sortedArtsAll.slice(start, start + ART_PAGE_SIZE); }, [sortedArtsAll, artPage]);

  const footerTotals = useMemo(() => {
    const result: Record<string, number> = {};
    for (const col of zonaColumnas) {
      const colFormula = col.formula?.trim();
      const hasRowVars = /\{(MOV|UNID|PCT_MOV|PCT_UNID|PROM_MOV_MES|PROM_UNID_MES|PCT_PROM_MOV_MES|PCT_PROM_UNID_MES)\}/i.test(colFormula || '');
      const isGlobal = !hasRowVars && !!colFormula;
      if (isGlobal && sortedArtsAll.length > 0) {
        result[col.id] = computedCells[col.id]?.[sortedArtsAll[0].articulo]?.value ?? 0;
      } else {
        result[col.id] = sortedArtsAll.reduce((s, art) => s + (computedCells[col.id]?.[art.articulo]?.value ?? 0), 0);
      }
    }
    return result;
  }, [zonaColumnas, sortedArtsAll, computedCells]);

  if (loading) return <div className="flex items-center justify-center py-16"><div className="flex flex-col items-center gap-3"><div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" /><p className="text-xs text-slate-400">Calculando resumen por zona...</p></div></div>;
  if (rows.length === 0) return <div className="flex items-center justify-center py-16"><p className="text-sm text-slate-400">No hay datos disponibles.</p></div>;

  const activeZoneData = rows.find(r => r.zona === activeZone);

  const toggleArtSort = (key: string) => { if (artSortKey === key) setArtSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setArtSortKey(key); setArtSortDir('desc'); } };
  const sortIcon = (key: string) => artSortKey !== key ? 'ri-expand-up-down-line text-slate-300' : artSortDir === 'asc' ? 'ri-sort-asc text-slate-700' : 'ri-sort-desc text-slate-700';

  const zonaTabColors = [
    { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', activeBg: 'bg-rose-500', activeText: 'text-white', dot: 'bg-rose-400' },
    { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', activeBg: 'bg-emerald-500', activeText: 'text-white', dot: 'bg-emerald-400' },
    { bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-700', activeBg: 'bg-sky-500', activeText: 'text-white', dot: 'bg-sky-400' },
    { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', activeBg: 'bg-amber-500', activeText: 'text-white', dot: 'bg-amber-400' },
    { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', activeBg: 'bg-violet-500', activeText: 'text-white', dot: 'bg-violet-400' },
    { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-700', activeBg: 'bg-teal-500', activeText: 'text-white', dot: 'bg-teal-400' },
    { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', activeBg: 'bg-orange-500', activeText: 'text-white', dot: 'bg-orange-400' },
  ];

  const pctGlobalMov = totalMov > 0 && activeZoneData ? (activeZoneData.movimientos / totalMov) * 100 : 0;
  const pctGlobalUnid = totalUnid > 0 && activeZoneData ? (activeZoneData.unidades / totalUnid) * 100 : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg px-4 py-3 border border-slate-200"><p className="text-xs text-slate-500 font-medium">Zonas activas</p><p className="text-lg font-bold text-slate-800 mt-0.5">{totalCount.toLocaleString('es-CO')}</p></div>
        <div className="bg-white rounded-lg px-4 py-3 border border-slate-200"><p className="text-xs text-slate-500 font-medium">Total movimientos</p><p className="text-lg font-bold text-slate-800 mt-0.5">{fmt(totalMov)}</p></div>
        <div className="bg-white rounded-lg px-4 py-3 border border-slate-200"><p className="text-xs text-slate-500 font-medium">Total unidades</p><p className="text-lg font-bold text-slate-800 mt-0.5">{fmt(totalUnid)}</p></div>
        <div className="bg-white rounded-lg px-4 py-3 border border-slate-200"><p className="text-xs text-slate-500 font-medium">Total artículos únicos</p><p className="text-lg font-bold text-slate-800 mt-0.5">{rows.reduce((s, r) => s + r.articulos_distintos, 0).toLocaleString('es-CO')}</p></div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {rows.map((row, i) => {
          const isActive = activeZone === row.zona;
          const c = zonaTabColors[i % zonaTabColors.length];
          return (
            <button key={row.zona} onClick={() => switchZone(row.zona)}
              className={`px-4 py-2.5 rounded-xl border text-sm font-medium transition-all cursor-pointer whitespace-nowrap flex items-center gap-2.5 ${isActive ? `${c.activeBg} ${c.activeText} border-transparent` : `bg-white ${c.border} ${c.text} hover:bg-slate-50`}`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-white/60' : c.dot}`} />
              <span className="font-semibold">{row.zona}</span>
              <span className={`text-xs ${isActive ? 'text-white/70' : 'text-slate-400'}`}>{fmt(row.movimientos)} mov</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{row.articulos_distintos} art.</span>
            </button>
          );
        })}
      </div>

      {activeZoneData && (
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-start gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-800"><i className="ri-map-pin-line text-lg text-white" /></div>
                <div><h4 className="text-base font-bold text-slate-800">{activeZone}</h4><p className="text-xs text-slate-400">{fmtPct(pctGlobalMov)}% del total global · {fmtPct(pctGlobalUnid)}% de unidades</p></div>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 flex-shrink-0">
              <div className="bg-emerald-50 rounded-lg px-4 py-2.5 border border-emerald-100 text-center min-w-[90px]"><p className="text-[10px] text-emerald-600 font-medium uppercase tracking-wider">Movimientos</p><p className="text-base font-bold text-emerald-700 mt-0.5">{fmt(zoneTotalMov)}</p></div>
              <div className="bg-rose-50 rounded-lg px-4 py-2.5 border border-rose-100 text-center min-w-[90px]"><p className="text-[10px] text-rose-600 font-medium uppercase tracking-wider">Unidades</p><p className="text-base font-bold text-rose-700 mt-0.5">{fmt(zoneTotalUnid)}</p></div>
              <div className="bg-sky-50 rounded-lg px-4 py-2.5 border border-sky-100 text-center min-w-[90px]"><p className="text-[10px] text-sky-600 font-medium uppercase tracking-wider">Artículos</p><p className="text-base font-bold text-sky-700 mt-0.5">{activeZoneArtsAll.length}</p></div>
              <div className="bg-amber-50 rounded-lg px-4 py-2.5 border border-amber-100 text-center min-w-[90px]"><p className="text-[10px] text-amber-600 font-medium uppercase tracking-wider">Prom. Unid/Art</p><p className="text-base font-bold text-amber-700 mt-0.5">{fmtDec(activeZoneArtsAll.length > 0 ? zoneTotalUnid / activeZoneArtsAll.length : 0)}</p></div>
              <div className="bg-teal-50 rounded-lg px-4 py-2.5 border border-teal-100 text-center min-w-[90px]"><p className="text-[10px] text-teal-600 font-medium uppercase tracking-wider">Prom. Mov/Mes</p><p className="text-base font-bold text-teal-700 mt-0.5">{fmtDec(activeZoneData?.prom_movimientos_mes ?? 0)}</p></div>
              <div className="bg-violet-50 rounded-lg px-4 py-2.5 border border-violet-100 text-center min-w-[90px]"><p className="text-[10px] text-violet-600 font-medium uppercase tracking-wider">Prom. Unid/Mes</p><p className="text-base font-bold text-violet-700 mt-0.5">{fmtDec(activeZoneData?.prom_unidades_mes ?? 0)}</p></div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><div className="w-3.5 h-3.5 flex items-center justify-center"><i className="ri-search-line text-sm text-slate-400" /></div></div>
              <input type="text" placeholder={`Buscar artículo en ${activeZone}...`} value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-100 focus:border-teal-300 outline-none bg-white text-slate-700 placeholder:text-slate-400" />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <select value={companiaFilter} onChange={e => setCompaniaFilter(e.target.value)} className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-100 focus:border-teal-300 outline-none bg-white text-slate-700 min-w-[160px]">
                <option value="all">Todas las compañías</option>
                {companiasUnicas.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ExportMenu
                filenameBase={`crossdocking-zona-${activeZone}`}
                getExportData={() => {
                  const headers = ['Id Compañía', 'Código', 'Descripción', 'Movimientos', '% Mov', 'Unidades', '% Unid', 'Prom. Mov/Mes', 'Prom. Unid/Mes', '% Prom. Mov/Mes', '% Prom. Unid/Mes', ...mesesDisponibles.flatMap(m => [`${m.nombre} Mov`, `${m.nombre} Unid`]), ...zonaColumnas.map(c => c.nombre)];
                  const exportRows = sortedArtsAll.map(art => {
                    const artPctMov = zoneFilteredMov > 0 ? (art.movimientos / zoneFilteredMov) * 100 : 0;
                    const artPctUnid = zoneFilteredUnid > 0 ? (art.unidades / zoneFilteredUnid) * 100 : 0;
                    const proms = getArtPromedios(art.idCompania, art.articulo);
                    const key = `${art.idCompania}|${art.articulo}`;
                    return [art.idCompania || '', art.articulo, art.descripcion || '', art.movimientos, artPctMov.toFixed(2), art.unidades, artPctUnid.toFixed(2), proms.promMov.toFixed(2), proms.promUnid.toFixed(2), (sumAllPromMovArts > 0 ? (proms.promMov / sumAllPromMovArts) * 100 : 0).toFixed(2), (sumAllPromUnidArts > 0 ? (proms.promUnid / sumAllPromUnidArts) * 100 : 0).toFixed(2), ...mesesDisponibles.flatMap(m => { const md = articuloMensualMap[key]?.[m.mes]; return [md ? String(md.movimientos) : '', md ? String(md.unidades) : '']; }), ...zonaColumnas.map(col => { const cell = computedCells[col.id]?.[art.articulo]; return cell?.value !== null && cell?.value !== undefined ? String(cell.value) : ''; })];
                  });
                  return { headers, rows: exportRows };
                }}
              />
            </div>
          </div>

          {(zoneSwitching || isPending) && (
            <div className="relative"><div className="absolute inset-0 z-20 bg-white/80 backdrop-blur-sm rounded-lg flex items-center justify-center" style={{ minHeight: 200 }}><div className="flex flex-col items-center gap-3"><div className="w-10 h-10 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" /><p className="text-sm font-semibold text-slate-700">Cargando <strong className="text-teal-600">{activeZone}</strong>...</p><p className="text-xs text-slate-400">Preparando datos y columnas dinámicas</p></div></div></div>
          )}

          {colLoading && !zoneSwitching && !isPending && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-teal-50 border border-teal-200 rounded-lg mb-2"><div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin flex-shrink-0" /><span className="text-sm font-medium text-teal-700">Cargando columnas de <strong>{activeZone}</strong>...</span></div>
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
                          case 'movimientos': return <SortableFixedHeader key={colKey} id={colKey} className="px-3 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200 cursor-pointer hover:bg-slate-100"><span onClick={() => toggleArtSort(colKey)}>Movimientos<div className="w-3 h-3 flex items-center justify-center inline ml-1"><i className={sortIcon(colKey)} /></div></span></SortableFixedHeader>;
                          case 'pctMov': return <SortableFixedHeader key={colKey} id={colKey} className="px-3 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200 cursor-pointer hover:bg-slate-100"><span onClick={() => toggleArtSort(colKey)}>% Mov<div className="w-3 h-3 flex items-center justify-center inline ml-1"><i className={sortIcon(colKey)} /></div></span></SortableFixedHeader>;
                          case 'unidades': return <SortableFixedHeader key={colKey} id={colKey} className="px-3 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200 cursor-pointer hover:bg-slate-100"><span onClick={() => toggleArtSort(colKey)}>Unidades<div className="w-3 h-3 flex items-center justify-center inline ml-1"><i className={sortIcon(colKey)} /></div></span></SortableFixedHeader>;
                          case 'pctUnid': return <SortableFixedHeader key={colKey} id={colKey} className="px-3 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200 cursor-pointer hover:bg-slate-100"><span onClick={() => toggleArtSort(colKey)}>% Unid<div className="w-3 h-3 flex items-center justify-center inline ml-1"><i className={sortIcon(colKey)} /></div></span></SortableFixedHeader>;
                          case 'promMovMes': return <SortableFixedHeader key={colKey} id={colKey} className="px-3 py-2.5 text-right text-slate-500 font-semibold bg-amber-50/50 border-r border-amber-100 cursor-pointer hover:bg-amber-100"><span onClick={() => toggleArtSort(colKey)}>Prom. Mov/Mes<div className="w-3 h-3 flex items-center justify-center inline ml-1"><i className={sortIcon(colKey)} /></div></span></SortableFixedHeader>;
                          case 'promUnidMes': return <SortableFixedHeader key={colKey} id={colKey} className="px-3 py-2.5 text-right text-slate-500 font-semibold bg-amber-50/50 border-r border-amber-100 cursor-pointer hover:bg-amber-100"><span onClick={() => toggleArtSort(colKey)}>Prom. Unid/Mes<div className="w-3 h-3 flex items-center justify-center inline ml-1"><i className={sortIcon(colKey)} /></div></span></SortableFixedHeader>;
                          case 'pctPromMovMes': return <SortableFixedHeader key={colKey} id={colKey} className="px-2 py-2.5 text-right text-slate-500 font-semibold bg-emerald-50/30 border-r border-emerald-100 text-[10px] cursor-pointer hover:bg-emerald-100"><span onClick={() => toggleArtSort(colKey)}>% Prom. Mov/Mes<div className="w-3 h-3 flex items-center justify-center inline ml-1"><i className={sortIcon(colKey)} /></div></span></SortableFixedHeader>;
                          case 'pctPromUnidMes': return <SortableFixedHeader key={colKey} id={colKey} className="px-2 py-2.5 text-right text-slate-500 font-semibold bg-rose-50/30 border-r border-rose-100 text-[10px] cursor-pointer hover:bg-rose-100"><span onClick={() => toggleArtSort(colKey)}>% Prom. Unid/Mes<div className="w-3 h-3 flex items-center justify-center inline ml-1"><i className={sortIcon(colKey)} /></div></span></SortableFixedHeader>;
                          default: return null;
                        }
                      } else if (colKey.startsWith('MES:')) {
                        const parts = colKey.split(':');
                        const mesNum = parseInt(parts[1]);
                        const subType = parts[2];
                        const m = mesesDisponibles.find(md => md.mes === mesNum);
                        const label = `${m?.nombre || mesNum} ${subType === 'mov' ? 'Mov' : 'Unid'}`;
                        return <SortableFixedHeader key={colKey} id={colKey} className="px-2 py-2.5 text-right text-slate-500 font-semibold bg-teal-50/30 border-r border-teal-100 text-[11px] cursor-pointer hover:bg-teal-100"><span onClick={() => toggleArtSort(colKey)}>{label}<div className="w-3 h-3 flex items-center justify-center inline ml-1"><i className={sortIcon(colKey)} /></div></span></SortableFixedHeader>;
                      } else {
                        const col = zonaColumnas.find(c => c.id === colKey);
                        if (!col) return null;
                        return <CrossdockingSortableColHeader key={col.id} col={col} onDelete={handleDeleteColumn} onEditFormula={handleOpenColumnFormulaEditor} onRename={handleRenameColumn} onSort={() => toggleArtSort(colKey)} sortIconClass={sortIcon(colKey)} />;
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
                      <div className="flex items-center justify-center px-2"><div className="w-5 h-5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" /></div>
                    ) : addingColumn ? (
                      <div className="flex items-center gap-1 px-1">
                        <input type="text" value={newColName} onChange={e => setNewColName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleAddColumn(); if (e.key === 'Escape') { setAddingColumn(false); setNewColName(''); } }} placeholder="Nombre..." className="w-[120px] px-2 py-1 text-xs border border-teal-300 rounded-md focus:outline-none focus:ring-1 focus:ring-teal-400 bg-white" autoFocus />
                        <button onClick={handleAddColumn} disabled={!newColName.trim()} className="w-6 h-6 flex items-center justify-center rounded-md bg-teal-500 hover:bg-teal-600 text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors"><i className="ri-check-line text-xs" /></button>
                        <button onClick={() => { setAddingColumn(false); setNewColName(''); }} className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 cursor-pointer"><i className="ri-close-line text-xs" /></button>
                      </div>
                    ) : (
                      <button onClick={() => setAddingColumn(true)} className="w-8 h-8 flex items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-teal-400 hover:text-teal-500 hover:bg-teal-50 cursor-pointer transition-all" title="Agregar columna de fórmula"><i className="ri-add-line text-sm" /></button>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedArts.length === 0 ? (
                  <tr><td colSpan={columnOrder.length + 1} className="px-3 py-10 text-center text-slate-400">{search ? 'Sin resultados para esta búsqueda' : 'Sin artículos en esta zona'}</td></tr>
                ) : (
                  paginatedArts.map((art, ai) => {
                    const artPctMov = zoneFilteredMov > 0 ? (art.movimientos / zoneFilteredMov) * 100 : 0;
                    const artPctUnid = zoneFilteredUnid > 0 ? (art.unidades / zoneFilteredUnid) * 100 : 0;
                    const proms = getArtPromedios(art.idCompania, art.articulo);
                    const pctPromMov = sumAllPromMovArts > 0 ? (proms.promMov / sumAllPromMovArts) * 100 : 0;
                    const pctPromUnid = sumAllPromUnidArts > 0 ? (proms.promUnid / sumAllPromUnidArts) * 100 : 0;
                    return (
                      <tr key={`${activeZone}-${art.idCompania}-${art.articulo}`} className={`border-t border-slate-100 hover:bg-teal-50/50 ${ai % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                        {columnOrder.map(colKey => {
                          if (colKey.startsWith('FIXED:')) {
                            const key = colKey.slice(6);
                            switch (key) {
                              case 'idCompania': return <td key={colKey} className="px-3 py-2 font-medium text-slate-700 border-r border-slate-100">{art.idCompania || '—'}</td>;
                              case 'codigo': return <td key={colKey} className="px-3 py-2 font-medium text-slate-700 border-r border-slate-100">{art.articulo}</td>;
                              case 'descripcion': return <td key={colKey} className="px-3 py-2 text-slate-600 border-r border-slate-100 max-w-[320px] overflow-hidden text-ellipsis" title={art.descripcion}>{art.descripcion || '—'}</td>;
                              case 'movimientos': return <td key={colKey} className="px-3 py-2 text-right text-slate-600 border-r border-slate-100 font-medium">{fmt(art.movimientos)}</td>;
                              case 'pctMov': return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><div className="flex items-center justify-end gap-2"><div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0"><div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${Math.min(artPctMov, 100)}%` }} /></div><span className="text-slate-500 w-10 text-right">{fmtPct(artPctMov)}%</span></div></td>;
                              case 'unidades': return <td key={colKey} className="px-3 py-2 text-right text-slate-600 border-r border-slate-100 font-medium">{fmt(art.unidades)}</td>;
                              case 'pctUnid': return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><div className="flex items-center justify-end gap-2"><div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0"><div className="h-full bg-rose-400 rounded-full transition-all" style={{ width: `${Math.min(artPctUnid, 100)}%` }} /></div><span className="text-slate-500 w-10 text-right">{fmtPct(artPctUnid)}%</span></div></td>;
                              case 'promMovMes': return <td key={colKey} className="px-3 py-2 border-r border-slate-100 bg-amber-50/30"><div className="flex items-center justify-end gap-2" title={`${fmtPct(pctPromMov)}% del total de Prom. Mov/Mes`}><div className="w-10 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0"><div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${Math.max(pctPromMov, 0.3)}%` }} /></div><span className="text-slate-600 font-medium w-10 text-right">{fmtDec(proms.promMov)}</span></div></td>;
                              case 'promUnidMes': return <td key={colKey} className="px-3 py-2 border-r border-slate-100 bg-amber-50/30"><div className="flex items-center justify-end gap-2" title={`${fmtPct(pctPromUnid)}% del total de Prom. Unid/Mes`}><div className="w-10 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0"><div className="h-full bg-rose-400 rounded-full transition-all" style={{ width: `${Math.max(pctPromUnid, 0.3)}%` }} /></div><span className="text-slate-700 font-semibold w-10 text-right">{fmtDec(proms.promUnid)}</span></div></td>;
                              case 'pctPromMovMes': return <td key={colKey} className="px-2 py-2 text-right border-r border-slate-100 bg-emerald-50/20"><span className="text-emerald-700 font-medium text-xs">{fmtPct(pctPromMov)}%</span></td>;
                              case 'pctPromUnidMes': return <td key={colKey} className="px-2 py-2 text-right border-r border-slate-100 bg-rose-50/20"><span className="text-rose-700 font-medium text-xs">{fmtPct(pctPromUnid)}%</span></td>;
                              default: return null;
                            }
                          } else if (colKey.startsWith('MES:')) {
                            const parts = colKey.split(':');
                            const mesNum = parseInt(parts[1]);
                            const subType = parts[2];
                            const mapKey = `${art.idCompania}|${art.articulo}`;
                            const mesData = articuloMensualMap[mapKey]?.[mesNum];
                            if (subType === 'mov') {
                              return <td key={colKey} className="px-2 py-2 text-right border-r border-slate-100 bg-teal-50/20"><span className="text-slate-600">{mesData ? fmt(mesData.movimientos) : '—'}</span></td>;
                            } else {
                              return <td key={colKey} className="px-2 py-2 text-right border-r border-slate-100 bg-teal-50/20"><span className="text-amber-700 font-medium">{mesData ? fmt(mesData.unidades) : '—'}</span></td>;
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
                                {hasFormula ? (cell?.error ? <span className="text-rose-500"><i className="ri-error-warning-line mr-1" />Error</span> : isGlobalFormula ? <span className="text-slate-300 text-[10px] italic">—</span> : cell?.value !== null && cell?.value !== undefined ? <span className="text-teal-700 font-medium tabular-nums">{new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cell.value)}</span> : <span className="text-slate-300">—</span>) : <span className="text-slate-300 text-[10px]">—</span>}
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
                const isFiltered = !!search;
                const artsForFooter = isFiltered ? filteredArts : activeZoneArtsAll;
                const count = artsForFooter.length;
                const displayMov = isFiltered ? zoneFilteredMov : zoneTotalMov;
                const displayUnid = isFiltered ? zoneFilteredUnid : zoneTotalUnid;
                let sumPromMov = 0;
                let sumPromUnid = 0;
                const mesTotals: Record<number, { mov: number; unid: number }> = {};
                mesesDisponibles.forEach(m => { mesTotals[m.mes] = { mov: 0, unid: 0 }; });
                for (const art2 of artsForFooter) {
                  const p2 = getArtPromedios(art2.idCompania, art2.articulo);
                  sumPromMov += p2.promMov;
                  sumPromUnid += p2.promUnid;
                  const k2 = `${art2.idCompania}|${art2.articulo}`;
                  for (const m2 of mesesDisponibles) {
                    const md = articuloMensualMap[k2]?.[m2.mes];
                    if (md) { mesTotals[m2.mes].mov += md.movimientos; mesTotals[m2.mes].unid += md.unidades; }
                  }
                }
                const labelText = isFiltered ? `${filteredArts.length} de ${activeZoneArtsAll.length} artículos` : `Total: ${activeZoneArtsAll.length} artículos en ${activeZone}`;
                return (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-100/80">
                    {columnOrder.map(colKey => {
                      if (colKey.startsWith('FIXED:')) {
                        const key = colKey.slice(6);
                        switch (key) {
                          case 'idCompania': return <td key={colKey} className="px-3 py-2 font-semibold text-slate-600 border-r border-slate-100">{labelText}</td>;
                          case 'codigo': return <td key={colKey} className="px-3 py-2 border-r border-slate-100" />;
                          case 'descripcion': return <td key={colKey} className="px-3 py-2 border-r border-slate-100" />;
                          case 'movimientos': return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-slate-700">{fmt(displayMov)}</span></td>;
                          case 'pctMov': return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-emerald-600">100%</span></td>;
                          case 'unidades': return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-slate-700">{fmt(displayUnid)}</span></td>;
                          case 'pctUnid': return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-rose-600">100%</span></td>;
                          case 'promMovMes': return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100 bg-amber-50/40"><span className="text-xs font-bold text-amber-700">{fmtDec(count > 0 ? sumPromMov / count : 0)}</span></td>;
                          case 'promUnidMes': return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100 bg-amber-50/40"><span className="text-xs font-bold text-amber-700">{fmtDec(count > 0 ? sumPromUnid / count : 0)}</span></td>;
                          case 'pctPromMovMes': return <td key={colKey} className="px-2 py-2 text-right border-r border-slate-100 bg-emerald-50/30"><span className="text-xs font-bold text-emerald-700">{fmtPct(sumAllPromMovArts > 0 ? (sumPromMov / sumAllPromMovArts) * 100 : 0)}%</span></td>;
                          case 'pctPromUnidMes': return <td key={colKey} className="px-2 py-2 text-right border-r border-slate-100 bg-rose-50/30"><span className="text-xs font-bold text-rose-700">{fmtPct(sumAllPromUnidArts > 0 ? (sumPromUnid / sumAllPromUnidArts) * 100 : 0)}%</span></td>;
                          default: return <td key={colKey} className="px-2 py-2 border-r border-slate-100" />;
                        }
                      } else if (colKey.startsWith('MES:')) {
                        const parts = colKey.split(':');
                        const mesNum = parseInt(parts[1]);
                        const subType = parts[2];
                        const mt = mesTotals[mesNum];
                        if (subType === 'mov') {
                          return <td key={colKey} className="px-2 py-2 text-right border-r border-slate-100 bg-teal-50/30"><span className="text-xs font-bold text-slate-700">{mt ? fmt(mt.mov) : '—'}</span></td>;
                        } else {
                          return <td key={colKey} className="px-2 py-2 text-right border-r border-slate-100 bg-teal-50/30"><span className="text-xs font-bold text-amber-700">{mt ? fmt(mt.unid) : '—'}</span></td>;
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

          {totalArtPages > 1 && (
            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-xs text-slate-400">Mostrando {artPage * ART_PAGE_SIZE + 1}–{Math.min((artPage + 1) * ART_PAGE_SIZE, sortedArtsAll.length)} de {sortedArtsAll.length} artículos</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setArtPage(p => Math.max(0, p - 1))} disabled={artPage === 0} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap flex items-center gap-1"><i className="ri-arrow-left-s-line" /> Anterior</button>
                {Array.from({ length: Math.min(totalArtPages, 7) }, (_, i) => {
                  let pageNum: number;
                  if (totalArtPages <= 7) pageNum = i;
                  else if (artPage <= 2) pageNum = i;
                  else if (artPage >= totalArtPages - 3) pageNum = totalArtPages - 7 + i;
                  else pageNum = artPage - 3 + i;
                  if (pageNum < 0 || pageNum >= totalArtPages) return null;
                  return <button key={pageNum} onClick={() => setArtPage(pageNum)} className={`w-8 h-8 text-xs rounded-lg transition-colors cursor-pointer font-medium whitespace-nowrap ${pageNum === artPage ? 'bg-slate-800 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{pageNum + 1}</button>;
                })}
                <button onClick={() => setArtPage(p => Math.min(totalArtPages - 1, p + 1))} disabled={artPage >= totalArtPages - 1} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap flex items-center gap-1">Siguiente <i className="ri-arrow-right-s-line" /></button>
              </div>
            </div>
          )}

          {editingColumnFormula && (() => {
            const sampleArt = activeZoneArtsAll[0];
            const varMap = sampleArt ? buildRowVarMap(sampleArt) : {};
            return (
              <CrossdockingZonaCeldaFormulaEditor
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

// ── Sortable Fixed Column Header (drag handle only) ──────────────────────

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

// ── Sortable Dynamic Column Header ─────────────────────────────────────────

function CrossdockingSortableColHeader({ col, onDelete, onEditFormula, onRename, onSort, sortIconClass }: { col: CrossdockingZonaColumnaDinamica; onDelete: (id: string) => void; onEditFormula: (col: CrossdockingZonaColumnaDinamica, e: React.MouseEvent) => void; onRename: (id: string, nombre: string) => void; onSort: () => void; sortIconClass: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.id });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(col.nombre);
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 20 : undefined, position: 'relative' as const };
  const hasFormula = !!col.formula?.trim();
  const handleSave = () => { const trimmed = name.trim(); if (trimmed && trimmed !== col.nombre) onRename(col.id, trimmed); else setName(col.nombre); setEditing(false); };

  return (
    <th ref={setNodeRef} style={style} className={`px-2 py-2.5 border-r font-semibold ${hasFormula ? 'bg-teal-100/60 border-teal-200' : 'bg-teal-50/50 border-teal-100'}`}>
      <div className="flex items-center gap-1.5">
        <button {...attributes} {...listeners} className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 cursor-grab active:cursor-grabbing flex-shrink-0" title="Arrastrar para reordenar"><i className="ri-draggable text-xs" /></button>
        <div className="flex items-center gap-1 min-w-0 flex-1">
          {editing ? (
            <input type="text" value={name} onChange={e => setName(e.target.value)} onBlur={handleSave} onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setName(col.nombre); setEditing(false); } }} className="text-xs text-teal-700 bg-white border border-teal-300 rounded px-1.5 py-0.5 w-full min-w-[80px] focus:outline-none focus:ring-1 focus:ring-teal-400" autoFocus />
          ) : (
            <div className="flex items-center gap-0.5 min-w-0 group/name">
              <span onClick={onSort} className="text-xs text-teal-700 whitespace-nowrap max-w-[120px] overflow-hidden text-ellipsis cursor-pointer hover:underline">{col.nombre}</span>
              <div className="w-3 h-3 flex items-center justify-center flex-shrink-0 cursor-pointer" onClick={onSort}><i className={sortIconClass} /></div>
              <button onClick={() => { setName(col.nombre); setEditing(true); }} className="w-4 h-4 flex items-center justify-center rounded text-slate-300 hover:text-teal-500 hover:bg-teal-100 cursor-pointer flex-shrink-0 opacity-0 group-hover/name:opacity-100 transition-opacity" title="Renombrar columna"><i className="ri-pencil-line text-[10px]" /></button>
            </div>
          )}
          {hasFormula && <span className="text-[10px] px-1 py-0.5 rounded bg-teal-200 text-teal-700 font-mono font-bold flex-shrink-0">fx</span>}
        </div>
        <button onClick={(e) => onEditFormula(col, e)} className={`w-5 h-5 flex items-center justify-center rounded cursor-pointer flex-shrink-0 transition-colors ${hasFormula ? 'text-teal-600 hover:text-teal-800 hover:bg-teal-200' : 'text-slate-400 hover:text-teal-500 hover:bg-teal-100'}`} title={hasFormula ? 'Editar fórmula de columna' : 'Agregar fórmula a columna'}><i className={`${hasFormula ? 'ri-pencil-line' : 'ri-functions'} text-xs`} /></button>
        <button onClick={() => onDelete(col.id)} className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 cursor-pointer flex-shrink-0" title="Eliminar columna"><i className="ri-close-line text-xs" /></button>
      </div>
    </th>
  );
}