import React, { useState, useEffect, useCallback, useMemo, useDeferredValue, useRef } from 'react';
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
import { logChange } from '@/lib/auditLog';

// ── Types ─────────────────────────────────────────────────────────────────────
interface ZonaResumen { zona: string; total_articulos: number; ubicaciones_distintas: number; companias_distintas: number; cantidad_total: number; }
interface InvRow { articulo: string; ubicacion: string; descripcion: string; zona_almacenaje: string; cantidad_unidades: number; cantidad_almacenaje: number; id_compania: string; compania: string; tipo_ubicacion: string; estado: string; }
interface UbicData { total_articulos: number; suma_cantidad: number; suma_cantidad_alm: number; companias: string; }
interface DistribCol { id: string; nombre: string; formula?: string; orden: number; }
interface MasivoInfo { totalRegistros: number; headers: string[]; volRecords: number; }
interface PickingMatch { cant_maxima: number; cant_minima: number; pct_picking: number; }
interface FiltroUbicacion { id: string; patron: string; descripcion: string; activo: boolean; }
interface ArtUbicData { cantidad_ubicaciones: number; suma_cantidad: number; }
interface AggRow { articulo: string; descripcion: string; zona_almacenaje: string; id_compania: string; compania: string; cantidad_unidades: number; cantidad_almacenaje: number; cantidad_ubicaciones: number; }
type Tab = 'resumen' | 'zonas' | 'datos' | 'reglas';
type ActiveSelection = { type: 'zone'; zona: string } | { type: 'cluster'; cluster: { id: string; nombre: string; zonas: string[]; color: string; orden: number } };

const fmt    = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);
const fmtDec = (n: number) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtVol = (n: number) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(n);

// Formula tokens for this module
const ALMACEN_TOKENS = [
  { token: '{CANTIDAD_UNIDADES}',   label: 'Cantidad Unidades',          desc: 'Cantidad de unidades de este artículo en la ubicación' },
  { token: '{CANTIDAD_ALMACENAJE}', label: 'Cantidad Almacenaje',        desc: 'Cantidad de almacenaje del artículo' },
  { token: '{VOLUMEN}',             label: 'Volumen (Volumetría)',        desc: 'Volumen del artículo (cruzado desde Volumetría por ID_ARTICULO)' },
  { token: '{TOTAL_ARTICULOS}',     label: 'Artículos en ubicación',     desc: 'Total artículos en la misma Ubicación' },
  { token: '{SUMA_CANTIDAD_UBIC}',  label: 'Σ Cantidad ubicación',       desc: 'Suma de Cantidad Unidades de todos los artículos de la ubicación' },
  { token: '{ZONA_TOTAL_ARTS}',     label: 'Total arts. zona',           desc: 'Total de artículos en la zona activa' },
  { token: '{SLOT_TOTAL}',          label: 'Slots totales',              desc: 'Total de slots físicos en esta Ubicación (Costos de Slots)' },
  { token: '{SLOT_LIBRES}',         label: 'Slots libres',               desc: 'Slots con estado Libre' },
  { token: '{SLOT_PCT_LIBRES}',     label: '% Slots libres',             desc: '% de slots libres en esta Ubicación' },
  { token: '{CANT_UBICACIONES}',    label: 'Cantidad de ubicaciones del artículo', desc: 'Cuántas ubicaciones distintas ocupa este artículo en la zona (con filtros aplicados)' },
  { token: '{UBICACIONES_ZONA}',    label: 'Total ubicaciones en zona',  desc: 'Total de ubicaciones distintas en la zona/cluster activo (con filtros)' },
  { token: '{CANT_MAXIMA}',         label: 'Cantidad Máxima (Picking)',  desc: 'Cantidad Máxima del artículo en esta ubicación (Zona Picking)' },
  { token: '{CANT_MINIMA}',         label: 'Cantidad Mínima (Picking)',  desc: 'Cantidad Mínima del artículo en esta ubicación (Zona Picking)' },
  { token: '{PCT_PICKING}',         label: '% Picking',                  desc: '% de picking de este artículo en esta ubicación (Zona Picking)' },
];

// ── Sortable headers ──────────────────────────────────────────────────────────
function SFH({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return <th ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, position: 'relative' }} className={className}><div className="flex items-center gap-1.5"><button {...attributes} {...listeners} className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 cursor-grab active:cursor-grabbing flex-shrink-0"><i className="ri-draggable text-xs"/></button><div className="min-w-0 flex-1">{children}</div></div></th>;
}

function SCH({ col, onDelete, onEditFormula, onRename, onSort, sortIconClass }: { col: DistribCol; onDelete: (id: string) => void; onEditFormula: (col: DistribCol, e: React.MouseEvent) => void; onRename: (id: string, n: string) => void; onSort: () => void; sortIconClass: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.id });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(col.nombre);
  const hasF = !!col.formula?.trim();
  const save = () => { const t = name.trim(); if (t && t !== col.nombre) onRename(col.id, t); else setName(col.nombre); setEditing(false); };
  return (
    <th ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, position: 'relative' }} className={`px-2 py-2.5 border-r font-semibold ${hasF ? 'bg-teal-100/60 border-teal-200' : 'bg-teal-50/50 border-teal-100'}`}>
      <div className="flex items-center gap-1.5">
        <button {...attributes} {...listeners} className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 cursor-grab active:cursor-grabbing flex-shrink-0"><i className="ri-draggable text-xs"/></button>
        <div className="flex items-center gap-1 min-w-0 flex-1">
          {editing ? <input type="text" value={name} onChange={e=>setName(e.target.value)} onBlur={save} onKeyDown={e=>{if(e.key==='Enter')save();if(e.key==='Escape'){setName(col.nombre);setEditing(false);}}} className="text-xs text-teal-700 bg-white border border-teal-300 rounded px-1.5 py-0.5 w-full min-w-[80px] focus:outline-none" autoFocus/>
          : <div className="flex items-center gap-0.5 min-w-0 group/n"><span onClick={onSort} className="text-xs text-teal-700 whitespace-nowrap max-w-[120px] overflow-hidden text-ellipsis cursor-pointer hover:underline">{col.nombre}</span><div className="w-3 h-3 flex items-center justify-center flex-shrink-0 cursor-pointer" onClick={onSort}><i className={sortIconClass}/></div><button onClick={()=>{setName(col.nombre);setEditing(true);}} className="w-4 h-4 flex items-center justify-center rounded text-slate-300 hover:text-teal-500 cursor-pointer flex-shrink-0 opacity-0 group-hover/n:opacity-100"><i className="ri-pencil-line text-[10px]"/></button></div>}
          {hasF && <span className="text-[10px] px-1 py-0.5 rounded bg-teal-200 text-teal-700 font-mono font-bold flex-shrink-0">fx</span>}
        </div>
        <button onClick={e=>onEditFormula(col,e)} className={`w-5 h-5 flex items-center justify-center rounded cursor-pointer flex-shrink-0 ${hasF?'text-teal-600 hover:text-teal-800 hover:bg-teal-200':'text-slate-400 hover:text-teal-500 hover:bg-teal-100'}`}><i className={`${hasF?'ri-pencil-line':'ri-functions'} text-xs`}/></button>
        <button onClick={()=>onDelete(col.id)} className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 cursor-pointer flex-shrink-0"><i className="ri-close-line text-xs"/></button>
      </div>
    </th>
  );
}

