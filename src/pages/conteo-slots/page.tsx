import React, { useState, useEffect, useCallback, useMemo, useTransition, useDeferredValue, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import AppLayout from '@/components/feature/AppLayout';
import { downloadExcelMultiSheet } from '@/lib/csvExport';
import { fetchBaseQueryData } from '@/lib/formulaBaseCache';
import type { FormulaContext } from '@/lib/formulaEngine';
import { EMPTY_FORMULA_CTX, toAllDataSources, calcularFormula } from '@/lib/formulaEngine';
import type { InversionRecord } from '@/types/inversion';
import { evalFormula } from '@/lib/mathEvaluator';
import { buildVariableDefs, buildVariableMap, type VariableDef } from '@/lib/formulaVariables';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useZonaClusters } from '@/hooks/useZonaClusters';
import ZonaClusterManager, { clusterActiveBg } from '@/components/feature/ZonaClusterManager';
import ZonaCeldaFormulaEditor from './components/ZonaCeldaFormulaEditor';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ZonaResumen {
  zona: string;
  total_slots: number;
  libres: number;
  bloqueados: number;
  reservados: number;
  otros: number;
}

interface SlotsZonaTipoRow {
  tipo_ubicacion: string;
  dimension: string;
  total: number;
  libres: number;
  bloqueados: number;
  reservados: number;
  otros: number;
}

interface SlotsZonaColumna {
  id: string;
  zona: string;
  nombre: string;
  tipo: string;
  orden: number;
  formula?: string;
}

interface MasivoInfo { totalRegistros: number; headers: string[] }
type Tab = 'resumen' | 'zonas' | 'datos';
type ActiveSelection = { type: 'zone'; zona: string } | { type: 'cluster'; cluster: { id: string; nombre: string; zonas: string[]; color: string; orden: number } };

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt    = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);
const fmtDec = (n: number) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtPct = (n: number) => n.toFixed(2);

// ── Slot formula tokens ───────────────────────────────────────────────────────
const SLOT_TOKENS = [
  { token: '{TOTAL}',       label: 'Total slots',         desc: 'Total slots de este Tipo/Dimensión en la zona' },
  { token: '{LIBRES}',      label: 'Libres',              desc: 'Slots con Estado libre' },
  { token: '{BLOQUEADOS}',  label: 'Bloqueados',          desc: 'Slots con Estado bloqueado' },
  { token: '{RESERVADOS}',  label: 'Reservados',          desc: 'Slots con Estado reservado' },
  { token: '{OTROS}',       label: 'Otros estados',       desc: 'Slots con otro Estado' },
  { token: '{ZONA_TOTAL}',  label: 'Total Zona',          desc: 'Total de slots en toda la zona' },
  { token: '{PCT_ZONA}',    label: '% de Zona',           desc: 'Porcentaje de este Tipo/Dimensión sobre el total de la zona' },
  { token: '{PCT_LIBRES}',  label: '% Libres',            desc: 'Porcentaje de slots libres sobre el total del tipo' },
];

// ── Raw Table ─────────────────────────────────────────────────────────────────
function RawTable({ headers }: { headers: string[] }) {
  const PAGE = 50;
  const [rows, setRows]           = useState<Array<{ id: string; raw_data: Record<string, unknown> }>>([]);
  const [page, setPage]           = useState(0);
  const [count, setCount]         = useState(0);
  const [loading, setLoading]     = useState(false);
  const [colHeaders, setColHeaders] = useState<string[]>([]);
  const [filterCol, setFilterCol]   = useState('');
  const [filterInput, setFilterInput] = useState('');
  const [activeCol, setActiveCol]   = useState('');
  const [activeTerm, setActiveTerm] = useState('');
  const initRef = useRef(false);

  const load = useCallback(async (p: number, col: string, term: string) => {
    setLoading(true);
    let q = supabase.from('conteo_slots_raw').select('id, raw_data', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(p * PAGE, (p + 1) * PAGE - 1);
    if (col && term) q = (q as any).contains('raw_data', { [col]: term });
    const { data, count: c } = await q;
    if (data) {
      setRows(data as any); setCount(c ?? 0);
      if ((data as any[]).length && !initRef.current) {
        initRef.current = true;
        const hdrs = Object.keys((data as any[])[0].raw_data ?? {});
        setColHeaders(hdrs);
        setFilterCol(fc => fc || hdrs[0] || '');
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    initRef.current = false;
    setColHeaders([]); setFilterInput(''); setFilterCol(''); setActiveCol(''); setActiveTerm(''); setPage(0);
    load(0, '', '');
  }, [load]);
  useEffect(() => { load(page, activeCol, activeTerm); }, [load, page, activeCol, activeTerm]);

  const applySearch = () => { setPage(0); setActiveCol(filterCol); setActiveTerm(filterInput); };
  const clearSearch = () => { setFilterInput(''); setPage(0); setActiveCol(''); setActiveTerm(''); };

  const totalPages = Math.ceil(count / PAGE);
  const dh = headers.length > 0 ? headers : (rows[0]?.raw_data ? Object.keys(rows[0].raw_data) : []);
  const isFiltered = !!(activeCol && activeTerm);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <select value={filterCol} onChange={e => setFilterCol(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 bg-white max-w-[200px]">
          {colHeaders.length ? colHeaders.map(h=><option key={h} value={h}>{h}</option>) : <option value="">— columna —</option>}
        </select>
        <input type="text" value={filterInput} onChange={e => setFilterInput(e.target.value)}
          onKeyDown={e => e.key==='Enter' && applySearch()}
          placeholder="Buscar..." className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 flex-1 min-w-[120px]"/>
        <button onClick={applySearch} className="px-3 py-1.5 text-xs bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 cursor-pointer whitespace-nowrap">
          <i className="ri-search-line mr-1"/>Buscar
        </button>
        {isFiltered && <button onClick={clearSearch} className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer" title="Limpiar filtro">
          <i className="ri-close-line"/>
        </button>}
      </div>
      <span className="text-xs text-slate-400">
        {isFiltered ? `${fmt(count)} resultado(s) · "${activeTerm}" en ${activeCol}` : `${fmt(count)} slots`} · Pág. {page + 1}/{Math.max(totalPages,1)}
      </span>
      <div className="border border-slate-200 rounded-lg overflow-auto max-h-[55vh]">
        <table className="text-xs whitespace-nowrap w-full">
          <thead><tr className="bg-slate-50 sticky top-0 z-10">
            <th className="px-3 py-2 text-left text-slate-500 border-r border-slate-200">#</th>
            {dh.map(h => <th key={h} className="px-3 py-2 text-left text-slate-500 border-r border-slate-200 max-w-[160px] overflow-hidden text-ellipsis">{h}</th>)}
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={dh.length+1} className="px-3 py-8 text-center text-slate-400"><div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"/>Cargando...</td></tr>
            : rows.map((r,i) => <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-3 py-1.5 text-slate-400 border-r border-slate-100 text-center">{page*PAGE+i+1}</td>
              {dh.map(h => { const v = r.raw_data?.[h]; return <td key={h} className="px-3 py-1.5 text-slate-600 border-r border-slate-100 max-w-[160px] overflow-hidden text-ellipsis">{v!=null?String(v):'—'}</td>; })}
            </tr>)}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && <div className="flex items-center justify-between gap-3">
        <button onClick={() => setPage(p => Math.max(0,p-1))} disabled={page===0} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 cursor-pointer"><i className="ri-arrow-left-line mr-1"/>Anterior</button>
        <span className="text-xs text-slate-400">{page+1}/{totalPages}</span>
        <button onClick={() => setPage(p => Math.min(totalPages-1,p+1))} disabled={page>=totalPages-1} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 cursor-pointer">Siguiente<i className="ri-arrow-right-line ml-1"/></button>
      </div>}
    </div>
  );
}

// ── Sortable Fixed Header ─────────────────────────────────────────────────────
function SortableFixedHeader({ id, className, children }: { id:string; className?:string; children:React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5:1, zIndex: isDragging ? 20:undefined, position:'relative' };
  return <th ref={setNodeRef} style={style} className={className}><div className="flex items-center gap-1.5"><button {...attributes} {...listeners} className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 cursor-grab active:cursor-grabbing flex-shrink-0"><i className="ri-draggable text-xs"/></button><div className="min-w-0 flex-1">{children}</div></div></th>;
}

// ── Sortable Dynamic Column Header ────────────────────────────────────────────
function SortableColHeader({ col, onDelete, onEditFormula, onRename, onSort, sortIconClass }: { col:SlotsZonaColumna; onDelete:(id:string)=>void; onEditFormula:(col:SlotsZonaColumna,e:React.MouseEvent)=>void; onRename:(id:string,nombre:string)=>void; onSort:()=>void; sortIconClass:string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.id });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(col.nombre);
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5:1, zIndex: isDragging ? 20:undefined, position:'relative' };
  const hasFormula = !!col.formula?.trim();
  const handleSave = () => { const t=name.trim(); if(t&&t!==col.nombre) onRename(col.id,t); else setName(col.nombre); setEditing(false); };
  return (
    <th ref={setNodeRef} style={style} className={`px-2 py-2.5 border-r font-semibold ${hasFormula?'bg-cyan-100/60 border-cyan-200':'bg-cyan-50/50 border-cyan-100'}`}>
      <div className="flex items-center gap-1.5">
        <button {...attributes} {...listeners} className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 cursor-grab active:cursor-grabbing flex-shrink-0"><i className="ri-draggable text-xs"/></button>
        <div className="flex items-center gap-1 min-w-0 flex-1">
          {editing ? <input type="text" value={name} onChange={e=>setName(e.target.value)} onBlur={handleSave} onKeyDown={e=>{if(e.key==='Enter')handleSave();if(e.key==='Escape'){setName(col.nombre);setEditing(false);}}} className="text-xs text-cyan-700 bg-white border border-cyan-300 rounded px-1.5 py-0.5 w-full min-w-[80px] focus:outline-none" autoFocus/>
          : <div className="flex items-center gap-0.5 min-w-0 group/name">
              <span onClick={onSort} className="text-xs text-cyan-700 whitespace-nowrap max-w-[120px] overflow-hidden text-ellipsis cursor-pointer hover:underline">{col.nombre}</span>
              <div className="w-3 h-3 flex items-center justify-center flex-shrink-0 cursor-pointer" onClick={onSort}><i className={sortIconClass}/></div>
              <button onClick={()=>{setName(col.nombre);setEditing(true);}} className="w-4 h-4 flex items-center justify-center rounded text-slate-300 hover:text-cyan-500 cursor-pointer flex-shrink-0 opacity-0 group-hover/name:opacity-100"><i className="ri-pencil-line text-[10px]"/></button>
            </div>}
          {hasFormula && <span className="text-[10px] px-1 py-0.5 rounded bg-cyan-200 text-cyan-700 font-mono font-bold flex-shrink-0">fx</span>}
        </div>
        <button onClick={e=>onEditFormula(col,e)} className={`w-5 h-5 flex items-center justify-center rounded cursor-pointer flex-shrink-0 ${hasFormula?'text-cyan-600 hover:text-cyan-800 hover:bg-cyan-200':'text-slate-400 hover:text-cyan-500 hover:bg-cyan-100'}`}><i className={`${hasFormula?'ri-pencil-line':'ri-functions'} text-xs`}/></button>
        <button onClick={()=>onDelete(col.id)} className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 cursor-pointer flex-shrink-0"><i className="ri-close-line text-xs"/></button>
      </div>
    </th>
  );
}

// ── Zone Detail Table ─────────────────────────────────────────────────────────
function ZonaDetailTable({
  zonas, zona_label, zoneTotals, formulaCtx, clusters, onClustersChange, allZonaNames
}: {
  zonas: string[];
  zona_label: string;
  zoneTotals: ZonaResumen[];
  formulaCtx: FormulaContext;
  clusters: { id:string; nombre:string; zonas:string[]; color:string; orden:number }[];
  onClustersChange: () => void;
  allZonaNames: string[];
}) {
  const [rows, setRows] = useState<SlotsZonaTipoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [artPage, setArtPage] = useState(0);
  const [artSortKey, setArtSortKey] = useState('FIXED:total');
  const [artSortDir, setArtSortDir] = useState<'asc'|'desc'>('desc');
  const [, startTransition] = useTransition();
  const deferredSearch = useDeferredValue(search);
  const ART_PAGE_SIZE = 100;

  const [zonaColumnas, setZonaColumnas] = useState<SlotsZonaColumna[]>([]);
  const [celdasFormulas, setCeldasFormulas] = useState<Record<string, any[]>>({});
  const [colLoading, setColLoading] = useState(false);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [colOrder, setColOrder] = useState<string[]>([]);
  const [editingColumnFormula, setEditingColumnFormula] = useState<{
    columnaId: string; colNombre: string; formula: string;
    position: { top: number; left: number };
    columnTokens: { token: string; label: string; value?: number }[];
    enrichedVarMap: Record<string, number>;
  } | null>(null);
  const [showClusterMgr, setShowClusterMgr] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const zoneTotalSlots = useMemo(() => zonas.reduce((s, z) => {
    const zr = zoneTotals.find(r => r.zona === z);
    return s + (zr?.total_slots ?? 0);
  }, 0), [zonas, zoneTotals]);

  // Load rows
  const loadRows = useCallback(async () => {
    if (!zonas.length) return;
    setLoading(true);
    // JSON-returning RPCs bypass PostgREST max_rows — get all combinations at once
    const rpcName = zonas.length > 1 ? 'fn_slots_zonas_tipo_resumen_all' : 'fn_slots_zona_tipo_resumen_all';
    const params = zonas.length > 1 ? { p_zonas: zonas } : { p_zona: zonas[0] };
    const { data: json } = await supabase.rpc(rpcName, params);
    const data = Array.isArray(json) ? json : [];
    setRows((data as any[]).map((r: any) => ({
      tipo_ubicacion: String(r.tipo_ubicacion ?? ''),
      dimension: String(r.dimension ?? ''),
      total: Number(r.total) || 0,
      libres: Number(r.libres) || 0,
      bloqueados: Number(r.bloqueados) || 0,
      reservados: Number(r.reservados) || 0,
      otros: Number(r.otros) || 0,
    })));
    setLoading(false);
  }, [zonas.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadRows(); }, [loadRows]);

  // Auto-select zone key for columns
  const colZoneKey = zonas.length === 1 ? zonas[0] : `_cluster_${zonas.sort().join('_')}`;

  const loadZonaColumnas = useCallback(async (key: string) => {
    setColLoading(true); setColOrder([]);
    const { data: cols } = await supabase.from('costos_slots_zona_columnas').select('*').eq('zona', key).order('orden');
    const colArray = (cols ?? []) as SlotsZonaColumna[];
    setZonaColumnas(colArray);
    if (colArray.length > 0) {
      const { data: cells } = await supabase.from('costos_slots_zona_celdas').select('*').in('columna_id', colArray.map(c => c.id));
      const byCol: Record<string, any[]> = {};
      for (const cell of (cells ?? [])) {
        if (!byCol[cell.columna_id]) byCol[cell.columna_id] = [];
        byCol[cell.columna_id].push(cell);
      }
      setCeldasFormulas(byCol);
    } else { setCeldasFormulas({}); }
    setColLoading(false);
  }, []);

  useEffect(() => { if (colZoneKey) loadZonaColumnas(colZoneKey); }, [colZoneKey, loadZonaColumnas]);

  // System variable map
  const systemVarDefs = useMemo((): VariableDef[] => {
    try { return buildVariableDefs(toAllDataSources(formulaCtx)); } catch { return []; }
  }, [formulaCtx]);
  const systemVarMap = useMemo((): Record<string, number> => {
    if (systemVarDefs.length === 0) return {};
    try { return buildVariableMap(systemVarDefs, toAllDataSources(formulaCtx)); } catch { return {}; }
  }, [formulaCtx, systemVarDefs]);

  const colNameToToken = useCallback((n: string) => n.replace(/[^a-zA-Z0-9]/g,'_').toUpperCase(), []);

  const buildRowVarMap = useCallback((row: SlotsZonaTipoRow) => ({
    TOTAL: row.total,
    LIBRES: row.libres,
    BLOQUEADOS: row.bloqueados,
    RESERVADOS: row.reservados,
    OTROS: row.otros,
    ZONA_TOTAL: zoneTotalSlots,
    PCT_ZONA:      zoneTotalSlots > 0 ? (row.total / zoneTotalSlots) * 100 : 0,
    PCT_LIBRES:    row.total > 0 ? (row.libres / row.total) * 100 : 0,
    PCT_BLOQUEADOS: row.total > 0 ? (row.bloqueados / row.total) * 100 : 0,
    ...systemVarMap,
  }), [zoneTotalSlots, systemVarMap]);

  // computedCells — process in order with accumulation
  const computedCells = useMemo(() => {
    const result: Record<string, Record<string, { value: number | null; formula: string | null; error: boolean; isGlobal: boolean }>> = {};
    const rowKey = (r: SlotsZonaTipoRow) => `${r.tipo_ubicacion}|${r.dimension}`;
    const accum: Record<string, Record<string, number>> = {};
    for (const r of rows) accum[rowKey(r)] = {};

    for (const col of zonaColumnas) {
      result[col.id] = {};
      const colToken = colNameToToken(col.nombre);
      const colFormula = col.formula?.trim();
      if (!colFormula) {
        for (const r of rows) { accum[rowKey(r)][colToken] = 0; result[col.id][rowKey(r)] = { value: null, formula: null, error: false, isGlobal: false }; }
        continue;
      }
      const hasRowVars = /\{(TOTAL|LIBRES|BLOQUEADOS|RESERVADOS|OTROS|ZONA_TOTAL|PCT_ZONA|PCT_LIBRES|PCT_BLOQUEADOS)\}/i.test(colFormula);
      if (!hasRowVars) {
        const r2 = evalFormula(colFormula, { ...systemVarMap });
        const val = r2.ok ? r2.value : null;
        for (const r of rows) { accum[rowKey(r)][colToken] = val ?? 0; result[col.id][rowKey(r)] = { value: val, formula: colFormula, error: !r2.ok, isGlobal: true }; }
      } else {
        for (const r of rows) {
          const k = rowKey(r);
          const cells = celdasFormulas[col.id] ?? [];
          const cellFormula = cells.find(c => c.tipo_ubicacion === r.tipo_ubicacion && (!c.dimension || c.dimension === r.dimension))?.formula ?? colFormula;
          const varMap = { ...buildRowVarMap(r), ...accum[k] };
          const ev = evalFormula(cellFormula, varMap);
          const val = ev.ok ? ev.value : null;
          accum[k][colToken] = val ?? 0;
          result[col.id][k] = { value: val, formula: cellFormula, error: !ev.ok, isGlobal: false };
        }
      }
    }
    return result;
  }, [zonaColumnas, celdasFormulas, rows, buildRowVarMap, systemVarMap, colNameToToken]);

  // columnOrder
  const columnOrder = useMemo(() => {
    const derived = [
      'FIXED:tipo', 'FIXED:dimension', 'FIXED:total', 'FIXED:pctZona',
      'FIXED:libres', 'FIXED:pctLibres', 'FIXED:bloqueados', 'FIXED:reservados', 'FIXED:otros',
      ...zonaColumnas.map(c => c.id),
    ];
    const s = new Set(derived);
    if (colOrder.length === derived.length && colOrder.every(k => s.has(k))) return colOrder;
    return derived;
  }, [colOrder, zonaColumnas]);

  const footerTotals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const col of zonaColumnas) {
      const rowKey = (r: SlotsZonaTipoRow) => `${r.tipo_ubicacion}|${r.dimension}`;
      t[col.id] = rows.reduce((s, r) => { const c = computedCells[col.id]?.[rowKey(r)]; return s + (!c?.isGlobal && c?.value != null ? c.value : 0); }, 0);
    }
    return t;
  }, [zonaColumnas, computedCells, rows]);

  const filteredRows = useMemo(() => {
    if (!deferredSearch) return rows;
    const q = deferredSearch.toLowerCase();
    return rows.filter(r => r.tipo_ubicacion.toLowerCase().includes(q) || r.dimension.toLowerCase().includes(q));
  }, [rows, deferredSearch]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const dir = artSortDir === 'asc' ? 1 : -1;
      if (artSortKey === 'FIXED:tipo')     return a.tipo_ubicacion.localeCompare(b.tipo_ubicacion) * dir;
      if (artSortKey === 'FIXED:dimension') return a.dimension.localeCompare(b.dimension) * dir;
      if (artSortKey === 'FIXED:total')     return (a.total - b.total) * dir;
      if (artSortKey === 'FIXED:pctZona')   return ((a.total/Math.max(zoneTotalSlots,1)) - (b.total/Math.max(zoneTotalSlots,1))) * dir;
      if (artSortKey === 'FIXED:libres')    return (a.libres - b.libres) * dir;
      if (artSortKey === 'FIXED:pctLibres') return ((a.libres/Math.max(a.total,1)) - (b.libres/Math.max(b.total,1))) * dir;
      if (artSortKey === 'FIXED:bloqueados') return (a.bloqueados - b.bloqueados) * dir;
      if (artSortKey === 'FIXED:reservados') return (a.reservados - b.reservados) * dir;
      if (artSortKey === 'FIXED:otros')     return (a.otros - b.otros) * dir;
      const rowKey = (r: SlotsZonaTipoRow) => `${r.tipo_ubicacion}|${r.dimension}`;
      return ((computedCells[artSortKey]?.[rowKey(a)]?.value ?? 0) - (computedCells[artSortKey]?.[rowKey(b)]?.value ?? 0)) * dir;
    });
  }, [filteredRows, artSortKey, artSortDir, zoneTotalSlots, computedCells]);

  const toggleSort = (key: string) => { if (artSortKey === key) setArtSortDir(d => d==='asc'?'desc':'asc'); else { setArtSortKey(key); setArtSortDir('desc'); } setArtPage(0); };
  const sortIcon = (key: string) => artSortKey !== key ? 'ri-expand-up-down-line text-slate-300' : artSortDir==='asc' ? 'ri-sort-asc text-slate-700' : 'ri-sort-desc text-slate-700';

  const totalArtPages = Math.ceil(sortedRows.length / ART_PAGE_SIZE);
  const paginatedRows = sortedRows.slice(artPage * ART_PAGE_SIZE, (artPage + 1) * ART_PAGE_SIZE);

  const handleAddColumn = useCallback(async () => {
    if (!newColName.trim()) return;
    const { data: newCol, error } = await supabase.from('costos_slots_zona_columnas').insert({ zona: colZoneKey, nombre: newColName.trim(), tipo: 'formula', orden: zonaColumnas.length }).select().maybeSingle();
    if (error) { alert(`Error: ${error.message}`); return; }
    if (newCol) setZonaColumnas(prev => [...prev, newCol as SlotsZonaColumna]);
    setNewColName(''); setAddingColumn(false);
  }, [newColName, colZoneKey, zonaColumnas]);

  const handleDeleteColumn = useCallback(async (id: string) => {
    if (!confirm('¿Eliminar esta columna?')) return;
    await supabase.from('costos_slots_zona_columnas').delete().eq('id', id);
    setZonaColumnas(prev => prev.filter(c => c.id !== id));
  }, []);

  const handleRenameColumn = useCallback(async (id: string, nombre: string) => {
    await supabase.from('costos_slots_zona_columnas').update({ nombre }).eq('id', id);
    setZonaColumnas(prev => prev.map(c => c.id===id ? {...c,nombre} : c));
  }, []);

  const handleOpenColumnFormulaEditor = useCallback((col: SlotsZonaColumna, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const colIdx = zonaColumnas.findIndex(c => c.id === col.id);
    const prevCols = colIdx > 0 ? zonaColumnas.slice(0, colIdx) : [];
    const sampleRow = rows[0];
    const prevColValues: Record<string, number> = {};
    prevCols.forEach(pc => { if (sampleRow) { const k = `${sampleRow.tipo_ubicacion}|${sampleRow.dimension}`; const v = computedCells[pc.id]?.[k]?.value; if (v != null) prevColValues[colNameToToken(pc.nombre)] = v; } });
    const enrichedVarMap = sampleRow ? { ...buildRowVarMap(sampleRow), ...prevColValues } : { ...systemVarMap, ...prevColValues };
    const columnTokens = prevCols.map(pc => ({ token: colNameToToken(pc.nombre), label: pc.nombre, value: sampleRow ? (computedCells[pc.id]?.[`${sampleRow.tipo_ubicacion}|${sampleRow.dimension}`]?.value ?? undefined) : undefined }));
    setEditingColumnFormula({ columnaId: col.id, colNombre: col.nombre, formula: col.formula ?? '', position: { top: rect.bottom + 4, left: rect.left }, columnTokens, enrichedVarMap });
  }, [zonaColumnas, rows, computedCells, colNameToToken, buildRowVarMap, systemVarMap]);

  const handleSaveColumnFormula = useCallback(async (formula: string) => {
    if (!editingColumnFormula) return;
    const { columnaId } = editingColumnFormula;
    await supabase.from('costos_slots_zona_columnas').update({ formula: formula || null }).eq('id', columnaId);
    await loadZonaColumnas(colZoneKey);
    setEditingColumnFormula(null);
  }, [editingColumnFormula, colZoneKey, loadZonaColumnas]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const cur = columnOrder;
    const oi = cur.indexOf(String(active.id));
    const ni = cur.indexOf(String(over.id));
    if (oi === -1 || ni === -1) return;
    const next = [...cur]; next.splice(oi,1); next.splice(ni,0,String(active.id));
    setColOrder(next);
  }, [columnOrder]);

  const handleExport = useCallback(() => {
    const fmtN = (n: number|null|undefined) => n != null ? Math.round(n * 10000) / 10000 : 0;
    const rk = (r: SlotsZonaTipoRow) => `${r.tipo_ubicacion}|${r.dimension}`;
    const fixedH = ['Tipo Ubicación','Dimensión','Total','% Zona','Libres','% Libres','Bloqueados','Reservados','Otros'];
    const colH = zonaColumnas.map(c => c.nombre);
    const headers1 = [...fixedH, ...colH];
    const rows1 = sortedRows.map(r => {
      const pctZ = zoneTotalSlots > 0 ? fmtN((r.total / zoneTotalSlots) * 100) : 0;
      const pctL = r.total > 0 ? fmtN((r.libres / r.total) * 100) : 0;
      return [
        r.tipo_ubicacion, r.dimension, r.total, pctZ, r.libres, pctL,
        r.bloqueados, r.reservados, r.otros,
        ...zonaColumnas.map(c => fmtN(computedCells[c.id]?.[rk(r)]?.value)),
      ];
    });
    const headers2 = ['Columna','Fórmula','Ejemplo (primera fila)'];
    const sKey = rows[0] ? rk(rows[0]) : '';
    const rows2 = zonaColumnas.map(c => [
      c.nombre,
      c.formula ?? '(sin fórmula)',
      fmtN(computedCells[c.id]?.[sKey]?.value),
    ]);
    downloadExcelMultiSheet(`costos_slots_${zona_label.replace(/[^a-zA-Z0-9]/g,'_').slice(0,40)}.xlsx`, [
      { name: 'Datos', headers: headers1, rows: rows1 },
      ...(rows2.length > 0 ? [{ name: 'Fórmulas', headers: headers2, rows: rows2 }] : []),
    ]);
  }, [sortedRows, zonaColumnas, computedCells, zoneTotalSlots, zona_label, rows]);

  if (loading) return <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"/></div>;
  if (!rows.length && !loading) return <div className="flex items-center justify-center py-16"><p className="text-sm text-slate-400">Sin datos para {zona_label}</p></div>;

  const COLORS = ['bg-cyan-500','bg-indigo-500','bg-teal-500','bg-sky-500','bg-violet-500','bg-amber-500','bg-emerald-500','bg-rose-500'];
  const totLibres = rows.reduce((s,r)=>s+r.libres,0);
  const totBloq   = rows.reduce((s,r)=>s+r.bloqueados,0);

  return (
    <div className="space-y-3">
      {/* Zone stats bar */}
      <div className="grid grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-cyan-50 border border-cyan-100 rounded-lg px-3 py-2.5"><p className="text-xs text-cyan-600 font-medium">{zona_label}</p><p className="text-base font-bold text-cyan-700">{fmt(zoneTotalSlots)}</p></div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2.5"><p className="text-xs text-emerald-600">Libres</p><p className="text-base font-bold text-emerald-700">{fmt(totLibres)} <span className="text-xs font-normal opacity-70">({fmtPct(zoneTotalSlots>0?(totLibres/zoneTotalSlots)*100:0)}%)</span></p></div>
        <div className="bg-rose-50 border border-rose-100 rounded-lg px-3 py-2.5"><p className="text-xs text-rose-600">Bloqueados</p><p className="text-base font-bold text-rose-700">{fmt(totBloq)} <span className="text-xs font-normal opacity-70">({fmtPct(zoneTotalSlots>0?(totBloq/zoneTotalSlots)*100:0)}%)</span></p></div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5"><p className="text-xs text-slate-500">Tipos únicos</p><p className="text-base font-bold text-slate-700">{new Set(rows.map(r=>r.tipo_ubicacion)).size}</p></div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5"><p className="text-xs text-slate-500">Combinaciones</p><p className="text-base font-bold text-slate-700">{rows.length}</p></div>
      </div>

      {/* Cluster manager */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">Tabla Tipo Ubicación × Dimensión · Agrega columnas de fórmula con el botón +</p>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 border border-cyan-300 text-cyan-700 hover:bg-cyan-50 text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap">
            <i className="ri-file-excel-2-line text-emerald-600"/>Descargar .xlsx
          </button>
          <button onClick={() => setShowClusterMgr(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap">
            <i className={`ri-stack-${showClusterMgr?'fill':'line'} text-sm`}/>Clusters
            {clusters.length > 0 && <span className="ml-1 px-1.5 py-0.5 bg-cyan-100 text-cyan-700 rounded-full text-[10px] font-semibold">{clusters.length}</span>}
          </button>
        </div>
      </div>
      {showClusterMgr && <ZonaClusterManager tableName="conteo_slots_clusters" clusters={clusters} zonas={allZonaNames} onChanged={onClustersChange}/>}

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><i className="ri-search-line text-sm text-slate-400"/></div>
          <input type="text" placeholder="Buscar tipo o dimensión..." value={search} onChange={e=>{setSearch(e.target.value);setArtPage(0);}} className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-100 focus:border-cyan-300 outline-none bg-white placeholder:text-slate-400"/>
        </div>
      </div>

      {/* Table */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="border border-slate-200 rounded-lg overflow-auto max-h-[65vh]">
          <table className="text-xs whitespace-nowrap w-full">
            <thead>
              <tr className="bg-slate-50 sticky top-0 z-10">
                <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
                  {columnOrder.map(colKey => {
                    if (colKey.startsWith('FIXED:')) {
                      const key = colKey.slice(6);
                      const hdr: Record<string,string> = { tipo:'Tipo Ubicación', dimension:'Dimensión', total:'Total', pctZona:'% Zona', libres:'Libres', pctLibres:'% Libres', bloqueados:'Bloqueados', reservados:'Reservados', otros:'Otros' };
                      const sortable = ['total','pctZona','libres','pctLibres','bloqueados','reservados','otros'].includes(key);
                      return <SortableFixedHeader key={colKey} id={colKey} className="px-3 py-2.5 text-left text-slate-500 font-semibold border-r border-slate-200 bg-slate-50">
                        {sortable ? <span onClick={() => toggleSort(`FIXED:${key}`)} className="cursor-pointer hover:text-slate-700 flex items-center gap-1">{hdr[key]??key}<i className={`${sortIcon(`FIXED:${key}`)} ml-0.5`}/></span> : <span>{hdr[key]??key}</span>}
                      </SortableFixedHeader>;
                    } else {
                      const col = zonaColumnas.find(c => c.id === colKey);
                      if (!col) return null;
                      return <SortableColHeader key={col.id} col={col} onDelete={handleDeleteColumn} onEditFormula={handleOpenColumnFormulaEditor} onRename={handleRenameColumn} onSort={() => toggleSort(col.id)} sortIconClass={sortIcon(col.id)}/>;
                    }
                  })}
                </SortableContext>
                <th className="px-1 py-2.5 bg-slate-50">
                  {colLoading ? <div className="flex justify-center px-2"><div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"/></div>
                  : addingColumn ? <div className="flex items-center gap-1 px-1">
                      <input type="text" value={newColName} onChange={e=>setNewColName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')handleAddColumn();if(e.key==='Escape'){setAddingColumn(false);setNewColName('');}}} placeholder="Nombre..." className="w-[120px] px-2 py-1 text-xs border border-cyan-300 rounded-md focus:outline-none focus:ring-1 focus:ring-cyan-400 bg-white" autoFocus/>
                      <button onClick={handleAddColumn} disabled={!newColName.trim()} className="w-6 h-6 flex items-center justify-center rounded-md bg-cyan-500 hover:bg-cyan-600 text-white cursor-pointer disabled:opacity-50"><i className="ri-check-line text-xs"/></button>
                      <button onClick={()=>{setAddingColumn(false);setNewColName('');}} className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 cursor-pointer"><i className="ri-close-line text-xs"/></button>
                    </div>
                  : <button onClick={()=>setAddingColumn(true)} className="w-8 h-8 flex items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-cyan-400 hover:text-cyan-500 hover:bg-cyan-50 cursor-pointer transition-all" title="Agregar columna de fórmula"><i className="ri-add-line text-sm"/></button>}
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.length === 0 ? <tr><td colSpan={columnOrder.length+1} className="px-3 py-10 text-center text-slate-400">{search ? 'Sin resultados' : 'Sin datos'}</td></tr>
              : paginatedRows.map((row, ai) => {
                const pctZ = zoneTotalSlots > 0 ? (row.total / zoneTotalSlots) * 100 : 0;
                const pctL = row.total > 0 ? (row.libres / row.total) * 100 : 0;
                const rKey = `${row.tipo_ubicacion}|${row.dimension}`;
                return (
                  <tr key={rKey} className={`border-t border-slate-100 hover:bg-cyan-50/40 ${ai%2===0?'bg-white':'bg-slate-50/30'}`}>
                    {columnOrder.map(colKey => {
                      if (colKey.startsWith('FIXED:')) {
                        const key = colKey.slice(6);
                        switch (key) {
                          case 'tipo':       return <td key={colKey} className="px-3 py-2 font-medium text-slate-700 border-r border-slate-100">{row.tipo_ubicacion}</td>;
                          case 'dimension':  return <td key={colKey} className="px-3 py-2 text-slate-600 border-r border-slate-100">{row.dimension}</td>;
                          case 'total':      return <td key={colKey} className="px-3 py-2 text-right font-medium text-slate-700 border-r border-slate-100">{fmt(row.total)}</td>;
                          case 'pctZona':    return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><div className="flex items-center justify-end gap-2"><div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-cyan-400 rounded-full" style={{width:`${Math.min(pctZ,100)}%`}}/></div><span className="text-slate-500 w-10 text-right">{fmtPct(pctZ)}%</span></div></td>;
                          case 'libres':     return <td key={colKey} className="px-3 py-2 text-right text-emerald-700 font-medium border-r border-slate-100">{fmt(row.libres)}</td>;
                          case 'pctLibres':  return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><div className="flex items-center justify-end gap-2"><div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-400 rounded-full" style={{width:`${Math.min(pctL,100)}%`}}/></div><span className="text-emerald-600 w-10 text-right">{fmtPct(pctL)}%</span></div></td>;
                          case 'bloqueados': return <td key={colKey} className="px-3 py-2 text-right text-rose-700 font-medium border-r border-slate-100">{fmt(row.bloqueados)}</td>;
                          case 'reservados': return <td key={colKey} className="px-3 py-2 text-right text-amber-700 font-medium border-r border-slate-100">{fmt(row.reservados)}</td>;
                          case 'otros':      return <td key={colKey} className="px-3 py-2 text-right text-slate-500 border-r border-slate-100">{fmt(row.otros)}</td>;
                          default: return null;
                        }
                      } else {
                        if (colLoading) return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><div className="flex justify-end"><div className="w-16 h-4 bg-slate-200 rounded animate-pulse"/></div></td>;
                        const col = zonaColumnas.find(c => c.id === colKey);
                        if (!col) return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-slate-300">—</span></td>;
                        const cell = computedCells[col.id]?.[rKey];
                        const hasFormula = !!cell?.formula;
                        return (
                          <td key={col.id} onClick={e=>handleOpenColumnFormulaEditor(col,e)} className={`px-3 py-2 text-right border-r border-slate-100 cursor-pointer transition-colors ${hasFormula?'hover:bg-cyan-100/60':'hover:bg-slate-100'}`} title={hasFormula?cell?.formula??'':'Clic para agregar fórmula'}>
                            {hasFormula ? (cell?.error ? <span className="text-rose-500"><i className="ri-error-warning-line mr-1"/>Error</span> : cell?.isGlobal ? <span className="text-slate-300 text-[10px] italic">—</span> : cell?.value!=null ? <span className="text-cyan-700 font-medium tabular-nums">{new Intl.NumberFormat('es-CO',{minimumFractionDigits:2,maximumFractionDigits:2}).format(cell.value)}</span> : <span className="text-slate-300">—</span>) : <span className="text-slate-300 text-[10px]">—</span>}
                          </td>
                        );
                      }
                    })}
                    <td className="px-1 py-2"/>
                  </tr>
                );
              })}
            </tbody>
            {paginatedRows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-100/80">
                  {columnOrder.map(colKey => {
                    if (colKey.startsWith('FIXED:')) {
                      const key = colKey.slice(6);
                      switch (key) {
                        case 'tipo':      return <td key={colKey} className="px-3 py-2 font-semibold text-slate-600 border-r border-slate-100 text-xs">{filteredRows.length} combinaciones</td>;
                        case 'total':     return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-slate-700">{fmt(filteredRows.reduce((s,r)=>s+r.total,0))}</span></td>;
                        case 'pctZona':   return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-cyan-600">100%</span></td>;
                        case 'libres':    return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-emerald-700">{fmt(filteredRows.reduce((s,r)=>s+r.libres,0))}</span></td>;
                        case 'pctLibres': return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-emerald-600">{fmtPct((() => { const t=filteredRows.reduce((s,r)=>s+r.total,0); const l=filteredRows.reduce((s,r)=>s+r.libres,0); return t>0?(l/t)*100:0; })())}%</span></td>;
                        case 'bloqueados': return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-rose-700">{fmt(filteredRows.reduce((s,r)=>s+r.bloqueados,0))}</span></td>;
                        case 'reservados': return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-amber-700">{fmt(filteredRows.reduce((s,r)=>s+r.reservados,0))}</span></td>;
                        case 'otros':     return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-slate-500">{fmt(filteredRows.reduce((s,r)=>s+r.otros,0))}</span></td>;
                        default: return <td key={colKey} className="px-2 py-2 border-r border-slate-100"/>;
                      }
                    } else {
                      return <td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-cyan-700 tabular-nums">{new Intl.NumberFormat('es-CO',{minimumFractionDigits:2,maximumFractionDigits:2}).format(footerTotals[colKey]??0)}</span></td>;
                    }
                  })}
                  <td className="px-1 py-2"/>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </DndContext>

      {totalArtPages > 1 && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-xs text-slate-400">{artPage*ART_PAGE_SIZE+1}–{Math.min((artPage+1)*ART_PAGE_SIZE,sortedRows.length)} de {sortedRows.length}</span>
          <div className="flex items-center gap-1">
            <button onClick={()=>setArtPage(p=>Math.max(0,p-1))} disabled={artPage===0} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 cursor-pointer whitespace-nowrap"><i className="ri-arrow-left-s-line"/>Anterior</button>
            <button onClick={()=>setArtPage(p=>Math.min(totalArtPages-1,p+1))} disabled={artPage>=totalArtPages-1} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 cursor-pointer whitespace-nowrap">Siguiente<i className="ri-arrow-right-s-line"/></button>
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

      {/* ── DETALLE POR TIPO ── */}
      <SlotsTipoDetalle
        zonas={zonas}
        colZoneKey={colZoneKey}
        zoneTotalSlots={zoneTotalSlots}
        systemVarDefs={systemVarDefs}
        systemVarMap={systemVarMap}
      />
    </div>
  );
}

// ── Tokens for tipo-level formulas ────────────────────────────────────────────
const TIPO_TOKENS = [
  { token: '{TOTAL_TIPO}',     label: 'Total slots del tipo', desc: 'Total de slots de este Tipo en la zona' },
  { token: '{LIBRES_TIPO}',    label: 'Libres del tipo',      desc: 'Slots libres de este Tipo' },
  { token: '{BLOQUEADOS_TIPO}',label: 'Bloqueados del tipo',  desc: 'Slots bloqueados de este Tipo' },
  { token: '{ZONA_TOTAL}',     label: 'Total Zona',           desc: 'Total de slots en toda la zona' },
  { token: '{PCT_TIPO_ZONA}',  label: '% tipo / zona',        desc: 'Porcentaje que este Tipo representa de la zona' },
  { token: '{PCT_LIBRES_TIPO}',label: '% Libres del tipo',    desc: 'Porcentaje libre dentro del tipo' },
];

const ESTADO_COLOR: Record<string, string> = {
  libre: 'bg-emerald-100 text-emerald-700',
  free: 'bg-emerald-100 text-emerald-700',
  disponible: 'bg-emerald-100 text-emerald-700',
  bloqueado: 'bg-rose-100 text-rose-700',
  blocked: 'bg-rose-100 text-rose-700',
  reservado: 'bg-amber-100 text-amber-700',
  reserved: 'bg-amber-100 text-amber-700',
};

function estadoColor(e: string): string {
  return ESTADO_COLOR[e.toLowerCase()] ?? 'bg-slate-100 text-slate-600';
}

interface SlotRow {
  id_almacenamiento: string;
  ubicacion: string;
  coordenada: string;
  categoria: string;
  tipo_ubicacion: string;
  dimension: string;
  estado: string;
  situacion: string;
  eje_x: string; eje_y: string; eje_z: string;
}

interface TipoCol { id: string; zona: string; tipo: string; nombre: string; formula?: string; orden: number; }

// Async export button: fetches ALL slots via JSON RPC before generating Excel
function ExportTipoButton({ tipo, zonas, tipoColumnas, computedTipoCols, colZoneKey }: {
  tipo: string; zonas: string[]; tipoColumnas: TipoCol[];
  computedTipoCols: Record<string, { value: number | null; error: boolean }>;
  colZoneKey: string;
}) {
  const [exporting, setExporting] = React.useState(false);
  const handle = async () => {
    setExporting(true);
    try {
      const rpc = zonas.length > 1 ? 'fn_slots_detalle_por_zonas_tipo_all' : 'fn_slots_detalle_por_tipo_all';
      const params = zonas.length > 1 ? { p_zonas: zonas, p_tipo: tipo } : { p_zona: zonas[0], p_tipo: tipo };
      const { data: json } = await supabase.rpc(rpc, params);
      const allSlots: any[] = Array.isArray(json) ? json : [];
      const fmtN = (n: number|null|undefined) => n != null ? Math.round(n*10000)/10000 : 0;
      const fixedH = ['Ubicación','Coordenada','Categoría','Tipo','Dimensión','Estado'];
      const colH = tipoColumnas.map(c => c.nombre);
      const rows1 = allSlots.map(s => [
        s.ubicacion, s.coordenada, s.categoria, s.tipo_ubicacion, s.dimension, s.estado,
        ...tipoColumnas.map(c => fmtN(computedTipoCols[c.id]?.value)),
      ]);
      const rows2 = tipoColumnas.filter(c => c.formula).map(c => [c.nombre, c.formula ?? '']);
      downloadExcelMultiSheet(`slots_${tipo.replace(/[^a-zA-Z0-9]/g,'_')}_${colZoneKey.slice(0,20)}.xlsx`, [
        { name: tipo.slice(0,31), headers: [...fixedH,...colH], rows: rows1 },
        ...(rows2.length > 0 ? [{ name: 'Fórmulas', headers: ['Columna','Fórmula'], rows: rows2 }] : []),
      ]);
    } finally { setExporting(false); }
  };
  return (
    <button onClick={handle} disabled={exporting} className="flex items-center gap-1.5 px-3 py-1.5 border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-60 disabled:cursor-wait text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap">
      {exporting ? <><div className="w-3 h-3 border border-indigo-500 border-t-transparent rounded-full animate-spin"/>Descargando...</> : <><i className="ri-file-excel-2-line text-emerald-600"/>Descargar {tipo} .xlsx</>}
    </button>
  );
}

function SlotsTipoDetalle({ zonas, colZoneKey, zoneTotalSlots, systemVarDefs, systemVarMap }: {
  zonas: string[];
  colZoneKey: string;
  zoneTotalSlots: number;
  systemVarDefs: VariableDef[];
  systemVarMap: Record<string, number>;
}) {
  const [tipos, setTipos] = useState<{ tipo: string; total: number; libres: number }[]>([]);
  const [selectedTipo, setSelectedTipo] = useState<string | null>(null);
  const [tipoStats, setTipoStats] = useState<{ total: number; libres: number; bloqueados: number; categorias: string } | null>(null);
  const [slots, setSlots] = useState<SlotRow[]>([]);
  const [slotLoading, setSlotLoading] = useState(false);
  const [slotPage, setSlotPage] = useState(0);
  const [slotTotal, setSlotTotal] = useState(0);
  const [search, setSearch] = useState('');
  const SLOT_PAGE = 100;

  // Tipo formula columns
  const [tipoColumnas, setTipoColumnas] = useState<TipoCol[]>([]);
  const [addingTipoCol, setAddingTipoCol] = useState(false);
  const [newTipoColName, setNewTipoColName] = useState('');
  const [editingTipoFormula, setEditingTipoFormula] = useState<{ colId: string; formula: string; position: { top: number; left: number } } | null>(null);

  // Load tipos
  useEffect(() => {
    if (!zonas.length) return;
    const loadTipos = async () => {
      if (zonas.length === 1) {
        const { data } = await supabase.rpc('fn_slots_zona_tipos', { p_zona: zonas[0] });
        setTipos(((data ?? []) as any[]).map((r: any) => ({ tipo: String(r.tipo ?? ''), total: Number(r.total) || 0, libres: Number(r.libres) || 0 })));
      } else {
        // Multi-zone: aggregate tipos
        const promises = zonas.map(z => supabase.rpc('fn_slots_zona_tipos', { p_zona: z }));
        const results = await Promise.all(promises);
        const map: Record<string, { total: number; libres: number }> = {};
        for (const { data } of results) {
          for (const r of (data ?? []) as any[]) {
            const t = String(r.tipo ?? '');
            if (!map[t]) map[t] = { total: 0, libres: 0 };
            map[t].total += Number(r.total) || 0;
            map[t].libres += Number(r.libres) || 0;
          }
        }
        setTipos(Object.entries(map).map(([tipo, v]) => ({ tipo, ...v })).sort((a, b) => b.total - a.total));
      }
    };
    loadTipos();
  }, [zonas.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load slots when tipo changes — queries conteo_slots_raw directly to bypass
  // RPC column-name issues and PostgREST max_rows cap
  useEffect(() => {
    if (!selectedTipo || !zonas.length) return;
    setSlotLoading(true);
    setSlotPage(0);
    setSlots([]);

    const loadSlots = async () => {
      // Aggregate stats (keep RPC for total/libres/bloqueados)
      const { data: stData } = await supabase.rpc('fn_slots_tipo_stats', { p_zonas: zonas, p_tipo: selectedTipo });
      const st = (stData as any[])?.[0] ?? {};
      setTipoStats({ total: Number(st.total)||0, libres: Number(st.libres)||0, bloqueados: Number(st.bloqueados)||0, categorias: String(st.categorias ?? '') });
      setSlotTotal(Number(st.total) || 0);

      // Query by tipo only (no zone filter in SQL) — exact JSONB match on two fields
      // misses rows when the cluster's stored zone string differs from raw_data format.
      // Instead, load all rows of this tipo and filter zones client-side.
      const { data: tipoRaw } = await supabase
        .from('conteo_slots_raw')
        .select('id, raw_data')
        .contains('raw_data', { 'Tipo Ubicación': selectedTipo })
        .range(0, 49999);

      // Flexible zone matching: exact OR code-prefix match (handles "ZA15" vs "ZA15 - ZONA...")
      const zonaCodes = zonas.map(z => z.trim().split(/[\s\-]+/)[0]).filter(Boolean);
      const matchesCluster = (rowZona: string) => {
        if (!zonas.length) return true;
        if (zonas.includes(rowZona)) return true;
        const rt = rowZona.trim();
        return zonaCodes.some(code => rt === code || rt.startsWith(code + ' ') || rt.startsWith(code + '-'));
      };

      const allRaw = (tipoRaw ?? []).filter(r =>
        matchesCluster(String(r.raw_data?.['Zona Almacenaje'] ?? ''))
      ) as any[];

      const mapped: SlotRow[] = allRaw.map(r => {
        const d: Record<string, unknown> = r.raw_data ?? {};
        return {
          id_almacenamiento: String(d['Id Almacenamiento'] ?? d['ID Almacenamiento'] ?? ''),
          ubicacion:         String(d['Ubicación']        ?? d['Ubicacion']        ?? ''),
          coordenada:        String(d['Coordenada']       ?? '--'),
          categoria:         String(d['Categoría']        ?? d['Categoria']        ?? ''),
          tipo_ubicacion:    String(d['Tipo Ubicación']   ?? d['Tipo Ubicacion']   ?? ''),
          dimension:         String(d['Dimensión']        ?? d['Dimension']        ?? ''),
          estado:            String(d['Estado']           ?? ''),
          situacion:         String(d['Situación']        ?? d['Situacion']        ?? ''),
          eje_x:             String(d['Eje X']            ?? ''),
          eje_y:             String(d['Eje Y']            ?? ''),
          eje_z:             String(d['Eje Z']            ?? ''),
        };
      });

      setSlots(mapped);
      if (mapped.length > 0) setSlotTotal(prev => Math.max(prev, mapped.length));
      setSlotLoading(false);
    };

    loadSlots();
  }, [selectedTipo, zonas.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load tipo formula columns
  useEffect(() => {
    if (!selectedTipo || !colZoneKey) return;
    supabase.from('costos_slots_tipo_columnas').select('*').eq('zona', colZoneKey).eq('tipo', selectedTipo).order('orden').then(({ data }) => {
      setTipoColumnas((data ?? []) as TipoCol[]);
    });
  }, [selectedTipo, colZoneKey]);

  // Tipo-level var map (same for all slots of this tipo)
  const buildTipoVarMap = useCallback((tipoInfo: { total: number; libres: number; bloqueados: number }) => ({
    TOTAL_TIPO: tipoInfo.total,
    LIBRES_TIPO: tipoInfo.libres,
    BLOQUEADOS_TIPO: tipoInfo.bloqueados,
    ZONA_TOTAL: zoneTotalSlots,
    PCT_TIPO_ZONA: zoneTotalSlots > 0 ? (tipoInfo.total / zoneTotalSlots) * 100 : 0,
    PCT_LIBRES_TIPO: tipoInfo.total > 0 ? (tipoInfo.libres / tipoInfo.total) * 100 : 0,
    ...systemVarMap,
  }), [zoneTotalSlots, systemVarMap]);

  // Compute formula column values (global — same for all slots)
  const computedTipoCols = useMemo(() => {
    if (!tipoStats) return {};
    const varMap = buildTipoVarMap(tipoStats);
    const result: Record<string, { value: number | null; error: boolean }> = {};
    for (const col of tipoColumnas) {
      if (!col.formula?.trim()) { result[col.id] = { value: null, error: false }; continue; }
      const r = evalFormula(col.formula, varMap);
      result[col.id] = { value: r.ok ? r.value : null, error: !r.ok };
    }
    return result;
  }, [tipoColumnas, tipoStats, buildTipoVarMap]);

  const filteredSlots = useMemo(() => {
    if (!search) return slots;
    const q = search.toLowerCase();
    return slots.filter(s =>
      s.ubicacion.toLowerCase().includes(q) ||
      s.id_almacenamiento.toLowerCase().includes(q) ||
      s.coordenada.toLowerCase().includes(q) ||
      s.categoria.toLowerCase().includes(q) ||
      s.estado.toLowerCase().includes(q)
    );
  }, [slots, search]);

  const addTipoCol = async () => {
    if (!newTipoColName.trim() || !selectedTipo) return;
    const { data } = await supabase.from('costos_slots_tipo_columnas').insert({ zona: colZoneKey, tipo: selectedTipo, nombre: newTipoColName.trim(), orden: tipoColumnas.length }).select().maybeSingle();
    if (data) setTipoColumnas(prev => [...prev, data as TipoCol]);
    setNewTipoColName(''); setAddingTipoCol(false);
  };

  const deleteTipoCol = async (id: string) => {
    if (!confirm('¿Eliminar esta columna?')) return;
    await supabase.from('costos_slots_tipo_columnas').delete().eq('id', id);
    setTipoColumnas(prev => prev.filter(c => c.id !== id));
  };

  const saveTipoFormula = async (formula: string) => {
    if (!editingTipoFormula) return;
    await supabase.from('costos_slots_tipo_columnas').update({ formula: formula || null }).eq('id', editingTipoFormula.colId);
    setTipoColumnas(prev => prev.map(c => c.id === editingTipoFormula.colId ? { ...c, formula: formula || undefined } : c));
    setEditingTipoFormula(null);
  };

  const TIPO_COLORS = ['bg-cyan-500','bg-indigo-500','bg-teal-500','bg-violet-500','bg-amber-500','bg-rose-500','bg-emerald-500','bg-sky-500'];

  if (!tipos.length) return null;

  return (
    <div className="space-y-4 border-t border-slate-200 pt-5 mt-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">Detalle por Tipo de Ubicación</p>
          <p className="text-xs text-slate-400 mt-0.5">Slot individual · Coordenada · Categoría · Precio via fórmulas</p>
        </div>
        {selectedTipo && <ExportTipoButton tipo={selectedTipo} zonas={zonas} tipoColumnas={tipoColumnas} computedTipoCols={computedTipoCols} colZoneKey={colZoneKey}/>}
      </div>

      {/* Tipo filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {tipos.map((t, i) => {
          const isActive = selectedTipo === t.tipo;
          const dotColor = TIPO_COLORS[i % TIPO_COLORS.length];
          const pctL = t.total > 0 ? (t.libres / t.total) * 100 : 0;
          return (
            <button key={t.tipo} onClick={() => setSelectedTipo(t.tipo)}
              className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${isActive ? 'bg-slate-800 text-white border-transparent shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:bg-slate-50'}`}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-white/70' : dotColor}`} />
              {t.tipo}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {new Intl.NumberFormat('es-CO').format(t.total)}
              </span>
              {pctL > 0 && <span className={`text-[10px] ${isActive ? 'text-white/60' : 'text-emerald-600'}`}>{pctL.toFixed(0)}%L</span>}
            </button>
          );
        })}
      </div>

      {selectedTipo && tipoStats && (
        <div className="space-y-3">
          {/* Tipo stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-cyan-50 border border-cyan-100 rounded-lg px-3 py-2.5">
              <p className="text-xs text-cyan-600 font-medium">"{selectedTipo}"</p>
              <p className="text-base font-bold text-cyan-700">{new Intl.NumberFormat('es-CO').format(tipoStats.total)} slots</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2.5">
              <p className="text-xs text-emerald-600">Libres</p>
              <p className="text-base font-bold text-emerald-700">{new Intl.NumberFormat('es-CO').format(tipoStats.libres)} <span className="text-xs opacity-70">({tipoStats.total > 0 ? ((tipoStats.libres/tipoStats.total)*100).toFixed(1) : 0}%)</span></p>
            </div>
            <div className="bg-rose-50 border border-rose-100 rounded-lg px-3 py-2.5">
              <p className="text-xs text-rose-600">Bloqueados</p>
              <p className="text-base font-bold text-rose-700">{new Intl.NumberFormat('es-CO').format(tipoStats.bloqueados)}</p>
            </div>
            {tipoStats.categorias && (
              <div className="bg-violet-50 border border-violet-100 rounded-lg px-3 py-2.5">
                <p className="text-xs text-violet-600">Categorías</p>
                <p className="text-sm font-medium text-violet-700 truncate" title={tipoStats.categorias}>{tipoStats.categorias}</p>
              </div>
            )}
          </div>

          {/* Formula columns for this tipo */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-indigo-700">Columnas de precio para "{selectedTipo}"</p>
                <p className="text-[10px] text-indigo-500 mt-0.5">Tokens: {TIPO_TOKENS.map(t => t.token).join(' · ')}</p>
              </div>
              {!addingTipoCol && <button onClick={() => setAddingTipoCol(true)} className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap"><i className="ri-add-line"/>Agregar columna</button>}
            </div>
            {addingTipoCol && (
              <div className="flex items-center gap-2">
                <input type="text" value={newTipoColName} onChange={e => setNewTipoColName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTipoCol(); if (e.key === 'Escape') { setAddingTipoCol(false); setNewTipoColName(''); } }} placeholder="Nombre de columna (ej: Costo/Slot)..." className="flex-1 px-3 py-1.5 text-xs border border-indigo-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white" autoFocus />
                <button onClick={addTipoCol} disabled={!newTipoColName.trim()} className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs rounded-lg cursor-pointer disabled:opacity-50">Crear</button>
                <button onClick={() => { setAddingTipoCol(false); setNewTipoColName(''); }} className="px-3 py-1.5 text-slate-500 hover:bg-slate-100 text-xs rounded-lg cursor-pointer">Cancelar</button>
              </div>
            )}
            {tipoColumnas.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tipoColumnas.map(col => {
                  const val = computedTipoCols[col.id];
                  return (
                    <div key={col.id} className="flex items-center gap-1.5 bg-white border border-indigo-200 rounded-lg px-3 py-2">
                      <div>
                        <span className="text-xs font-medium text-indigo-700">{col.nombre}</span>
                        {val?.value != null && <span className="ml-2 text-sm font-bold text-slate-800">{new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val.value)}</span>}
                        {val?.error && <span className="ml-2 text-xs text-rose-500">Error en fórmula</span>}
                        {!col.formula && <span className="ml-2 text-xs text-slate-400 italic">sin fórmula</span>}
                        {col.formula && <span className="ml-2 text-[10px] text-indigo-400 font-mono">{col.formula.slice(0, 40)}{col.formula.length > 40 ? '...' : ''}</span>}
                      </div>
                      <button onClick={e => { const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); setEditingTipoFormula({ colId: col.id, formula: col.formula ?? '', position: { top: rect.bottom + 4, left: rect.left } }); }} className="w-6 h-6 flex items-center justify-center rounded text-indigo-400 hover:text-indigo-600 hover:bg-indigo-100 cursor-pointer flex-shrink-0" title="Editar fórmula"><i className="ri-functions text-xs"/></button>
                      <button onClick={() => deleteTipoCol(col.id)} className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-rose-500 hover:bg-rose-50 cursor-pointer flex-shrink-0"><i className="ri-delete-bin-line text-xs"/></button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Individual slot table */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><i className="ri-search-line text-sm text-slate-400"/></div>
                <input type="text" placeholder="Buscar código, ubicación, coordenada, categoría..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-100 focus:border-cyan-300 outline-none bg-white placeholder:text-slate-400"/>
              </div>
              <span className="text-xs text-slate-400 whitespace-nowrap">{filteredSlots.length} slots</span>
            </div>

            {slotLoading ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"/>
                <span className="text-xs text-slate-400">Cargando slots de tipo {selectedTipo}…</span>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-auto max-h-[55vh]">
                <table className="text-xs whitespace-nowrap w-full">
                  <thead>
                    <tr className="bg-slate-50 sticky top-0 z-10">
                      <th className="px-3 py-2.5 text-left text-slate-500 font-semibold border-r border-slate-200">Código</th>
                      <th className="px-3 py-2.5 text-left text-slate-500 font-semibold border-r border-slate-200">Coordenada</th>
                      <th className="px-3 py-2.5 text-left text-slate-500 font-semibold border-r border-slate-200">Categoría</th>
                      <th className="px-3 py-2.5 text-left text-slate-500 font-semibold border-r border-slate-200">Tipo</th>
                      <th className="px-3 py-2.5 text-left text-slate-500 font-semibold border-r border-slate-200">Dimensión</th>
                      <th className="px-3 py-2.5 text-left text-slate-500 font-semibold border-r border-slate-200">Estado</th>
                      {tipoColumnas.map(col => (
                        <th key={col.id} className={`px-3 py-2.5 text-right font-semibold border-r border-slate-200 ${col.formula ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500'}`}>
                          {col.nombre}{col.formula && <span className="ml-1 text-[10px] bg-indigo-200 text-indigo-700 px-1 rounded font-mono">fx</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSlots.slice(slotPage * SLOT_PAGE, (slotPage + 1) * SLOT_PAGE).map((slot, i) => (
                      <tr key={`${slot.ubicacion}-${i}`} className={`border-t border-slate-100 hover:bg-cyan-50/40 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                        <td className="px-3 py-1.5 font-medium text-slate-700 border-r border-slate-100">{slot.ubicacion || slot.id_almacenamiento || '—'}</td>
                        <td className="px-3 py-1.5 font-mono text-slate-600 border-r border-slate-100 text-[11px]">{slot.coordenada !== '--' ? slot.coordenada : `${slot.eje_x}-${slot.eje_y}-${slot.eje_z}` || '—'}</td>
                        <td className="px-3 py-1.5 text-slate-600 border-r border-slate-100">{slot.categoria || '—'}</td>
                        <td className="px-3 py-1.5 text-slate-600 border-r border-slate-100">{slot.tipo_ubicacion || '—'}</td>
                        <td className="px-3 py-1.5 text-slate-500 border-r border-slate-100">{slot.dimension || '—'}</td>
                        <td className="px-3 py-1.5 border-r border-slate-100">
                          {slot.estado ? <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${estadoColor(slot.estado)}`}>{slot.estado}</span> : '—'}
                        </td>
                        {tipoColumnas.map(col => {
                          const val = computedTipoCols[col.id];
                          return (
                            <td key={col.id} className="px-3 py-1.5 text-right border-r border-slate-100 bg-indigo-50/30">
                              {val?.error ? <span className="text-rose-400 text-[10px]">Error</span>
                              : val?.value != null ? <span className="text-indigo-700 font-medium tabular-nums">{new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val.value)}</span>
                              : <span className="text-slate-300">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {filteredSlots.length === 0 && (
                      <tr><td colSpan={6 + tipoColumnas.length} className="px-3 py-8 text-center text-slate-400">
                        {search
                          ? <>Sin resultados para <span className="font-mono bg-slate-100 px-1 rounded">{search}</span> en tipo {selectedTipo}. Verifica el código en "Ver datos" o prueba otro tipo de ubicación.</>
                          : 'Sin slots'}
                      </td></tr>
                    )}
                  </tbody>
                  {filteredSlots.length > 0 && tipoColumnas.some(c => c.formula && computedTipoCols[c.id]?.value != null) && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-100/80">
                        <td className="px-3 py-2 font-semibold text-slate-600 text-xs" colSpan={6}>{filteredSlots.length} slots · valor de columnas aplica igual a todos los slots del tipo</td>
                        {tipoColumnas.map(col => {
                          const val = computedTipoCols[col.id];
                          return <td key={col.id} className="px-3 py-2 text-right bg-indigo-50/50">
                            {val?.value != null ? <span className="text-xs font-bold text-indigo-700">{new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val.value)}</span> : null}
                          </td>;
                        })}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
            {Math.ceil(filteredSlots.length / SLOT_PAGE) > 1 && (
              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-xs text-slate-400">{slotPage*SLOT_PAGE+1}–{Math.min((slotPage+1)*SLOT_PAGE,filteredSlots.length)} de {filteredSlots.length}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setSlotPage(p => Math.max(0,p-1))} disabled={slotPage===0} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 cursor-pointer whitespace-nowrap"><i className="ri-arrow-left-s-line"/>Anterior</button>
                  <button onClick={() => setSlotPage(p => Math.min(Math.ceil(filteredSlots.length/SLOT_PAGE)-1,p+1))} disabled={slotPage>=Math.ceil(filteredSlots.length/SLOT_PAGE)-1} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 cursor-pointer whitespace-nowrap">Siguiente<i className="ri-arrow-right-s-line"/></button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {editingTipoFormula && tipoStats && (
        <ZonaCeldaFormulaEditor
          formula={editingTipoFormula.formula}
          varMap={buildTipoVarMap(tipoStats)}
          onSave={saveTipoFormula}
          onCancel={() => setEditingTipoFormula(null)}
          position={editingTipoFormula.position}
          systemVarDefs={systemVarDefs}
          systemVarMap={systemVarMap}
        />
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ConteoSlotsPage() {
  const [masivoInfo, setMasivoInfo] = useState<MasivoInfo | null>(null);
  const [loading, setLoading]       = useState(true);
  const [showUpload, setShowUpload]  = useState(false);
  const [clearing, setClearing]     = useState(false);
  const [tab, setTab]               = useState<Tab>('resumen');
  const [zonaResumen, setZonaResumen] = useState<ZonaResumen[]>([]);
  const [globalTotals, setGlobalTotals] = useState<{ total_slots:number; total_zonas:number; total_libres:number; total_bloqueados:number; total_reservados:number } | null>(null);
  const [formulaCtx, setFormulaCtx] = useState<FormulaContext>(EMPTY_FORMULA_CTX);

  const [activeSelection, setActiveSelection] = useState<ActiveSelection>({ type: 'zone', zona: '' });
  const isCluster = activeSelection.type === 'cluster';
  const activeZona = activeSelection.type === 'zone' ? activeSelection.zona : '';
  const activeCluster = activeSelection.type === 'cluster' ? activeSelection.cluster : null;
  const activeZonas = isCluster ? (activeCluster?.zonas ?? []) : (activeZona ? [activeZona] : []);
  const zonaLabel = isCluster ? (activeCluster?.nombre ?? 'Cluster') : activeZona;

  const { clusters, loadClusters } = useZonaClusters('conteo_slots_clusters');

  const loadData = useCallback(async () => {
    setLoading(true);
    const { count } = await supabase.from('conteo_slots_raw').select('*', { count:'exact', head:true });
    if (!count || count === 0) { setMasivoInfo(null); setLoading(false); return; }
    const { data: sample } = await supabase.from('conteo_slots_raw').select('raw_data').limit(1).single();
    setMasivoInfo({ totalRegistros: count, headers: sample?.raw_data ? Object.keys(sample.raw_data as Record<string,unknown>) : [] });

    const [{ data: totalesRaw }, { data: zonasRaw }, base] = await Promise.all([
      supabase.rpc('fn_slots_totales'),
      supabase.rpc('fn_slots_zona_resumen'),
      fetchBaseQueryData(),
    ]);
    const t0 = (totalesRaw as any[])?.[0] ?? {};
    setGlobalTotals({ total_slots:Number(t0.total_slots)||0, total_zonas:Number(t0.total_zonas)||0, total_libres:Number(t0.total_libres)||0, total_bloqueados:Number(t0.total_bloqueados)||0, total_reservados:Number(t0.total_reservados)||0 });
    const zonas = ((zonasRaw??[]) as any[]).map((r:any)=>({ zona:String(r.zona??''), total_slots:Number(r.total_slots)||0, libres:Number(r.libres)||0, bloqueados:Number(r.bloqueados)||0, reservados:Number(r.reservados)||0, otros:Number(r.otros)||0 }));
    setZonaResumen(zonas);

    // Build formulaCtx — same enrichment as costos/page.tsx for accurate COSTOS_TOTAL_* tokens
    const { areasData,invData,gastosColData,gastosFilData,areaDistribData,moColData,moFilData,volColData,volFilData,empData,volDistData,factoresData } = base as any;
    const [{ data: cosColData }, { data: cosFilData }] = await Promise.all([
      supabase.from('costos_columnas').select('*').order('orden'),
      supabase.from('costos_operacion').select('*').order('orden'),
    ]);

    // ── Enrich areaDistribucion (adds categoria + category/cubic %) ──────────
    const areasWithCat = ((areasData ?? []) as any[]).map((a: any) => ({
      nombre: a.nombre, metros_cuadrados: a.metros_cuadrados ?? 0,
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
        category_distribution_percentage:    catTotal      > 0 ? +((areaM2 / catTotal)      * 100).toFixed(2) : 0,
        global_distribution_cubic_percentage: totalM3Global > 0 ? +((areaM3 / totalM3Global) * 100).toFixed(2) : 0,
        category_distribution_cubic_percentage: catTotalCubic > 0 ? +((areaM3 / catTotalCubic) * 100).toFixed(2) : 0,
      };
    });

    // ── Base context (without costo_area formulas yet, to avoid circularity) ──
    const baseCtxForAreas: FormulaContext = {
      inversiones: (invData as InversionRecord[]) ?? [],
      gastosColumnas: (gastosColData ?? []) as FormulaContext['gastosColumnas'],
      gastosFilas: (gastosFilData ?? []) as FormulaContext['gastosFilas'],
      areaDistribucion: enrichedAreaDist as FormulaContext['areaDistribucion'],
      manoObraColumnas: (moColData ?? []) as FormulaContext['manoObraColumnas'],
      manoObraFilas: (moFilData ?? []) as FormulaContext['manoObraFilas'],
      manoObraEmpleados: (empData ?? []) as FormulaContext['manoObraEmpleados'],
      volumenesColumnas: (volColData ?? []) as FormulaContext['volumenesColumnas'],
      volumenesFilas: (volFilData ?? []) as FormulaContext['volumenesFilas'],
      costosColumnas: (cosColData ?? []) as FormulaContext['costosColumnas'],
      costosFilas: (cosFilData ?? []) as FormulaContext['costosFilas'],
      areasData: areasWithCat.map(a => ({ nombre: a.nombre, metros_cuadrados: a.metros_cuadrados, cantidad_racks: a.cantidad_racks, metros_cubicos: a.metros_cubicos, costo_area: a.costo_area })),
      volDistribucion: (volDistData ?? []) as FormulaContext['volDistribucion'],
      factores: (factoresData ?? []) as FormulaContext['factores'],
      masivoArticulos: [], masivoZonas: [], masivoZonaArticulos: [], masivoTotals: undefined,
    };

    // ── Compute costo_area from formula for each area (same as costos/page.tsx) ──
    const mappedAreasData = areasWithCat.map(a => ({ ...a }));
    for (const area of mappedAreasData) {
      if (area.costo_area_formula) {
        try { area.costo_area = calcularFormula(area.costo_area_formula, baseCtxForAreas, area.nombre); } catch { /* keep stored value */ }
      }
    }

    setFormulaCtx({
      ...baseCtxForAreas,
      // Override areasData with formula-computed costo_area
      areasData: mappedAreasData.map(a => ({ nombre: a.nombre, metros_cuadrados: a.metros_cuadrados, cantidad_racks: a.cantidad_racks, metros_cubicos: a.metros_cubicos, costo_area: a.costo_area })),
    });
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); loadClusters(); }, [loadData, loadClusters]);

  // Auto-select first unclustered zone
  useEffect(() => {
    if (activeSelection.type === 'zone' && !activeSelection.zona && zonaResumen.length > 0) {
      const first = zonaResumen.find(z => !clusters.some(c => c.zonas.includes(z.zona)));
      if (first) setActiveSelection({ type: 'zone', zona: first.zona });
    }
  }, [zonaResumen, clusters]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClearAll = async () => {
    if (!confirm('¿Eliminar TODOS los datos de Costos de Slots?')) return;
    setClearing(true);
    await supabase.from('conteo_slots_raw').delete().neq('id','00000000-0000-0000-0000-000000000000');
    setClearing(false); loadData();
  };

  const clusteredZones = new Set(clusters.flatMap(c => c.zonas));
  const unclusteredZones = zonaResumen.filter(z => !clusteredZones.has(z.zona));
  const allZoneNames = zonaResumen.map(z => z.zona);
  const ZONE_COLORS = ['bg-cyan-500','bg-indigo-500','bg-teal-500','bg-sky-500','bg-violet-500','bg-amber-500','bg-emerald-500','bg-rose-500'];

  if (loading) return <AppLayout title="Costos de Slots" subtitle="Cargando..."><div className="flex items-center justify-center py-32"><div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"/></div></AppLayout>;

  return (
    <AppLayout
      title="Costos de Slots"
      subtitle="Inventario de ubicaciones · Análisis por Zona Almacenaje · Fórmulas por Tipo × Dimensión"
      actions={<div className="flex items-center gap-2">
        {masivoInfo && <button onClick={handleClearAll} disabled={clearing} className="flex items-center gap-2 px-4 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap disabled:opacity-50"><i className="ri-delete-bin-line"/>{clearing?'Limpiando...':'Limpiar'}</button>}
        <button onClick={()=>setShowUpload(true)} className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap"><i className="ri-file-excel-2-line"/>Cargar Excel</button>
      </div>}
    >
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div><h3 className="text-sm font-semibold text-slate-800">Costos de Slots</h3><p className="text-xs text-slate-400 mt-0.5">Zona: <strong>Zona Almacenaje</strong> · Tabla: <strong>Tipo Ubicación × Dimensión</strong></p></div>
            {masivoInfo && <span className="text-xs px-2.5 py-1 rounded-full bg-cyan-50 text-cyan-700 font-medium">{fmt(masivoInfo.totalRegistros)} slots</span>}
          </div>

          {!masivoInfo ? (
            <div className="px-6 py-12 flex flex-col items-center gap-4">
              <div className="w-14 h-14 flex items-center justify-center rounded-full bg-cyan-50"><i className="ri-layout-grid-line text-2xl text-cyan-400"/></div>
              <div className="text-center max-w-sm"><p className="text-slate-700 font-semibold text-sm">Sin datos de slots</p><p className="text-slate-400 text-xs mt-1">Carga un Excel con el inventario de ubicaciones.</p></div>
              <button onClick={()=>setShowUpload(true)} className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap"><i className="ri-file-excel-2-line"/>Cargar Excel</button>
            </div>
          ) : (
            <div className="px-6 py-4">
              <div className="flex gap-1 mb-4 flex-wrap">
                {[{id:'resumen',icon:'ri-dashboard-line',label:'Resumen'},{id:'zonas',icon:'ri-map-pin-line',label:'Por Zona (fórmulas)'},{id:'datos',icon:'ri-table-line',label:'Ver datos'}].map(t => (
                  <button key={t.id} onClick={()=>setTab(t.id as Tab)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${tab===t.id?'bg-slate-800 text-white':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    <i className={`${t.icon} text-[11px]`}/>{t.label}
                  </button>
                ))}
              </div>

              {/* RESUMEN */}
              {tab === 'resumen' && globalTotals && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3"><p className="text-xs text-slate-500">Total Slots</p><p className="text-lg font-bold text-slate-800">{fmt(globalTotals.total_slots)}</p></div>
                    <div className="bg-cyan-50 border border-cyan-100 rounded-lg px-4 py-3"><p className="text-xs text-cyan-600">Zonas</p><p className="text-lg font-bold text-cyan-700">{globalTotals.total_zonas}</p></div>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3"><p className="text-xs text-emerald-600">Libres</p><p className="text-lg font-bold text-emerald-700">{fmt(globalTotals.total_libres)} <span className="text-xs opacity-70">({fmtPct(globalTotals.total_slots>0?(globalTotals.total_libres/globalTotals.total_slots)*100:0)}%)</span></p></div>
                    <div className="bg-rose-50 border border-rose-100 rounded-lg px-4 py-3"><p className="text-xs text-rose-600">Bloqueados</p><p className="text-lg font-bold text-rose-700">{fmt(globalTotals.total_bloqueados)}</p></div>
                    <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3"><p className="text-xs text-amber-600">Reservados</p><p className="text-lg font-bold text-amber-700">{fmt(globalTotals.total_reservados)}</p></div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2">
                    <p className="text-sm font-semibold text-slate-700 mb-3">Slots por Zona Almacenaje</p>
                    {zonaResumen.map((z, i) => {
                      const pctT = globalTotals.total_slots>0?(z.total_slots/globalTotals.total_slots)*100:0;
                      const pctL = z.total_slots>0?(z.libres/z.total_slots)*100:0;
                      return (
                        <div key={z.zona} className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ZONE_COLORS[i%ZONE_COLORS.length]}`}/>
                          <span className="w-32 text-xs text-slate-600 font-medium truncate flex-shrink-0">{z.zona}</span>
                          <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-cyan-400 rounded-full" style={{width:`${Math.max(pctT,0.5)}%`}}/></div>
                          <span className="w-16 text-right text-xs text-slate-700 font-medium flex-shrink-0">{fmt(z.total_slots)}</span>
                          <span className="w-12 text-right text-xs text-slate-400 flex-shrink-0">{fmtPct(pctT)}%</span>
                          <span className="w-16 text-right text-xs text-emerald-600 flex-shrink-0">{fmtPct(pctL)}% libre</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ZONAS — full zone detail + formulas */}
              {tab === 'zonas' && (
                <div className="space-y-4">
                  {/* Zone / cluster tabs */}
                  <div className="flex gap-1.5 flex-wrap">
                    {clusters.map(cluster => {
                      const isActive = activeSelection.type==='cluster' && activeSelection.cluster.id===cluster.id;
                      const total = zonaResumen.filter(z=>cluster.zonas.includes(z.zona)).reduce((s,z)=>s+z.total_slots,0);
                      return <button key={cluster.id} onClick={()=>setActiveSelection({type:'cluster',cluster})}
                        className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${isActive?`${clusterActiveBg(cluster.color)} border-transparent`:'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                        <i className={`ri-stack-line ${isActive?'text-white/80':'text-slate-400'}`}/>{cluster.nombre}
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${isActive?'bg-white/20 text-white':'bg-slate-100 text-slate-500'}`}>{fmt(total)}</span>
                      </button>;
                    })}
                    {clusters.length > 0 && unclusteredZones.length > 0 && <div className="flex items-center px-1"><div className="h-5 w-px bg-slate-200"/></div>}
                    {unclusteredZones.map((z, i) => {
                      const isActive = activeSelection.type==='zone' && activeSelection.zona===z.zona;
                      return <button key={z.zona} onClick={()=>setActiveSelection({type:'zone',zona:z.zona})}
                        className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${isActive?'bg-cyan-600 text-white border-transparent shadow-sm':'bg-white text-slate-600 border-slate-200 hover:border-cyan-300 hover:bg-cyan-50'}`}>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive?'bg-white/70':ZONE_COLORS[i%ZONE_COLORS.length]}`}/>
                        {z.zona}
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${isActive?'bg-white/20 text-white':'bg-slate-100 text-slate-500'}`}>{fmt(z.total_slots)}</span>
                      </button>;
                    })}
                  </div>

                  {activeZonas.length > 0 && (
                    <ZonaDetailTable
                      zonas={activeZonas}
                      zona_label={zonaLabel}
                      zoneTotals={zonaResumen}
                      formulaCtx={formulaCtx}
                      clusters={clusters}
                      onClustersChange={loadClusters}
                      allZonaNames={allZoneNames}
                    />
                  )}
                </div>
              )}

              {tab === 'datos' && <RawTable headers={masivoInfo?.headers??[]}/>}
            </div>
          )}
        </div>
      </div>

      {showUpload && (
        <React.Suspense fallback={null}>
          {React.createElement(React.lazy(()=>import('./components/ExcelUploadModal')), { onClose:()=>setShowUpload(false), onSuccess:loadData })}
        </React.Suspense>
      )}
    </AppLayout>
  );
}