// ── Raw Table viewer ──────────────────────────────────────────────────────────
function RawTable({ tab }: { tab: 'inventario' | 'volumetria' }) {
  const TABLE = tab === 'inventario' ? 'costos_almacen_inventario_raw' : 'costos_almacen_volumetria_raw';
  const PAGE = 50;
  const [rows, setRows]           = useState<any[]>([]);
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
    let q = supabase.from(TABLE).select('id, raw_data', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(p * PAGE, (p + 1) * PAGE - 1);
    if (col && term) q = (q as any).filter(`raw_data->>'${col}'`, 'ilike', `%${term}%`);
    const { data, count: c } = await q;
    if (data) {
      setRows(data as any[]); setCount(c ?? 0);
      if ((data as any[]).length && !initRef.current) {
        initRef.current = true;
        const hdrs = Object.keys((data as any[])[0].raw_data ?? {});
        setColHeaders(hdrs);
        setFilterCol(fc => fc || hdrs[0] || '');
      }
    }
    setLoading(false);
  }, [TABLE]);

  useEffect(() => {
    initRef.current = false;
    setColHeaders([]); setFilterInput(''); setFilterCol(''); setActiveCol(''); setActiveTerm(''); setPage(0);
    load(0, '', '');
  }, [load]);
  useEffect(() => { load(page, activeCol, activeTerm); }, [load, page, activeCol, activeTerm]);

  const applySearch = () => { setPage(0); setActiveCol(filterCol); setActiveTerm(filterInput); };
  const clearSearch = () => { setFilterInput(''); setPage(0); setActiveCol(''); setActiveTerm(''); };

  const totalPages = Math.ceil(count / PAGE);
  const dh = rows[0]?.raw_data ? Object.keys(rows[0].raw_data) : [];
  const isFiltered = !!(activeCol && activeTerm);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <select value={filterCol} onChange={e => setFilterCol(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 bg-white max-w-[200px]">
          {colHeaders.length ? colHeaders.map(h=><option key={h} value={h}>{h}</option>) : <option value="">— columna —</option>}
        </select>
        <input type="text" value={filterInput} onChange={e=>setFilterInput(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&applySearch()}
          placeholder="Buscar..." className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 flex-1 min-w-[120px]"/>
        <button onClick={applySearch} className="px-3 py-1.5 text-xs bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 cursor-pointer whitespace-nowrap">
          <i className="ri-search-line mr-1"/>Buscar
        </button>
        {isFiltered && <button onClick={clearSearch} className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer" title="Limpiar filtro">
          <i className="ri-close-line"/>
        </button>}
      </div>
      <span className="text-xs text-slate-400">
        {isFiltered ? `${fmt(count)} resultado(s) · "${activeTerm}" en ${activeCol}` : `${fmt(count)} registros`} · pág. {page+1}/{Math.max(totalPages,1)}
      </span>
      <div className="border border-slate-200 rounded-lg overflow-auto max-h-[55vh]">
        <table className="text-xs whitespace-nowrap w-full">
          <thead><tr className="bg-slate-50 sticky top-0 z-10">
            <th className="px-3 py-2 text-left text-slate-500 border-r border-slate-200">#</th>
            {dh.map(h=><th key={h} className="px-3 py-2 text-left text-slate-500 border-r border-slate-200 max-w-[140px] overflow-hidden text-ellipsis">{h}</th>)}
          </tr></thead>
          <tbody>
            {loading
              ? <tr><td colSpan={dh.length+1} className="px-3 py-8 text-center text-slate-400">Cargando...</td></tr>
              : rows.map((r,i)=><tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-1.5 text-slate-400 border-r border-slate-100 text-center">{page*PAGE+i+1}</td>
                  {dh.map(h=>{const v=r.raw_data?.[h];return<td key={h} className="px-3 py-1.5 text-slate-600 border-r border-slate-100 max-w-[140px] overflow-hidden text-ellipsis">{v!=null?String(v):'—'}</td>;})}
                </tr>)
            }
          </tbody>
        </table>
      </div>
      {totalPages>1 && <div className="flex items-center justify-between gap-3">
        <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 cursor-pointer"><i className="ri-arrow-left-line mr-1"/>Anterior</button>
        <span className="text-xs text-slate-400">{page+1}/{totalPages}</span>
        <button onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={page>=totalPages-1} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 cursor-pointer">Siguiente<i className="ri-arrow-right-line ml-1"/></button>
      </div>}
    </div>
  );
}

// Formula columns are global — same set for every zone/cluster in this module
const ALMACEN_COL_KEY = 'almacen_global';

// ── Distribution table (article-level) ────────────────────────────────────────
function TablaDistribucion({ formulaCtx, extraVars, activeZonas, filtros, refreshKey, expectedRows }: {
  formulaCtx: FormulaContext; extraVars: Record<string, number>; activeZonas: string[]; filtros: FiltroUbicacion[]; refreshKey: number; expectedRows: number;
}) {
  const [rows, setRows] = useState<InvRow[]>([]);
  const [ubicMap, setUbicMap] = useState<Record<string, UbicData>>({});
  const [volMap, setVolMap] = useState<Record<string, number>>({});  // articulo|compania → volume
  const [slotStats, setSlotStats] = useState<Record<string, any>>({});
  const [slotCostoCols, setSlotCostoCols] = useState<{id:string;nombre:string;formula:string}[]>([]);
  const [slotCostos, setSlotCostos] = useState<Record<string, Record<string, number>>>({});
  const [slotRawCols, setSlotRawCols] = useState<{id:string;nombre:string;formula:string;zona:string;tipo:string}[]>([]);
  const [slotTdMap, setSlotTdMap] = useState<Record<string, any>>({});
  const [slotCostosDebug, setSlotCostosDebug] = useState<Record<string, string>>({});
  const [pickingMatchMap, setPickingMatchMap] = useState<Record<string, PickingMatch>>({});
  const [pickingRpcOk, setPickingRpcOk] = useState<boolean|null>(null); // null=no intentado, true=ok, false=RPC no existe
  const [artUbicMap, setArtUbicMap] = useState<Record<string, ArtUbicData>>({});
  const [aggRows, setAggRows] = useState<AggRow[]>([]);
  const [artSlotCostMap, setArtSlotCostMap] = useState<Record<string, Record<string, number>>>({});
  const [showArtUbicTable, setShowArtUbicTable] = useState(false);
  const [loadStep, setLoadStep] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string>('FIXED:volumen');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');
  const [page, setPage] = useState(0);
  const [columnas, setColumnas] = useState<DistribCol[]>([]);
  const [addingCol, setAddingCol] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [editingFormula, setEditingFormula] = useState<{id:string;colIdx:number;formula:string;position:{top:number;left:number}}|null>(null);
  const [showUbicTable, setShowUbicTable] = useState(false);
  const [ubicRows, setUbicRows] = useState<any[]>([]);
  const PAGE = 200;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // Load rows + cross-reference data
  // NOTE: columns are loaded together with rows inside the async block below to avoid
  // the race condition where a separate columns effect overwrites mid-computation.
  useEffect(() => {
    if (!activeZonas.length) { setRows([]); setAggRows([]); setUbicMap({}); setColumnas([]); setVolMap({}); setPickingMatchMap({}); setPickingRpcOk(null); return; }
    // Clear stale state from the previous zone/cluster immediately
    setRows([]); setAggRows([]); setVolMap({}); setPickingMatchMap({}); setPickingRpcOk(null);
    setLoading(true);
    // Use JSON-returning functions — PostgREST max_rows does NOT apply to scalar/json returns
    const rpcAll = activeZonas.length > 1 ? 'fn_almacen_inv_zonas_all' : 'fn_almacen_inv_zona_all';
    const rpcParams = activeZonas.length > 1 ? { p_zonas: activeZonas } : { p_zona: activeZonas[0] };

    (async () => {
      setLoadStep(`Cargando inventario (${fmt(expectedRows)} filas esperadas)...`);
      // Single request — entire dataset as JSON, bypasses PostgREST max_rows
      const [{ data: invJson }, { data: colsData }] = await Promise.all([
        supabase.rpc(rpcAll, rpcParams),
        supabase.from('costos_almacen_inv_distribucion_columnas').select('*').eq('zona', ALMACEN_COL_KEY).order('orden'),
      ]);
      const invData: any[] = Array.isArray(invJson) ? invJson : [];

      const mapped: InvRow[] = ((invData ?? []) as any[]).map((r: any) => ({
        articulo: String(r.articulo ?? ''), ubicacion: String(r.ubicacion ?? ''),
        descripcion: String(r.descripcion ?? ''), zona_almacenaje: String(r.zona_almacenaje ?? ''),
        cantidad_unidades: Number(r.cantidad_unidades) || 0, cantidad_almacenaje: Number(r.cantidad_almacenaje) || 0,
        id_compania: String(r.id_compania ?? ''), compania: String(r.compania ?? ''),
        tipo_ubicacion: String(r.tipo_ubicacion ?? ''), estado: String(r.estado ?? ''),
      }));
      const activeFiltros = filtros.filter(f => f.activo && f.patron.trim());
      const filteredMapped = activeFiltros.length > 0
        ? mapped.filter(row => !activeFiltros.some(f => row.ubicacion.toUpperCase().includes(f.patron.toUpperCase())))
        : mapped;
      setRows(filteredMapped);
      setColumnas((colsData ?? []) as DistribCol[]);

      // Build ubicMap + ubicRows directly from filteredMapped (no extra RPC needed)
      const ubMapAcc: Record<string, {total:number;suma:number;suma_alm:number;comps:Set<string>}> = {};
      for (const r of filteredMapped) {
        const k = r.ubicacion;
        if (!ubMapAcc[k]) ubMapAcc[k] = {total:0,suma:0,suma_alm:0,comps:new Set()};
        ubMapAcc[k].total++;
        ubMapAcc[k].suma += r.cantidad_unidades;
        ubMapAcc[k].suma_alm += r.cantidad_almacenaje;
        ubMapAcc[k].comps.add(r.compania);
      }
      const ubMap: Record<string, UbicData> = {};
      const ubRowsArr: any[] = [];
      for (const [ubic, v] of Object.entries(ubMapAcc)) {
        ubMap[ubic] = { total_articulos: v.total, suma_cantidad: v.suma, suma_cantidad_alm: v.suma_alm, companias: [...v.comps].join(', ') };
        ubRowsArr.push({ ubicacion: ubic, total_articulos: v.total, suma_cantidad: v.suma, suma_cantidad_alm: v.suma_alm, companias: [...v.comps].join(', ') });
      }
      setUbicMap(ubMap);
      setUbicRows(ubRowsArr);

      // Build artUbicMap + aggRows: aggregate filtered rows by article
      const aMap: Record<string, {ubicSet: Set<string>; suma: number; aggRow: AggRow}> = {};
      for (const r of filteredMapped) {
        if (!aMap[r.articulo]) {
          aMap[r.articulo] = {
            ubicSet: new Set(),
            suma: 0,
            aggRow: { articulo: r.articulo, descripcion: r.descripcion, zona_almacenaje: r.zona_almacenaje, id_compania: r.id_compania, compania: r.compania, cantidad_unidades: 0, cantidad_almacenaje: 0, cantidad_ubicaciones: 0 },
          };
        }
        aMap[r.articulo].ubicSet.add(r.ubicacion);
        aMap[r.articulo].suma += r.cantidad_unidades;
        aMap[r.articulo].aggRow.cantidad_unidades += r.cantidad_unidades;
        aMap[r.articulo].aggRow.cantidad_almacenaje += r.cantidad_almacenaje;
      }
      const am: Record<string, ArtUbicData> = {};
      const aggArr: AggRow[] = [];
      for (const [art, v] of Object.entries(aMap)) {
        am[art] = { cantidad_ubicaciones: v.ubicSet.size, suma_cantidad: v.suma };
        aggArr.push({ ...v.aggRow, cantidad_ubicaciones: v.ubicSet.size });
      }
      setArtUbicMap(am);
      setAggRows(aggArr);

      setLoadStep(`Inventario: ${fmt(filteredMapped.length)} filas · ${fmt(aggArr.length)} artículos únicos. Cargando volumetría...`);

      // Load volumetria
      const articulos = [...new Set(filteredMapped.map(r => r.articulo).filter(Boolean))];
      if (articulos.length > 0) {
        const { data: volData, error: volErr } = await supabase.rpc('fn_almacen_volumetria_by_articulos', { p_articulos: articulos }).range(0, 99999);
        if (volErr) console.error('[costos-almacen] volumetría RPC error:', volErr.message);
        // Key: id_articulo only. Average across all rows (different companies) for same article.
        // The RPC already averages within each (article, company) group via AVG().
        const vmAcc: Record<string, {sum: number; count: number}> = {};
        for (const v of (volData ?? []) as any[]) {
          const art = String(v.id_articulo ?? '');
          const vol = Number(v.volumen) || 0;
          if (!vmAcc[art]) vmAcc[art] = { sum: 0, count: 0 };
          vmAcc[art].sum += vol;
          vmAcc[art].count++;
        }
        const vm: Record<string, number> = {};
        for (const [art, { sum, count }] of Object.entries(vmAcc)) vm[art] = count > 0 ? sum / count : 0;
        setVolMap(vm);
      }

      setLoadStep('Cargando Máximos/Mínimos (Zona Picking)...');
      // Load picking match data (Máximos, Mínimos, % Picking from Zona Picking)
      // Match key: Artículo ONLY — company IDs differ between inventario and zona_picking
      // (same rationale as volMap: picking params are intrinsic to the article, not the company)
      const articulosForPick = [...new Set(filteredMapped.map(r => r.articulo).filter(Boolean))];
      if (articulosForPick.length > 0) {
        const { data: pickData, error: pickErr } = await supabase.rpc('fn_picking_match_for_almacen', { p_articulos: articulosForPick }).range(0, 99999);
        if (pickErr) {
          setPickingRpcOk(false);
        } else {
          setPickingRpcOk(true);
          const pm: Record<string, PickingMatch> = {};
          for (const p of (pickData ?? []) as any[]) {
            const art = String(p.id_articulo ?? '');
            // Keep highest max if duplicate articles
            if (!pm[art] || Number(p.cant_maxima) > (pm[art].cant_maxima ?? 0)) {
              pm[art] = {
                cant_maxima: Number(p.cant_maxima) || 0,
                cant_minima: Number(p.cant_minima) || 0,
                pct_picking: Number(p.pct_picking) || 0,
              };
            }
          }
          setPickingMatchMap(pm);
        }
      }

      setLoadStep('Cargando costos de slots...');
      // Load slot stats
      const ubicaciones = [...new Set(filteredMapped.map(r => r.ubicacion).filter(Boolean))];
      if (ubicaciones.length > 0) {
        const { data: sData } = await supabase.rpc('fn_slot_stats_por_ubicacion', { p_ubicaciones: ubicaciones }).range(0, 99999);
        const sMap: Record<string, any> = {};
        for (const s of (sData ?? []) as any[]) sMap[String(s.ubicacion??'')] = { total:Number(s.total)||0, libres:Number(s.libres)||0, bloqueados:Number(s.bloqueados)||0, reservados:Number(s.reservados)||0, pct_libres:Number(s.pct_libres)||0, tipo_ubicacion:String(s.tipo_ubicacion??''), dimension:String(s.dimension??''), zona_almacenaje:String(s.zona_almacenaje??'') };
        setSlotStats(sMap);

        const zonasAlm = [...new Set(Object.values(sMap).map((v:any) => v.zona_almacenaje).filter(Boolean))];
        const [{ data: tdData }, { data: slotCols }] = await Promise.all([
          supabase.rpc('fn_slot_tipo_dim_stats', { p_zonas_almacenaje: zonasAlm }).range(0, 9999),
          supabase.from('costos_slots_tipo_columnas').select('id, nombre, formula, zona, tipo').not('formula', 'is', null),
        ]);
        // Aggregate by zona+tipo only — dimension is not part of the formula config
        const tdMap: Record<string, any> = {};
        for (const td of (tdData ?? []) as any[]) {
          const k = `${td.zona_almacenaje??''}|${td.tipo_ubicacion??''}`;
          if (!tdMap[k]) tdMap[k] = { total:0, libres:0, bloqueados:0, reservados:0, otros:0, zona_total:Number(td.zona_total)||0, pct_zona:0, pct_libres:0 };
          tdMap[k].total      += Number(td.total)||0;
          tdMap[k].libres     += Number(td.libres)||0;
          tdMap[k].bloqueados += Number(td.bloqueados)||0;
          tdMap[k].reservados += Number(td.reservados)||0;
          tdMap[k].otros      += Number(td.otros)||0;
        }
        for (const v of Object.values(tdMap) as any[]) {
          v.pct_zona   = v.zona_total > 0 ? (v.total  / v.zona_total) * 100 : 0;
          v.pct_libres = v.total      > 0 ? (v.libres / v.total)      * 100 : 0;
        }
        setSlotTdMap(tdMap);
        const rawCols = ((slotCols ?? []) as any[]).filter((c:any)=>c.formula?.trim()).map((c:any)=>({id:String(c.id),nombre:String(c.nombre),formula:String(c.formula),zona:String(c.zona??''),tipo:String(c.tipo??'')}));
        setSlotRawCols(rawCols);
        const seen2 = new Set<string>(); const uniqueCols: any[] = [];
        for (const c of rawCols) { if(!seen2.has(c.nombre)){seen2.add(c.nombre);uniqueCols.push({id:`name:${c.nombre}`,nombre:c.nombre,formula:c.formula});} }
        setSlotCostoCols(uniqueCols);
      }
      setLoadStep('');
      setLoading(false);
    })();
  }, [activeZonas.join(','), filtros.filter(f=>f.activo).map(f=>f.patron).join(','), refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute slot costs (needs systemVarMap)
  const systemVarDefs_sc = useMemo(():VariableDef[]=>{try{return buildVariableDefs(toAllDataSources(formulaCtx));}catch{return [];}},[ formulaCtx]);
  const systemVarMap_sc  = useMemo(():Record<string,number>=>{if(!systemVarDefs_sc.length)return{};try{return buildVariableMap(systemVarDefs_sc,toAllDataSources(formulaCtx));}catch{return {};}},[ formulaCtx,systemVarDefs_sc]);

  useEffect(() => {
    if (!Object.keys(slotStats).length || !slotRawCols.length || !Object.keys(slotTdMap).length) return;
    const zonaMatchFn = (colZ: string, ubZ: string) => colZ === ubZ || (colZ.startsWith('_cluster_') && colZ.includes(ubZ));
    const cosMap: Record<string, Record<string, number>> = {};
    const dbgMap: Record<string, string> = {};
    for (const [ubic, st] of Object.entries(slotStats)) {
      const td = slotTdMap[`${st.zona_almacenaje}|${st.tipo_ubicacion}`];
      if (!td) {
        dbgMap[ubic] = `Tipo: ${st.tipo_ubicacion||'—'} | Zona: ${st.zona_almacenaje||'—'}\n⚠ No hay slots registrados para este tipo en esta zona.\nVerifica que el tipo "${st.tipo_ubicacion||'—'}" exista en Conteo de Slots para la zona "${st.zona_almacenaje||'—'}".`;
        continue;
      }
      const vm = { TOTAL:td.total,LIBRES:td.libres,BLOQUEADOS:td.bloqueados,RESERVADOS:td.reservados,OTROS:td.otros,ZONA_TOTAL:td.zona_total,PCT_ZONA:td.pct_zona,PCT_LIBRES:td.pct_libres, TOTAL_TIPO:td.total,LIBRES_TIPO:td.libres,BLOQUEADOS_TIPO:td.bloqueados,RESERVADOS_TIPO:td.reservados,OTROS_TIPO:td.otros,PCT_TIPO_ZONA:td.pct_zona,PCT_LIBRES_TIPO:td.pct_libres,...systemVarMap_sc };
      cosMap[ubic] = {};
      const seen3 = new Set<string>();
      const lines: string[] = [`Tipo: ${st.tipo_ubicacion||'—'} | Zona: ${st.zona_almacenaje||'—'}`];
      for (const col of slotRawCols) {
        if (seen3.has(col.nombre)) continue;
        seen3.add(col.nombre);
        const best =
          slotRawCols.find(c => c.nombre===col.nombre && c.tipo===st.tipo_ubicacion && zonaMatchFn(c.zona, st.zona_almacenaje)) ??
          slotRawCols.find(c => c.nombre===col.nombre && !c.tipo && zonaMatchFn(c.zona, st.zona_almacenaje)) ??
          slotRawCols.find(c => c.nombre===col.nombre && c.tipo===st.tipo_ubicacion) ??
          slotRawCols.find(c => c.nombre===col.nombre && !c.tipo);
        if (!best) { lines.push(`⚠ ${col.nombre}: sin fórmula para tipo "${st.tipo_ubicacion||'—'}" / zona "${st.zona_almacenaje||'—'}"`); continue; }
        const ev = evalFormula(best.formula, vm);
        const val = ev.ok ? ev.value : 0;
        cosMap[ubic][`name:${col.nombre}`] = val;
        lines.push(val !== 0 ? `✓ ${col.nombre}: ${val.toFixed(2)}` : `⚠ ${col.nombre}: fórmula = 0 (expr: ${best.formula.slice(0,60)}${best.formula.length>60?'...':''})`);
      }
      dbgMap[ubic] = lines.join('\n');
    }
    setSlotCostos(cosMap);
    setSlotCostosDebug(dbgMap);
  }, [slotStats, slotRawCols, slotTdMap, systemVarMap_sc]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build article-level slot cost totals: sum over unique ubicaciones per article
  useEffect(() => {
    if (!rows.length || !slotCostoCols.length) { setArtSlotCostMap({}); return; }
    // Sum slot costs per article across UNIQUE ubicaciones (not an average).
    // Each raw row can repeat the same ubicacion (different companies/states), so we
    // deduplicate by ubicacion before summing to avoid inflating the total.
    const seenUbic: Record<string, Set<string>> = {};
    const acc: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      if (!seenUbic[r.articulo]) seenUbic[r.articulo] = new Set();
      if (seenUbic[r.articulo].has(r.ubicacion)) continue;
      seenUbic[r.articulo].add(r.ubicacion);
      if (!acc[r.articulo]) acc[r.articulo] = {};
      for (const col of slotCostoCols) {
        const tk = col.nombre.replace(/[^a-zA-Z0-9]/g,'_').toUpperCase();
        const v = slotCostos[r.ubicacion]?.[`name:${col.nombre}`] ?? 0;
        acc[r.articulo][tk] = (acc[r.articulo][tk] ?? 0) + v;
      }
    }
    setArtSlotCostMap(acc);
  }, [rows, slotCostos, slotCostoCols]); // eslint-disable-line react-hooks/exhaustive-deps

  const systemVarDefs = useMemo(():VariableDef[]=>{try{return buildVariableDefs(toAllDataSources(formulaCtx));}catch{return [];}},[ formulaCtx]);
  const systemVarMap  = useMemo(():Record<string,number>=>{if(!systemVarDefs.length)return{};try{return buildVariableMap(systemVarDefs,toAllDataSources(formulaCtx));}catch{return {};}},[ formulaCtx,systemVarDefs]);
  const colNameToToken = useCallback((n: string) => n.replace(/[^a-zA-Z0-9]/g,'_').toUpperCase(), []);

  // Article-level var map — rows are now aggregated per article
  const buildRowVarMap = useCallback((row: AggRow) => {
    const pick = pickingMatchMap[row.articulo] ?? { cant_maxima:0, cant_minima:0, pct_picking:0 };
    return {
      CANTIDAD_UNIDADES:  row.cantidad_unidades,
      CANTIDAD_ALMACENAJE: row.cantidad_almacenaje,
      VOLUMEN:            volMap[row.articulo] ?? 0,
      TOTAL_ARTICULOS:    row.cantidad_ubicaciones,
      SUMA_CANTIDAD_UBIC: row.cantidad_unidades,
      ZONA_TOTAL_ARTS:    aggRows.length,
      CANT_UBICACIONES:   row.cantidad_ubicaciones,
      UBICACIONES_ZONA:   Object.keys(ubicMap).length,
      SLOT_TOTAL: 0, SLOT_LIBRES: 0, SLOT_PCT_LIBRES: 0,
      ...(artSlotCostMap[row.articulo] ?? {}),
      CANT_MAXIMA:  pick.cant_maxima,
      CANT_MINIMA:  pick.cant_minima,
      PCT_PICKING:  pick.pct_picking,
      ...extraVars,
      ...systemVarMap,
    };
  }, [ubicMap, volMap, aggRows.length, pickingMatchMap, artSlotCostMap, extraVars, systemVarMap]);

  // Computed formula cells — one row per article (aggregated by article)
  const computedCols = useMemo(() => {
    const result: Record<string, Record<string, {value:number|null;error:boolean;isGlobal:boolean}>> = {};
    const accum: Record<string, Record<string, number>> = {};
    for (const r of aggRows) accum[r.articulo] = {};
    for (const col of columnas) {
      result[col.id] = {};
      const colT = colNameToToken(col.nombre);
      const f = col.formula?.trim();
      if (!f) {
        for (const r of aggRows) { accum[r.articulo][colT]=0; result[col.id][r.articulo]={value:null,error:false,isGlobal:false}; }
        continue;
      }
      for (const r of aggRows) {
        const k = r.articulo;
        const vm = { ...buildRowVarMap(r), ...accum[k] };
        const ev = evalFormula(f, vm);
        const val = ev.ok && isFinite(ev.value) ? ev.value : 0;
        accum[k][colT] = val ?? 0;
        result[col.id][k] = { value: val, error: false, isGlobal: false };
      }
    }
    return result;
  }, [columnas, rows, buildRowVarMap, colNameToToken]);

  const colOrder = useMemo(() => {
    const d = ['FIXED:articulo','FIXED:descripcion','FIXED:zona','FIXED:cant_ubic','FIXED:cantidad_unidades','FIXED:cantidad_almacenaje','FIXED:volumen','FIXED:compania',...columnas.map(c=>c.id)];
    return d;
  }, [columnas]);

  const footerTotals = useMemo(() => {
    const t: Record<string,number>={};
    for(const c of columnas) t[c.id]=aggRows.reduce((s,r)=>{const cv=computedCols[c.id]?.[r.articulo];return s+(cv?.value!=null?cv.value:0);},0);
    return t;
  },[columnas,computedCols,aggRows]);

  const deferredSearch = useDeferredValue(search);
  const filteredRows = useMemo(() => {
    if(!deferredSearch) return aggRows;
    const q=deferredSearch.toLowerCase();
    return aggRows.filter(r=>r.articulo.toLowerCase().includes(q)||r.descripcion.toLowerCase().includes(q)||r.compania.toLowerCase().includes(q));
  },[aggRows,deferredSearch]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a,b)=>{
      const dir=sortDir==='asc'?1:-1;
      if(sortKey==='FIXED:articulo')       return a.articulo.localeCompare(b.articulo)*dir;
      if(sortKey==='FIXED:cantidad_unidades')  return(a.cantidad_unidades-b.cantidad_unidades)*dir;
      if(sortKey==='FIXED:cantidad_almacenaje')return(a.cantidad_almacenaje-b.cantidad_almacenaje)*dir;
      if(sortKey==='FIXED:cant_ubic')      return(a.cantidad_ubicaciones-b.cantidad_ubicaciones)*dir;
      if(sortKey==='FIXED:volumen')        return((volMap[a.articulo]??0)-(volMap[b.articulo]??0))*dir;
      const matchedCol=columnas.find(c=>c.id===sortKey);
      if(matchedCol){return((computedCols[sortKey]?.[a.articulo]?.value??0)-(computedCols[sortKey]?.[b.articulo]?.value??0))*dir;}
      return(String((a as any)[sortKey]??'')<String((b as any)[sortKey]??'')?-1:String((a as any)[sortKey]??'')>String((b as any)[sortKey]??'')?1:0)*dir;
    });
  },[filteredRows,sortKey,sortDir,volMap,columnas,computedCols]);

  const totalPages = Math.ceil(sortedRows.length / PAGE);
  const paged = sortedRows.slice(page * PAGE, (page + 1) * PAGE);
  const toggleSort = (k: string) => { if(sortKey===k)setSortDir(d=>d==='asc'?'desc':'asc');else{setSortKey(k);setSortDir(columnas.some(c=>c.id===k)?'desc':'asc');}setPage(0); };
  const si = (k: string) => sortKey!==k?'ri-expand-up-down-line text-slate-300':sortDir==='asc'?'ri-sort-asc text-slate-700':'ri-sort-desc text-slate-700';

  const addCol = async () => {
    if(!newColName.trim())return;
    const{data,error}=await supabase.from('costos_almacen_inv_distribucion_columnas').insert({nombre:newColName.trim(),orden:columnas.length,zona:ALMACEN_COL_KEY}).select().maybeSingle();
    if(error){alert(`Error: ${error.message}`);return;}
    if(data)setColumnas(prev=>[...prev,data as DistribCol]);
    setNewColName('');setAddingCol(false);
  };
  const deleteCol = async (id:string) => {
    if(!confirm('¿Eliminar?'))return;
    await supabase.from('costos_almacen_inv_distribucion_columnas').delete().eq('id',id);
    setColumnas(prev=>prev.filter(c=>c.id!==id));
  };
  const saveFormula = async (formula:string) => {
    if(!editingFormula)return;
    const col=columnas.find(c=>c.id===editingFormula.id);
    await supabase.from('costos_almacen_inv_distribucion_columnas').update({formula:formula||null}).eq('id',editingFormula.id);
    logChange({modulo:'costos-almacen',accion:'update_formula',entidad_tipo:'costos_almacen_inv_distribucion_columnas',entidad_id:editingFormula.id,entidad_label:col?.nombre,campo:'formula',valor_antes:col?.formula??null,valor_despues:formula||null});
    setColumnas(prev=>prev.map(c=>c.id===editingFormula.id?{...c,formula:formula||undefined}:c));
    setEditingFormula(null);
  };
  const handleDragEnd = useCallback((event:DragEndEvent)=>{const{active,over}=event;if(!over||active.id===over.id)return;const cur=colOrder;const oi=cur.indexOf(String(active.id));const ni=cur.indexOf(String(over.id));if(oi===-1||ni===-1)return;},[colOrder]);

  const handleExport = useCallback(() => {
    const fmtN = (n: number|null|undefined) => n != null ? Math.round(n*100)/100 : '';
    // Sheet 1 — main data
    const fixedHeaders = ['Artículo','Descripción','Zona Almacenaje','Cant. Ubicaciones','Σ Cant. Unidades','Σ Cant. Alm.','Volumen','Compañía'];
    const colHeaders = columnas.map(c => c.nombre);
    const headers1 = [...fixedHeaders, ...colHeaders];
    const rows1 = sortedRows.map(r => [
      r.articulo, r.descripcion, r.zona_almacenaje, r.cantidad_ubicaciones,
      r.cantidad_unidades, r.cantidad_almacenaje, fmtN(volMap[r.articulo] ?? 0), r.compania,
      ...columnas.map(c => fmtN(computedCols[c.id]?.[r.articulo]?.value)),
    ]);
    // Sheet 2 — formula details
    const headers2 = ['Columna','Expresión','Ejemplo (primer artículo)'];
    const sampleArt = sortedRows[0]?.articulo ?? '';
    const rows2 = columnas.map(c => [
      c.nombre,
      c.formula ?? '(sin fórmula)',
      fmtN(computedCols[c.id]?.[sampleArt]?.value),
    ]);
    downloadExcelMultiSheet(`costos_almacen_${activeZonas.join('_').slice(0,40)}.xlsx`, [
      { name: 'Datos', headers: headers1, rows: rows1 },
      ...(rows2.length > 0 ? [{ name: 'Fórmulas', headers: headers2, rows: rows2 }] : []),
    ]);
  }, [sortedRows, columnas, computedCols, volMap, activeZonas]);

  if(loading)return(
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"/>
      {loadStep && (
        <p className="text-xs text-slate-500 text-center max-w-xs px-4">{loadStep}</p>
      )}
    </div>
  );

  return(
    <div className="space-y-3">
      {/* Stats */}
      {(() => {
        const totalArts = aggRows.length;
        const artsConVol = aggRows.filter(r=>volMap[r.articulo]>0).length;
        const artsConPick = aggRows.filter(r=>pickingMatchMap[r.articulo]?.cant_maxima>0).length;
        const pctVol = totalArts>0?Math.round(artsConVol*100/totalArts):0;
        const pctPick = totalArts>0?Math.round(artsConPick*100/totalArts):0;
        return (
          <div className="space-y-2">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-teal-50 border border-teal-100 rounded-lg px-3 py-2.5"><p className="text-xs text-teal-600">Artículos únicos</p><p className="text-base font-bold text-teal-700">{fmt(totalArts)}<span className="text-xs font-normal text-teal-400 ml-1">· {Object.keys(ubicMap).length} ubic.</span></p></div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5"><p className="text-xs text-slate-500">Σ Cant. Unidades</p><p className="text-base font-bold text-slate-700">{fmt(aggRows.reduce((s,r)=>s+r.cantidad_unidades,0))}</p></div>
              <div className="bg-cyan-50 border border-cyan-100 rounded-lg px-3 py-2.5">
                <p className="text-xs text-cyan-600">Σ Volumen <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${pctVol>=80?'bg-green-100 text-green-700':pctVol>=50?'bg-amber-100 text-amber-700':'bg-rose-100 text-rose-700'}`}>{artsConVol}/{totalArts} arts.</span></p>
                <p className="text-base font-bold text-cyan-700">{fmtVol(aggRows.reduce((s,r)=>s+(volMap[r.articulo]??0),0))}</p>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                <p className="text-xs text-slate-500">Picking <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${pctPick>=80?'bg-green-100 text-green-700':pctPick>=50?'bg-amber-100 text-amber-700':'bg-rose-100 text-rose-700'}`}>{artsConPick}/{totalArts} arts.</span></p>
                <p className="text-base font-bold text-slate-700">{pctPick}% cobertura</p>
              </div>
            </div>
            {(pctVol<80||pctPick<80) && (
              <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                <i className="ri-information-line mr-1"/>Artículos sin cobertura no muestran datos en esas columnas. Tabla ordenada por Volumen descendente — primero los que tienen datos.
              </p>
            )}
          </div>
        );
      })()}

      {/* Formula columns panel */}
      <div className="bg-white border border-teal-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-teal-100 bg-teal-50 flex items-center justify-between">
          <div><p className="text-xs font-semibold text-teal-700">Columnas de fórmula por artículo</p><p className="text-[10px] text-teal-400 mt-0.5">{ALMACEN_TOKENS.slice(0,4).map(t=>t.token).join(' · ')}</p></div>
          {!addingCol && <div className="flex items-center gap-2">
            <button onClick={handleExport} className="flex items-center gap-1 px-3 py-1.5 border border-teal-300 text-teal-700 hover:bg-teal-50 text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap"><i className="ri-file-excel-2-line"/>Descargar .xlsx</button>
            <button onClick={()=>setAddingCol(true)} className="flex items-center gap-1 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap"><i className="ri-add-line"/>Agregar columna</button>
          </div>}
        </div>
        {addingCol && <div className="px-4 py-3 border-b border-teal-100 bg-teal-50/50 flex items-center gap-3"><input type="text" value={newColName} onChange={e=>setNewColName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addCol();if(e.key==='Escape'){setAddingCol(false);setNewColName('');}}} placeholder="Nombre (ej: Costo por artículo)" className="flex-1 px-3 py-1.5 text-sm border border-teal-300 rounded-lg focus:outline-none bg-white" autoFocus/><button onClick={addCol} disabled={!newColName.trim()} className="px-3 py-1.5 bg-teal-500 hover:bg-teal-600 disabled:opacity-40 text-white text-xs rounded-lg cursor-pointer">Crear</button><button onClick={()=>{setAddingCol(false);setNewColName('');}} className="px-3 py-1.5 text-slate-500 hover:bg-slate-100 text-xs rounded-lg cursor-pointer">Cancelar</button></div>}
        {columnas.length === 0 && !addingCol ? <p className="px-4 py-4 text-center text-slate-400 text-xs">Sin columnas. Agrega una con fórmula.</p> : (
          <div className="flex flex-wrap gap-2 px-4 py-3">
            {columnas.map(col=>{const sRow=rows[0];const sKey=sRow?`${sRow.articulo}|${sRow.ubicacion}|${sRow.id_compania}`:'';const sVal=sRow?computedCols[col.id]?.[sKey]?.value:undefined;return(
              <div key={col.id} className="flex items-center gap-2 bg-white border border-teal-200 rounded-lg px-3 py-2">
                <span className="text-xs font-medium text-teal-700">{col.nombre}</span>
                {sVal!=null&&<span className="text-sm font-bold text-slate-800 tabular-nums">{fmtDec(sVal)}</span>}
                <span className="text-[10px] text-slate-400 italic max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap">{col.formula?col.formula.slice(0,30)+(col.formula.length>30?'...':''):'sin fórmula'}</span>
                <button onClick={e=>{const rect=(e.currentTarget as HTMLElement).getBoundingClientRect();const colIdx=columnas.findIndex(c=>c.id===col.id);setEditingFormula({id:col.id,colIdx,formula:col.formula??'',position:{top:rect.bottom+4,left:Math.max(8,rect.left-250)}});}} className="w-6 h-6 flex items-center justify-center rounded text-teal-400 hover:text-teal-600 hover:bg-teal-100 cursor-pointer"><i className="ri-functions text-xs"/></button>
                <button onClick={()=>deleteCol(col.id)} className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-rose-500 hover:bg-rose-50 cursor-pointer"><i className="ri-delete-bin-line text-xs"/></button>
              </div>
            );})}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 min-w-[200px]"><div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><i className="ri-search-line text-sm text-slate-400"/></div><input type="text" placeholder="Buscar artículo, ubicación, descripción..." value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-100 focus:border-teal-300 outline-none bg-white placeholder:text-slate-400"/></div>
        <span className="text-xs text-slate-400 whitespace-nowrap">{filteredRows.length.toLocaleString('es-CO')} filas</span>
      </div>

      {/* Main table */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="border border-slate-200 rounded-lg overflow-auto max-h-[65vh]">
          <table className="text-xs whitespace-nowrap w-full">
            <thead>
              <tr className="bg-slate-50 sticky top-0 z-10">
                <SortableContext items={colOrder} strategy={horizontalListSortingStrategy}>
                  {([
                    {k:'FIXED:articulo',l:'Artículo',s:true},
                    {k:'FIXED:descripcion',l:'Descripción',s:false},
                    {k:'FIXED:zona',l:'Zona Almacenaje',s:false},
                    {k:'FIXED:cant_ubic',l:'Cant. Ubic.',s:true},
                    {k:'FIXED:cantidad_unidades',l:'Σ Cant. Unid.',s:true},
                    {k:'FIXED:cantidad_almacenaje',l:'Σ Cant. Alm.',s:true},
                    {k:'FIXED:volumen',l:'Volumen',s:true},
                    {k:'FIXED:compania',l:'Compañía',s:false},
                  ] as {k:string;l:string;s:boolean}[]).map(h=>(
                    <SFH key={h.k} id={h.k} className={`px-3 py-2.5 text-left font-semibold border-r border-slate-200 bg-slate-50 ${h.k==='FIXED:cant_ubic'?'text-violet-600 bg-violet-50/80':'text-slate-500'}`}>
                      {h.s?<span onClick={()=>toggleSort(h.k)} className="cursor-pointer hover:text-slate-700 flex items-center gap-1">{h.l}<i className={`${si(h.k)} ml-0.5`}/></span>:<span>{h.l}</span>}
                    </SFH>
                  ))}
                  {columnas.map(col=><SCH key={col.id} col={col} onDelete={deleteCol} onEditFormula={(c,e)=>{const rect=(e.currentTarget as HTMLElement).getBoundingClientRect();const ci=columnas.findIndex(x=>x.id===c.id);setEditingFormula({id:c.id,colIdx:ci,formula:c.formula??'',position:{top:rect.bottom+4,left:Math.max(8,rect.left-250)}});}} onRename={async(id,n)=>{await supabase.from('costos_almacen_inv_distribucion_columnas').update({nombre:n}).eq('id',id);setColumnas(prev=>prev.map(c=>c.id===id?{...c,nombre:n}:c));}} onSort={()=>toggleSort(col.id)} sortIconClass={si(col.id)}/>)}
                </SortableContext>
                <th className="px-1 py-2.5 bg-slate-50">{addingCol?<div className="flex items-center gap-1 px-1"><input type="text" value={newColName} onChange={e=>setNewColName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addCol();if(e.key==='Escape'){setAddingCol(false);setNewColName('');}}} placeholder="Nombre..." className="w-[100px] px-2 py-1 text-xs border border-teal-300 rounded-md focus:outline-none bg-white" autoFocus/><button onClick={addCol} disabled={!newColName.trim()} className="w-6 h-6 flex items-center justify-center rounded-md bg-teal-500 text-white cursor-pointer disabled:opacity-50"><i className="ri-check-line text-xs"/></button><button onClick={()=>{setAddingCol(false);setNewColName('');}} className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 cursor-pointer"><i className="ri-close-line text-xs"/></button></div>:<button onClick={()=>setAddingCol(true)} className="w-8 h-8 flex items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-teal-400 hover:text-teal-500 hover:bg-teal-50 cursor-pointer transition-all"><i className="ri-add-line text-sm"/></button>}</th>
              </tr>
            </thead>
            <tbody>
              {paged.length===0?<tr><td colSpan={colOrder.length+1} className="px-3 py-10 text-center text-slate-400">{search?'Sin resultados':'Sin datos'}</td></tr>
              :paged.map((row,ai)=>{
                const vol=volMap[row.articulo]??0;
                return(
                  <tr key={row.articulo+ai} className={`border-t border-slate-100 hover:bg-teal-50/40 ${ai%2===0?'bg-white':'bg-slate-50/30'}`}>
                    <td className="px-3 py-1.5 font-medium text-teal-700 border-r border-slate-100">{row.articulo||'—'}</td>
                    <td className="px-3 py-1.5 text-slate-600 border-r border-slate-100 max-w-[220px] overflow-hidden text-ellipsis" title={row.descripcion}>{row.descripcion||'—'}</td>
                    <td className="px-3 py-1.5 text-slate-400 border-r border-slate-100 max-w-[180px] overflow-hidden text-ellipsis text-[11px]">{row.zona_almacenaje||'—'}</td>
                    <td className="px-3 py-1.5 text-right border-r border-slate-100 bg-violet-50/40">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-10 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0"><div className="h-full bg-violet-400 rounded-full" style={{width:`${Object.keys(ubicMap).length>0?Math.min((row.cantidad_ubicaciones/Math.max(...aggRows.map(r=>r.cantidad_ubicaciones),1))*100,100):0}%`}}/></div>
                        <span className="font-bold text-violet-700 tabular-nums text-sm">{row.cantidad_ubicaciones}</span>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right font-medium text-slate-700 border-r border-slate-100">{fmt(row.cantidad_unidades)}</td>
                    <td className="px-3 py-1.5 text-right text-slate-500 border-r border-slate-100">{fmt(row.cantidad_almacenaje)}</td>
                    <td className="px-3 py-1.5 text-right border-r border-slate-100"><span className={`font-medium tabular-nums ${vol>0?'text-cyan-700':'text-slate-400'}`}>{fmtVol(vol)}</span></td>
                    <td className="px-3 py-1.5 text-slate-500 border-r border-slate-100">{row.compania||'—'}</td>
                    {columnas.map(col=>{const cell=computedCols[col.id]?.[row.articulo];const hasF=!!col.formula?.trim();return<td key={col.id} onClick={e=>{const rect=(e.currentTarget as HTMLElement).getBoundingClientRect();const ci=columnas.findIndex(c=>c.id===col.id);setEditingFormula({id:col.id,colIdx:ci,formula:col.formula??'',position:{top:rect.bottom+4,left:Math.max(8,rect.left-250)}});}} className={`px-3 py-1.5 text-right border-r border-slate-100 cursor-pointer transition-colors ${hasF?'hover:bg-teal-100/60':'hover:bg-slate-100'}`}>{hasF?cell?.value!=null?<span className="text-teal-700 font-bold tabular-nums">{fmtDec(cell.value!)}</span>:<span className="text-slate-300">—</span>:<span className="text-slate-300 text-[10px]">—</span>}</td>;})}
                    <td className="px-1 py-1.5"/>
                  </tr>
                );
              })}
            </tbody>
            {paged.length>0&&(<tfoot><tr className="border-t-2 border-slate-200 bg-slate-100/80">
              <td className="px-3 py-2 font-semibold text-slate-600 text-xs" colSpan={2}>{filteredRows.length.toLocaleString('es-CO')} artículos</td>
              <td className="px-3 py-2 border-r border-slate-100"/>
              <td className="px-3 py-2 text-right border-r border-slate-100 bg-violet-50/40"><span className="text-xs font-bold text-violet-700">{fmt(filteredRows.reduce((s,r)=>s+r.cantidad_ubicaciones,0))}</span></td>
              <td className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-slate-700">{fmt(filteredRows.reduce((s,r)=>s+r.cantidad_unidades,0))}</span></td>
              <td className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-slate-600">{fmt(filteredRows.reduce((s,r)=>s+r.cantidad_almacenaje,0))}</span></td>
              <td className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-cyan-700">{fmtVol(filteredRows.reduce((s,r)=>s+(volMap[r.articulo]??0),0))}</span></td>
              <td className="px-3 py-2 border-r border-slate-100"/>
              {columnas.map(col=><td key={`cf_${col.id}`} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-teal-700">{fmtDec(footerTotals[col.id]??0)}</span></td>)}
              <td className="px-1 py-2"/>
            </tr></tfoot>)}
          </table>
        </div>
      </DndContext>

      {totalPages>1&&<div className="flex items-center justify-between gap-3 pt-1"><span className="text-xs text-slate-400">{page*PAGE+1}–{Math.min((page+1)*PAGE,sortedRows.length)} de {sortedRows.length}</span><div className="flex items-center gap-1"><button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 cursor-pointer whitespace-nowrap"><i className="ri-arrow-left-s-line"/>Anterior</button><button onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={page>=totalPages-1} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 cursor-pointer whitespace-nowrap">Siguiente<i className="ri-arrow-right-s-line"/></button></div></div>}

      {/* Collapsible: Artículos × Ubicaciones (NEW — article is primary, locations are counted) */}
      {(() => {
        const artUbicRows = Object.entries(artUbicMap)
          .map(([art, v]) => {
            const sample = rows.find(r => r.articulo === art);
            return { articulo: art, descripcion: sample?.descripcion ?? '', compania: sample?.compania ?? '', ...v };
          })
          .sort((a, b) => b.cantidad_ubicaciones - a.cantidad_ubicaciones);
        const totalUbic = Object.keys(ubicMap).length;
        return (
          <div className="mt-3 border-t border-slate-200 pt-3">
            <button onClick={()=>setShowArtUbicTable(v=>!v)} className="flex items-center gap-2 px-4 py-2.5 w-full bg-violet-50 hover:bg-violet-100 border border-violet-200 rounded-xl text-sm font-medium text-violet-700 transition-colors cursor-pointer">
              <i className="ri-bar-chart-box-line text-sm"/>
              <span>Cantidad de ubicaciones por artículo</span>
              <span className="text-[11px] text-violet-400 font-normal ml-1">· {artUbicRows.length} artículos · {totalUbic} ubicaciones (filtros activos)</span>
              <i className={`ri-arrow-${showArtUbicTable?'up':'down'}-s-line text-violet-400 ml-auto`}/>
            </button>
            {showArtUbicTable && (
              <div className="mt-3 border border-violet-200 rounded-lg overflow-auto max-h-[55vh]">
                <table className="text-xs whitespace-nowrap w-full">
                  <thead>
                    <tr className="bg-violet-50 sticky top-0 z-10">
                      <th className="px-3 py-2.5 text-left text-violet-600 font-semibold border-r border-violet-100">Artículo</th>
                      <th className="px-3 py-2.5 text-left text-violet-600 font-semibold border-r border-violet-100 max-w-[260px]">Descripción</th>
                      <th className="px-3 py-2.5 text-right text-violet-600 font-semibold border-r border-violet-100 cursor-pointer hover:bg-violet-100" title="Variable disponible: {CANT_UBICACIONES}">
                        <i className="ri-map-pin-line mr-1"/>Cant. Ubic. <code className="ml-1 text-[9px] bg-violet-100 px-1 rounded">{'{CANT_UBICACIONES}'}</code>
                      </th>
                      <th className="px-3 py-2.5 text-right text-violet-600 font-semibold border-r border-violet-100">Σ Cant. Unidades</th>
                      <th className="px-3 py-2.5 text-left text-violet-600 font-semibold">Compañía</th>
                    </tr>
                  </thead>
                  <tbody>
                    {artUbicRows.map((r, i) => (
                      <tr key={r.articulo+i} className={`border-t border-slate-100 hover:bg-violet-50/50 ${i%2===0?'bg-white':'bg-slate-50/30'}`}>
                        <td className="px-3 py-2 font-medium text-violet-700 border-r border-slate-100">{r.articulo||'—'}</td>
                        <td className="px-3 py-2 text-slate-600 border-r border-slate-100 max-w-[260px] overflow-hidden text-ellipsis" title={r.descripcion}>{r.descripcion||'—'}</td>
                        <td className="px-3 py-2 text-right border-r border-slate-100">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-violet-400 rounded-full" style={{width:`${totalUbic>0?Math.min((r.cantidad_ubicaciones/Math.max(...artUbicRows.map(x=>x.cantidad_ubicaciones),1))*100,100):0}%`}}/>
                            </div>
                            <span className="font-bold text-violet-700 w-6 text-right">{r.cantidad_ubicaciones}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-600 border-r border-slate-100">{fmt(r.suma_cantidad)}</td>
                        <td className="px-3 py-2 text-slate-400">{r.compania||'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-100/80">
                      <td className="px-3 py-2 font-semibold text-slate-600 text-xs" colSpan={2}>{artUbicRows.length} artículos únicos</td>
                      <td className="px-3 py-2 text-right text-xs font-bold text-violet-700">{totalUbic} ubic. totales</td>
                      <td className="px-3 py-2 text-right text-xs font-bold text-slate-700">{fmt(artUbicRows.reduce((s,r)=>s+r.suma_cantidad,0))}</td>
                      <td className="px-3 py-2"/>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* Collapsible ubicacion table (existing — location is primary, articles are counted) */}
      <div className="mt-3 border-t border-slate-200 pt-3">
        <button onClick={()=>setShowUbicTable(v=>!v)} className="flex items-center gap-2 px-4 py-2.5 w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 transition-colors cursor-pointer">
          <i className={`ri-${showUbicTable?'subtract':'add'}-line text-sm`}/>{showUbicTable?'Ocultar':'Ver'} tabla de artículos por ubicación<i className={`ri-arrow-${showUbicTable?'up':'down'}-s-line text-slate-400 ml-auto`}/>
        </button>
        {showUbicTable && (
          <div className="mt-3 border border-slate-200 rounded-lg overflow-auto max-h-[50vh]">
            <table className="text-xs whitespace-nowrap w-full">
              <thead><tr className="bg-slate-50 sticky top-0 z-10"><th className="px-3 py-2.5 text-left text-slate-500 font-semibold border-r border-slate-200">Ubicación</th><th className="px-3 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200">Artículos</th><th className="px-3 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200">Σ Cant.</th><th className="px-3 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200">Σ Cant. Alm.</th>{slotCostoCols.map(col=><th key={col.id} className="px-3 py-2.5 text-right text-teal-600 font-semibold border-r border-slate-200 bg-teal-50/50">{col.nombre}</th>)}<th className="px-3 py-2.5 text-left text-slate-500 font-semibold">Compañías</th></tr></thead>
              <tbody>{ubicRows.map((r:any,i:number)=><tr key={r.ubicacion+i} className={`border-t border-slate-100 hover:bg-teal-50/40 ${i%2===0?'bg-white':'bg-slate-50/30'}`}><td className="px-3 py-2 font-mono text-[11px] text-slate-700 border-r border-slate-100 font-medium">{r.ubicacion||'—'}</td><td className="px-3 py-2 text-right font-bold text-teal-700 border-r border-slate-100">{fmt(r.total_articulos)}</td><td className="px-3 py-2 text-right text-slate-600 border-r border-slate-100">{fmt(r.suma_cantidad)}</td><td className="px-3 py-2 text-right text-slate-500 border-r border-slate-100">{fmt(r.suma_cantidad_alm)}</td>{slotCostoCols.map(col=>{const val=slotCostos[r.ubicacion]?.['name:'+col.nombre]??0;const dbg=slotCostosDebug[r.ubicacion]??(Object.keys(slotStats).length>0?'⚠ Esta ubicación no tiene costo de slot asignado.\nPosible causa: el código de ubicación del inventario no coincide con el código registrado en Costos por Slot, o aún no tiene un slot configurado para esta zona.':'');return(<td key={col.id} title={dbg} className={`px-3 py-2 text-right border-r border-slate-100 cursor-help ${val>0?'font-bold text-teal-700':slotCostosDebug[r.ubicacion]?'text-amber-500':'text-rose-400'}`}>{fmtDec(val)}</td>);})}<td className="px-3 py-2 text-slate-400 max-w-[200px] overflow-hidden text-ellipsis">{r.companias||'—'}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* Formula editor */}
      {editingFormula && (() => {
        const sRow = aggRows[0] ?? null;
        const sKey = sRow ? sRow.articulo : '';
        const prevCols = editingFormula.colIdx > 0 ? columnas.slice(0, editingFormula.colIdx) : [];
        const prevColTokens = prevCols.map(pc => ({ token: colNameToToken(pc.nombre), label: pc.nombre+' (col. anterior)', value: sRow ? (computedCols[pc.id]?.[sKey]?.value ?? undefined) : undefined }));
        const slotCostTokens: {token:string;label:string;value:number}[] = [];
        const pickRow = sRow ? pickingMatchMap[sRow.articulo] : undefined;
        const pickingTokens = [
          { token: 'CANT_MAXIMA', label: 'Cantidad Máxima (Picking)', value: pickRow?.cant_maxima ?? 0 },
          { token: 'CANT_MINIMA', label: 'Cantidad Mínima (Picking)', value: pickRow?.cant_minima ?? 0 },
          { token: 'PCT_PICKING',  label: '% Picking (Zona Picking)',  value: pickRow?.pct_picking ?? 0 },
        ];
        const allTokens = [
          ...ALMACEN_TOKENS.map(t => ({ token: t.token.replace(/\{|\}/g,''), label: t.label, value: sRow ? (buildRowVarMap(sRow) as any)[t.token.replace(/\{|\}/g,'')] : undefined })),
          ...slotCostTokens,
          ...pickingTokens,
          ...prevColTokens,
        ];
        const prevVars = Object.fromEntries(prevCols.map(pc => [colNameToToken(pc.nombre), computedCols[pc.id]?.[sKey]?.value ?? 0]));
        const enrichedVarMap = sRow ? { ...buildRowVarMap(sRow), ...prevVars } : systemVarMap;
        return (
          <ZonaCeldaFormulaEditor
            formula={editingFormula.formula}
            varMap={enrichedVarMap}
            onSave={saveFormula}
            onCancel={() => setEditingFormula(null)}
            position={editingFormula.position}
            systemVarDefs={systemVarDefs}
            systemVarMap={systemVarMap}
            columnTokens={allTokens}
          />
        );
      })()}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CostosAlmacenPage() {
  const [masivoInfo, setMasivoInfo] = useState<MasivoInfo | null>(null);
  const [loading, setLoading]       = useState(true);
  const [showInvUpload, setShowInvUpload] = useState(false);
  const [showVolUpload, setShowVolUpload] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [clearing, setClearing]     = useState(false);
  const [tab, setTab]               = useState<Tab>('resumen');
  const [zonaResumen, setZonaResumen] = useState<ZonaResumen[]>([]);
  const [globalTotals, setGlobalTotals] = useState<{total_registros:number;total_zonas:number;total_articulos:number;cantidad_total:number}|null>(null);
  const [formulaCtx, setFormulaCtx] = useState<FormulaContext>(EMPTY_FORMULA_CTX);
  const [varColValues, setVarColValues] = useState<Record<string,number>>({});
  const [dataTab, setDataTab] = useState<'inventario'|'volumetria'>('inventario');
  const [filtros, setFiltros] = useState<FiltroUbicacion[]>([]);
  const [newPatron, setNewPatron] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [savingFiltro, setSavingFiltro] = useState(false);

  const [activeSelection, setActiveSelection] = useState<ActiveSelection>({ type: 'zone', zona: '' });
  const [showUbicTable, setShowUbicTable] = useState(false);
  const isCluster = activeSelection.type === 'cluster';
  const activeZona = activeSelection.type === 'zone' ? activeSelection.zona : '';
  const activeCluster = activeSelection.type === 'cluster' ? activeSelection.cluster : null;
  const activeZonas = isCluster ? (activeCluster?.zonas ?? []) : (activeZona ? [activeZona] : []);
  const zonaLabel = isCluster ? (activeCluster?.nombre ?? 'Cluster') : activeZona;
  // Sum of total_articulos (row count) for active zones — used by TablaDistribucion to parallelize fetching
  const expectedRows = useMemo(
    () => activeZonas.reduce((s, z) => s + (zonaResumen.find(r => r.zona === z)?.total_articulos ?? 0), 0),
    [activeZonas, zonaResumen]
  );

  const { clusters, loadClusters } = useZonaClusters('costos_almacen_inv_clusters');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
    const { count: invCount } = await supabase.from('costos_almacen_inventario_raw').select('*', { count: 'exact', head: true });
    const { count: volCount } = await supabase.from('costos_almacen_volumetria_raw').select('*', { count: 'exact', head: true });
    if (!invCount || invCount === 0) { setMasivoInfo(null); setLoading(false); return; }
    const { data: sample } = await supabase.from('costos_almacen_inventario_raw').select('raw_data').limit(1).single();
    setMasivoInfo({ totalRegistros: invCount, headers: sample?.raw_data ? Object.keys(sample.raw_data as Record<string,unknown>) : [], volRecords: volCount ?? 0 });

    const [{ data: totRaw }, { data: zonRaw }, base] = await Promise.all([
      supabase.rpc('fn_almacen_inv_totales'),
      supabase.rpc('fn_almacen_inv_zona_resumen'),
      fetchBaseQueryData(),
    ]);
    const t0 = (totRaw as any[])?.[0] ?? {};
    setGlobalTotals({ total_registros:Number(t0.total_registros)||0, total_zonas:Number(t0.total_zonas)||0, total_articulos:Number(t0.total_articulos)||0, cantidad_total:Number(t0.cantidad_total)||0 });
    const zonas = ((zonRaw ?? []) as any[]).map((r:any) => ({ zona:String(r.zona??''), total_articulos:Number(r.total_articulos)||0, ubicaciones_distintas:Number(r.ubicaciones_distintas)||0, companias_distintas:Number(r.companias_distintas)||0, cantidad_total:Number(r.cantidad_total)||0 }));
    setZonaResumen(zonas);

    // Build formulaCtx (same enrichment as other modules)
    const { areasData,invData,gastosColData,gastosFilData,areaDistribData,moColData,moFilData,volColData,volFilData,empData,volDistData,factoresData } = base as any;
    const [{ data: cosColData }, { data: cosFilData }] = await Promise.all([supabase.from('costos_columnas').select('*').order('orden'), supabase.from('costos_operacion').select('*').order('orden')]);
    const areasWithCat = ((areasData??[]) as any[]).map((a:any) => ({ nombre:a.nombre,metros_cuadrados:a.metros_cuadrados??0,metros_cubicos:a.metros_cubicos??0,cantidad_racks:a.cantidad_racks??0,categoria:a.categoria,costo_area:a.costo_area??0,costo_area_formula:a.costo_area_formula }));
    const catTotals: Record<string,number>={};const catTotalsCubic: Record<string,number>={};let totalM3=0;
    areasWithCat.forEach((a:any)=>{const c=a.categoria??'Sin categoría';catTotals[c]=(catTotals[c]??0)+(a.metros_cuadrados??0);catTotalsCubic[c]=(catTotalsCubic[c]??0)+(a.metros_cubicos??0);totalM3+=a.metros_cubicos??0;});
    const enrichedAreaDist = ((areaDistribData??[]) as any[]).map((d:any)=>{ const match=areasWithCat.find((a:any)=>a.nombre===d.area_name);const cat=match?.categoria??'Sin categoría';const m2=match?.metros_cuadrados??0;const m3=match?.metros_cubicos??0;const ct=catTotals[cat]??0;const ctc=catTotalsCubic[cat]??0;return{...d,categoria:cat,category_distribution_percentage:ct>0?+((m2/ct)*100).toFixed(2):0,global_distribution_cubic_percentage:totalM3>0?+((m3/totalM3)*100).toFixed(2):0,category_distribution_cubic_percentage:ctc>0?+((m3/ctc)*100).toFixed(2):0}; });
    const baseCtx: FormulaContext = { inversiones:(invData as InversionRecord[])??[], gastosColumnas:(gastosColData??[]) as FormulaContext['gastosColumnas'], gastosFilas:(gastosFilData??[]) as FormulaContext['gastosFilas'], areaDistribucion:enrichedAreaDist as FormulaContext['areaDistribucion'], manoObraColumnas:(moColData??[]) as FormulaContext['manoObraColumnas'], manoObraFilas:(moFilData??[]) as FormulaContext['manoObraFilas'], manoObraEmpleados:(empData??[]) as FormulaContext['manoObraEmpleados'], volumenesColumnas:(volColData??[]) as FormulaContext['volumenesColumnas'], volumenesFilas:(volFilData??[]) as FormulaContext['volumenesFilas'], costosColumnas:(cosColData??[]) as FormulaContext['costosColumnas'], costosFilas:(cosFilData??[]) as FormulaContext['costosFilas'], areasData:areasWithCat.map((a:any)=>({nombre:a.nombre,metros_cuadrados:a.metros_cuadrados,cantidad_racks:a.cantidad_racks,metros_cubicos:a.metros_cubicos,costo_area:a.costo_area})), volDistribucion:(volDistData??[]) as FormulaContext['volDistribucion'], factores:(factoresData??[]) as FormulaContext['factores'], masivoArticulos:[],masivoZonas:[],masivoZonaArticulos:[],masivoTotals:undefined };
    const mappedAreas = areasWithCat.map((a:any) => ({...a}));
    for (const area of mappedAreas) { if(area.costo_area_formula){try{area.costo_area=calcularFormula(area.costo_area_formula,baseCtx,area.nombre);}catch{}}}
    setFormulaCtx({ ...baseCtx, areasData:mappedAreas.map((a:any)=>({nombre:a.nombre,metros_cuadrados:a.metros_cuadrados,cantidad_racks:a.cantidad_racks,metros_cubicos:a.metros_cubicos,costo_area:a.costo_area})) });
    } catch (err) {
      console.error('[CostosAlmacen] loadData error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    loadClusters();
    supabase.from('costos_almacen_filtros').select('*').order('created_at').then(({ data }) => {
      setFiltros((data ?? []) as FiltroUbicacion[]);
    });
  }, [loadData, loadClusters]);
  useEffect(() => {
    if(activeSelection.type==='zone'&&!activeSelection.zona&&zonaResumen.length>0){
      const first=zonaResumen.find(z=>!clusters.some(c=>c.zonas.includes(z.zona)));
      if(first)setActiveSelection({type:'zone',zona:first.zona});
    }
  }, [zonaResumen, clusters]); // eslint-disable-line

  const saveNewFiltro = async () => {
    if (!newPatron.trim()) return;
    setSavingFiltro(true);
    const { data, error } = await supabase.from('costos_almacen_filtros').insert({ patron: newPatron.trim(), descripcion: newDesc.trim(), activo: true }).select().maybeSingle();
    if (!error && data) { setFiltros(prev => [...prev, data as FiltroUbicacion]); setNewPatron(''); setNewDesc(''); }
    setSavingFiltro(false);
  };
  const toggleFiltro = async (id: string, activo: boolean) => {
    await supabase.from('costos_almacen_filtros').update({ activo }).eq('id', id);
    setFiltros(prev => prev.map(f => f.id === id ? { ...f, activo } : f));
  };
  const deleteFiltro = async (id: string) => {
    if (!confirm('¿Eliminar esta regla?')) return;
    await supabase.from('costos_almacen_filtros').delete().eq('id', id);
    setFiltros(prev => prev.filter(f => f.id !== id));
  };

  const handleClearAll = async () => {
    if (!confirm('¿Eliminar TODOS los datos de inventario de Costos Almacén?')) return;
    setClearing(true);
    await supabase.from('costos_almacen_inventario_raw').delete().neq('id','00000000-0000-0000-0000-000000000000');
    setClearing(false); loadData();
  };

  const clusteredZones = new Set(clusters.flatMap(c => c.zonas));
  const unclusteredZones = zonaResumen.filter(z => !clusteredZones.has(z.zona));
  const allZoneNames = zonaResumen.map(z => z.zona);
  const ZONE_COLORS = ['bg-teal-500','bg-cyan-500','bg-emerald-500','bg-sky-500','bg-indigo-500','bg-violet-500','bg-amber-500','bg-rose-500'];

  if (loading) return <AppLayout title="Costos Almacén" subtitle="Cargando..."><div className="flex items-center justify-center py-32"><div className="w-10 h-10 border-2 border-teal-500 border-t-transparent rounded-full animate-spin"/></div></AppLayout>;

  return (
    <AppLayout
      title="Costos Almacén"
      subtitle="Inventario × Volumetría · Zona Almacenaje · Fórmulas por artículo"
      actions={<div className="flex items-center gap-2">
        {masivoInfo && <button onClick={handleClearAll} disabled={clearing} className="flex items-center gap-2 px-3 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap disabled:opacity-50"><i className="ri-delete-bin-line"/>{clearing?'Limpiando...':'Limpiar inventario'}</button>}
        <button onClick={()=>setShowVolUpload(true)} className="flex items-center gap-2 px-3 py-2 border border-cyan-300 text-cyan-700 hover:bg-cyan-50 text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap"><i className="ri-cube-line"/>Cargar Volumetría</button>
        <button onClick={()=>setShowInvUpload(true)} className="flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap"><i className="ri-file-excel-2-line"/>Cargar Inventario</button>
      </div>}
    >
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
            <div><h3 className="text-sm font-semibold text-slate-800">Costos Almacén — Inventario</h3><p className="text-xs text-slate-400 mt-0.5">Zona: <strong>Zona Almacenaje</strong> · Volumen cruzado desde Volumetría por ID_ARTICULO · Costos de Slots por Ubicación</p></div>
            {masivoInfo && <div className="flex items-center gap-3"><span className="text-xs px-2.5 py-1 rounded-full bg-teal-50 text-teal-700 font-medium">{fmt(masivoInfo.totalRegistros)} artículos</span><span className="text-xs px-2.5 py-1 rounded-full bg-cyan-50 text-cyan-700 font-medium">{fmt(masivoInfo.volRecords)} volumetrías</span></div>}
          </div>

          {!masivoInfo ? (
            <div className="px-6 py-12 flex flex-col items-center gap-4">
              <div className="w-14 h-14 flex items-center justify-center rounded-full bg-teal-50"><i className="ri-archive-drawer-line text-2xl text-teal-400"/></div>
              <div className="text-center max-w-sm"><p className="text-slate-700 font-semibold text-sm">Sin datos de inventario</p><p className="text-slate-400 text-xs mt-1">Carga el Excel de Inventario para comenzar.</p></div>
              <div className="flex gap-3"><button onClick={()=>setShowInvUpload(true)} className="flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap"><i className="ri-file-excel-2-line"/>Cargar Inventario</button><button onClick={()=>setShowVolUpload(true)} className="flex items-center gap-2 px-4 py-2 border border-cyan-300 text-cyan-700 hover:bg-cyan-50 text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap"><i className="ri-cube-line"/>Cargar Volumetría</button></div>
            </div>
          ) : (
            <div className="px-6 py-4">
              <div className="flex gap-1 mb-4 flex-wrap">
                {[{id:'resumen',icon:'ri-dashboard-line',label:'Resumen'},{id:'zonas',icon:'ri-map-pin-line',label:'Por Zona Almacenaje'},{id:'datos',icon:'ri-table-line',label:'Ver datos'},{id:'reglas',icon:'ri-filter-3-line',label:'Reglas de filtrado'}].map(t=>(
                  <button key={t.id} onClick={()=>setTab(t.id as Tab)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${tab===t.id?'bg-slate-800 text-white':'bg-slate-100 text-slate-600 hover:bg-slate-200'} ${t.id==='reglas'&&filtros.some(f=>f.activo)?'ring-1 ring-amber-400':''}`}>
                    <i className={`${t.icon} text-[11px]`}/>{t.label}
                    {t.id==='reglas'&&filtros.some(f=>f.activo)&&<span className="ml-1 px-1.5 py-0.5 bg-amber-400 text-white rounded-full text-[9px] font-bold">{filtros.filter(f=>f.activo).length}</span>}
                  </button>
                ))}
              </div>

              {/* RESUMEN */}
              {tab==='resumen'&&globalTotals&&(
                <div className="space-y-5">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-teal-50 border border-teal-100 rounded-lg px-4 py-3"><p className="text-xs text-teal-600">Total Artículos</p><p className="text-lg font-bold text-teal-700">{fmt(globalTotals.total_registros)}</p></div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3"><p className="text-xs text-slate-500">Zonas Almacenaje</p><p className="text-lg font-bold text-slate-700">{globalTotals.total_zonas}</p></div>
                    <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3"><p className="text-xs text-indigo-600">Artículos únicos</p><p className="text-lg font-bold text-indigo-700">{fmt(globalTotals.total_articulos)}</p></div>
                    <div className="bg-cyan-50 border border-cyan-100 rounded-lg px-4 py-3"><p className="text-xs text-cyan-600">Σ Cant. Unidades</p><p className="text-lg font-bold text-cyan-700">{fmt(globalTotals.cantidad_total)}</p></div>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <p className="text-sm font-semibold text-slate-700 mb-3">Artículos por Zona Almacenaje</p>
                    <div className="space-y-2">{zonaResumen.map((z,i)=>{const pct=globalTotals.total_registros>0?(z.total_articulos/globalTotals.total_registros)*100:0;return<div key={z.zona} className="flex items-center gap-3"><div className={`w-2 h-2 rounded-full flex-shrink-0 ${ZONE_COLORS[i%ZONE_COLORS.length]}`}/><span className="w-36 text-xs text-slate-600 font-medium truncate flex-shrink-0" title={z.zona}>{z.zona}</span><div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-teal-400 rounded-full" style={{width:`${Math.max(pct,0.5)}%`}}/></div><span className="w-20 text-right text-xs text-slate-700 font-medium flex-shrink-0">{fmt(z.total_articulos)} arts.</span><span className="w-12 text-right text-xs text-slate-400 flex-shrink-0">{pct.toFixed(1)}%</span></div>;})}
                    </div>
                  </div>
                </div>
              )}

              {/* ZONAS */}
              {tab==='zonas'&&(
                <div className="space-y-4">
                  <div className="flex gap-1.5 flex-wrap">
                    {clusters.map(cluster=>{const isActive=activeSelection.type==='cluster'&&activeSelection.cluster.id===cluster.id;const total=zonaResumen.filter(z=>cluster.zonas.includes(z.zona)).reduce((s,z)=>s+z.total_articulos,0);return<button key={cluster.id} onClick={()=>{setActiveSelection({type:'cluster',cluster});setShowUbicTable(false);;}} className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${isActive?`${clusterActiveBg(cluster.color)} border-transparent`:'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}><i className={`ri-stack-line ${isActive?'text-white/80':'text-slate-400'}`}/>{cluster.nombre}<span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${isActive?'bg-white/20 text-white':'bg-slate-100 text-slate-500'}`}>{fmt(total)}</span></button>;})}
                    {clusters.length>0&&unclusteredZones.length>0&&<div className="flex items-center px-1"><div className="h-5 w-px bg-slate-200"/></div>}
                    {unclusteredZones.map((z,i)=>{const isActive=activeSelection.type==='zone'&&activeSelection.zona===z.zona;return<button key={z.zona} onClick={()=>{setActiveSelection({type:'zone',zona:z.zona});setShowUbicTable(false);}} className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${isActive?'bg-teal-600 text-white border-transparent shadow-sm':'bg-white text-slate-600 border-slate-200 hover:border-teal-300 hover:bg-teal-50'}`}><span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive?'bg-white/70':ZONE_COLORS[i%ZONE_COLORS.length]}`}/>{z.zona}<span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${isActive?'bg-white/20 text-white':'bg-slate-100 text-slate-500'}`}>{fmt(z.total_articulos)}</span></button>;})}
                  </div>

                  {/* Cluster manager */}
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-400">Tabla de artículos por zona · todas las variables del sistema disponibles en fórmulas</p>
                    <button onClick={()=>setShowUbicTable(v=>!v)} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap">
                      <i className="ri-settings-2-line text-sm"/>Clusters {clusters.length>0&&<span className="ml-1 px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded-full text-[10px] font-semibold">{clusters.length}</span>}
                    </button>
                  </div>
                  {showUbicTable && <ZonaClusterManager tableName="costos_almacen_inv_clusters" clusters={clusters} zonas={allZoneNames} onChanged={loadClusters}/>}

                  {activeZonas.length > 0 && (
                    <TablaDistribucion
                      formulaCtx={formulaCtx}
                      extraVars={varColValues}
                      activeZonas={activeZonas}
                      filtros={filtros}
                      refreshKey={refreshKey}
                      expectedRows={expectedRows}
                    />
                  )}
                </div>
              )}

              {/* REGLAS */}
              {tab==='reglas'&&(
                <div className="space-y-5 max-w-2xl">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <p className="text-sm font-semibold text-amber-800"><i className="ri-filter-3-line mr-1.5"/>Reglas de filtrado de ubicaciones</p>
                    <p className="text-xs text-amber-600 mt-1">
                      Las filas cuya <strong>Ubicación</strong> contenga cualquier patrón activo quedan <strong>excluidas</strong> de todos los cálculos, sumas y fórmulas del módulo.<br/>
                      Ejemplo: patrón <code className="bg-amber-100 px-1 rounded">-N01-</code> excluye ubicaciones tipo <code className="bg-amber-100 px-1 rounded">RCL33-C024-N01-1</code>
                    </p>
                  </div>

                  {/* Add rule form */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-semibold text-slate-700">Agregar nueva regla</p>
                    <div className="flex gap-3 flex-wrap">
                      <div className="flex-1 min-w-[160px]">
                        <label className="text-[11px] text-slate-500 mb-1 block">Patrón (contenido en Ubicación)</label>
                        <input type="text" value={newPatron} onChange={e=>setNewPatron(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&newPatron.trim())saveNewFiltro();}} placeholder="ej: -N01-  ó  N02  ó  MERMA" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-amber-400 bg-white font-mono"/>
                      </div>
                      <div className="flex-1 min-w-[180px]">
                        <label className="text-[11px] text-slate-500 mb-1 block">Descripción (opcional)</label>
                        <input type="text" value={newDesc} onChange={e=>setNewDesc(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&newPatron.trim())saveNewFiltro();}} placeholder="ej: Excluir nivel 1" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-amber-400 bg-white"/>
                      </div>
                    </div>
                    <button onClick={saveNewFiltro} disabled={!newPatron.trim()||savingFiltro} className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap">
                      <i className="ri-add-line"/>{savingFiltro?'Guardando...':'Agregar regla'}
                    </button>
                  </div>

                  {/* Rules list */}
                  {filtros.length === 0 ? (
                    <p className="text-center text-slate-400 text-sm py-6">Sin reglas definidas. Todas las ubicaciones se incluyen en los cálculos.</p>
                  ) : (
                    <div className="space-y-2">
                      {filtros.map(f=>(
                        <div key={f.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${f.activo?'bg-amber-50 border-amber-200':'bg-slate-50 border-slate-200 opacity-60'}`}>
                          <button onClick={()=>toggleFiltro(f.id,!f.activo)} className={`w-10 h-5 rounded-full flex-shrink-0 transition-all cursor-pointer relative ${f.activo?'bg-amber-400':'bg-slate-300'}`}>
                            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${f.activo?'left-5':'left-0.5'}`}/>
                          </button>
                          <div className="flex-1 min-w-0">
                            <span className="font-mono text-sm font-semibold text-slate-800">{f.patron}</span>
                            {f.descripcion&&<span className="ml-2 text-xs text-slate-400">{f.descripcion}</span>}
                            {f.activo&&<span className="ml-2 text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">activo</span>}
                          </div>
                          <button onClick={()=>deleteFiltro(f.id)} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 cursor-pointer flex-shrink-0"><i className="ri-delete-bin-line text-sm"/></button>
                        </div>
                      ))}
                    </div>
                  )}
                  {filtros.some(f=>f.activo)&&(
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <i className="ri-information-line mr-1"/>Los cambios se aplican al recargar la pestaña <strong>Por Zona Almacenaje</strong>.
                    </p>
                  )}
                </div>
              )}

              {/* DATOS */}
              {tab==='datos'&&(
                <div className="space-y-3">
                  <div className="flex gap-1">
                    {[{id:'inventario',label:'Inventario'},{id:'volumetria',label:'Volumetría'}].map(t=><button key={t.id} onClick={()=>setDataTab(t.id as any)} className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${dataTab===t.id?'bg-slate-800 text-white':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{t.label}</button>)}
                  </div>
                  <RawTable tab={dataTab}/>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showInvUpload && (
        <React.Suspense fallback={null}>
          {React.createElement(React.lazy(()=>import('./components/InventarioUploadModal')), { onClose:()=>setShowInvUpload(false), onSuccess:()=>{loadData();setRefreshKey(k=>k+1);} })}
        </React.Suspense>
      )}
      {showVolUpload && (
        <React.Suspense fallback={null}>
          {React.createElement(React.lazy(()=>import('./components/VolumetriaUploadModal')), { onClose:()=>setShowVolUpload(false), onSuccess:()=>{loadData();setRefreshKey(k=>k+1);} })}
        </React.Suspense>
      )}
    </AppLayout>
  );
}
