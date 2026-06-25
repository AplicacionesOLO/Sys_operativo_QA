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
interface ZonaResumen { zona: string; total_ubicaciones: number; articulos_distintos: number; companias_distintas: number; pct_picking_promedio: number; suma_cant_max: number; }
interface VarColumna { id: string; nombre: string; formula?: string; orden: number; }
// Row now grouped by Ubicación — shows article count per location
interface PickingRow {
  ubicacion: string;
  total_articulos: number;   // how many articles are at this location
  pct_picking_promedio: number;
  suma_cant_max: number;
  suma_cant_min: number;
  companias: string;
  zona_picking: string;
}
// Detail of individual articles within a location (drill-down)
interface ArticuloRow { id_articulo: string; descripcion: string; id_compania: string; compania: string; pct_picking: number; cant_max: number; cant_min: number; id_presentacion: string; auto_reponer: string; }
interface ZonaColumna { id: string; zona: string; nombre: string; tipo: string; orden: number; formula?: string; }
interface MasivoInfo { totalRegistros: number; headers: string[] }
type Tab = 'resumen' | 'zonas' | 'datos';
type ActiveSelection = { type: 'zone'; zona: string } | { type: 'cluster'; cluster: { id: string; nombre: string; zonas: string[]; color: string; orden: number } };

const fmt    = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);
const fmtDec = (n: number) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

// Tokens disponibles en fórmulas — nivel Ubicación (agrupado)
const PICKING_TOKENS = [
  { token: '{TOTAL_ARTICULOS}',   label: 'Total Artículos',     desc: 'Cantidad de artículos asignados a esta ubicación' },
  { token: '{SUMA_CANT_MAX}',     label: 'Σ Cant. Máx.',        desc: 'Suma de Cantidad Máxima de todos los artículos de esta ubicación' },
  { token: '{SUMA_CANT_MIN}',     label: 'Σ Cant. Mín.',        desc: 'Suma de Cantidad Mínima de todos los artículos de esta ubicación' },
  { token: '{PCT_PICKING_PROM}',  label: '% Picking promedio',  desc: 'Promedio de % Picking de los artículos de esta ubicación' },
  { token: '{ZONA_TOTAL}',        label: 'Total Zona',          desc: 'Total de ubicaciones únicas en la zona' },
  { token: '{PCT_ZONA}',          label: '% de Zona',           desc: '% de artículos de esta ubicación sobre el total de la zona' },
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
    let q = supabase.from('zona_picking_raw').select('id,raw_data', { count:'exact' })
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
        {isFiltered ? `${fmt(count)} resultado(s) · "${activeTerm}" en ${activeCol}` : `${fmt(count)} filas`} · Pág. {page+1}/{Math.max(totalPages,1)}
      </span>
      <div className="border border-slate-200 rounded-lg overflow-auto max-h-[55vh]">
        <table className="text-xs whitespace-nowrap w-full">
          <thead><tr className="bg-slate-50 sticky top-0 z-10">
            <th className="px-3 py-2 text-left text-slate-500 border-r border-slate-200">#</th>
            {dh.map(h=><th key={h} className="px-3 py-2 text-left text-slate-500 border-r border-slate-200 max-w-[160px] overflow-hidden text-ellipsis">{h}</th>)}
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={dh.length+1} className="px-3 py-8 text-center text-slate-400">Cargando...</td></tr>
            : rows.map((r,i) => <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-1.5 text-slate-400 border-r border-slate-100 text-center">{page*PAGE+i+1}</td>
                {dh.map(h => { const v = r.raw_data?.[h]; return <td key={h} className="px-3 py-1.5 text-slate-600 border-r border-slate-100 max-w-[160px] overflow-hidden text-ellipsis">{v!=null?String(v):'—'}</td>; })}
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

// ── Sortable headers ──────────────────────────────────────────────────────────
function SortableFixedHeader({id,className,children}:{id:string;className?:string;children:React.ReactNode}) {
  const {attributes,listeners,setNodeRef,transform,transition,isDragging}=useSortable({id});
  const style:React.CSSProperties={transform:CSS.Transform.toString(transform),transition,opacity:isDragging?0.5:1,zIndex:isDragging?20:undefined,position:'relative'};
  return<th ref={setNodeRef} style={style} className={className}><div className="flex items-center gap-1.5"><button {...attributes} {...listeners} className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 cursor-grab active:cursor-grabbing flex-shrink-0"><i className="ri-draggable text-xs"/></button><div className="min-w-0 flex-1">{children}</div></div></th>;
}

function SortableColHeader({col,onDelete,onEditFormula,onRename,onSort,sortIconClass}:{col:ZonaColumna;onDelete:(id:string)=>void;onEditFormula:(col:ZonaColumna,e:React.MouseEvent)=>void;onRename:(id:string,nombre:string)=>void;onSort:()=>void;sortIconClass:string}) {
  const {attributes,listeners,setNodeRef,transform,transition,isDragging}=useSortable({id:col.id});
  const [editing,setEditing]=useState(false);
  const [name,setName]=useState(col.nombre);
  const style:React.CSSProperties={transform:CSS.Transform.toString(transform),transition,opacity:isDragging?0.5:1,zIndex:isDragging?20:undefined,position:'relative'};
  const hasFormula=!!col.formula?.trim();
  const handleSave=()=>{const t=name.trim();if(t&&t!==col.nombre)onRename(col.id,t);else setName(col.nombre);setEditing(false);};
  return(
    <th ref={setNodeRef} style={style} className={`px-2 py-2.5 border-r font-semibold ${hasFormula?'bg-violet-100/60 border-violet-200':'bg-violet-50/50 border-violet-100'}`}>
      <div className="flex items-center gap-1.5">
        <button {...attributes} {...listeners} className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 cursor-grab active:cursor-grabbing flex-shrink-0"><i className="ri-draggable text-xs"/></button>
        <div className="flex items-center gap-1 min-w-0 flex-1">
          {editing?<input type="text" value={name} onChange={e=>setName(e.target.value)} onBlur={handleSave} onKeyDown={e=>{if(e.key==='Enter')handleSave();if(e.key==='Escape'){setName(col.nombre);setEditing(false);}}} className="text-xs text-violet-700 bg-white border border-violet-300 rounded px-1.5 py-0.5 w-full min-w-[80px] focus:outline-none" autoFocus/>
          :<div className="flex items-center gap-0.5 min-w-0 group/name"><span onClick={onSort} className="text-xs text-violet-700 whitespace-nowrap max-w-[120px] overflow-hidden text-ellipsis cursor-pointer hover:underline">{col.nombre}</span><div className="w-3 h-3 flex items-center justify-center flex-shrink-0 cursor-pointer" onClick={onSort}><i className={sortIconClass}/></div><button onClick={()=>{setName(col.nombre);setEditing(true);}} className="w-4 h-4 flex items-center justify-center rounded text-slate-300 hover:text-violet-500 cursor-pointer flex-shrink-0 opacity-0 group-hover/name:opacity-100"><i className="ri-pencil-line text-[10px]"/></button></div>}
          {hasFormula&&<span className="text-[10px] px-1 py-0.5 rounded bg-violet-200 text-violet-700 font-mono font-bold flex-shrink-0">fx</span>}
        </div>
        <button onClick={e=>onEditFormula(col,e)} className={`w-5 h-5 flex items-center justify-center rounded cursor-pointer flex-shrink-0 ${hasFormula?'text-violet-600 hover:text-violet-800 hover:bg-violet-200':'text-slate-400 hover:text-violet-500 hover:bg-violet-100'}`}><i className={`${hasFormula?'ri-pencil-line':'ri-functions'} text-xs`}/></button>
        <button onClick={()=>onDelete(col.id)} className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 cursor-pointer flex-shrink-0"><i className="ri-close-line text-xs"/></button>
      </div>
    </th>
  );
}

// ── Zone Detail Table ─────────────────────────────────────────────────────────
function ZonaPickingDetailTable({zonas,zona_label,formulaCtx,clusters,onClustersChange,allZoneNames,zonaTotals,extraVars}:{
  zonas:string[];zona_label:string;formulaCtx:FormulaContext;
  clusters:{id:string;nombre:string;zonas:string[];color:string;orden:number}[];
  onClustersChange:()=>void;allZoneNames:string[];
  zonaTotals:ZonaResumen[];
  extraVars: Record<string, number>;
}) {
  const [rows,setRows]=useState<PickingRow[]>([]);
  const [loading,setLoading]=useState(false);
  const [search,setSearch]=useState('');
  const [artPage,setArtPage]=useState(0);
  const [artSortKey,setArtSortKey]=useState('FIXED:pct_picking');
  const [artSortDir,setArtSortDir]=useState<'asc'|'desc'>('desc');
  const [showClusterMgr,setShowClusterMgr]=useState(false);
  const ART_PAGE_SIZE=100;
  const deferredSearch=useDeferredValue(search);

  const [zonaColumnas,setZonaColumnas]=useState<ZonaColumna[]>([]);
  const [celdasFormulas,setCeldasFormulas]=useState<Record<string,any[]>>({});
  const [colLoading,setColLoading]=useState(false);
  const [addingColumn,setAddingColumn]=useState(false);
  const [newColName,setNewColName]=useState('');
  const [colOrder,setColOrder]=useState<string[]>([]);
  const [editingColumnFormula,setEditingColumnFormula]=useState<{columnaId:string;colNombre:string;formula:string;position:{top:number;left:number};columnTokens:{token:string;label:string;value?:number}[];enrichedVarMap:Record<string,number>}|null>(null);

  const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:5}}));

  const colZoneKey=zonas.length===1?zonas[0]:`_cluster_${zonas.sort().join('_')}`;
  const zonaTotalUbicaciones=useMemo(()=>zonas.reduce((s,z)=>{const r=zonaTotals.find(t=>t.zona===z);return s+(r?.total_ubicaciones??0);},0),[zonas,zonaTotals]);

  const loadRows=useCallback(async()=>{
    if(!zonas.length)return;
    setLoading(true);
    // Use ubicacion-grouped RPCs — each row = one location with its article count
    const rpc=zonas.length>1?'fn_picking_zonas_ubicaciones':'fn_picking_zona_ubicaciones';
    const params=zonas.length>1?{p_zonas:zonas,p_offset:0,p_limit:5000}:{p_zona:zonas[0],p_offset:0,p_limit:5000};
    const {data}=await supabase.rpc(rpc,params);
    setRows(((data??[])as any[]).map((r:any)=>({
      ubicacion:String(r.ubicacion??''),
      total_articulos:Number(r.total_articulos)||0,
      pct_picking_promedio:Number(r.pct_picking_promedio)||0,
      suma_cant_max:Number(r.suma_cant_max)||0,
      suma_cant_min:Number(r.suma_cant_min)||0,
      companias:String(r.companias??''),
      zona_picking:String(r.zona_picking??''),
    })));
    setLoading(false);
  },[zonas.join(',')]); // eslint-disable-line

  useEffect(()=>{loadRows();},[loadRows]);

  const loadZonaColumnas=useCallback(async(key:string)=>{
    setColLoading(true);setColOrder([]);
    const {data:cols}=await supabase.from('zona_picking_zona_columnas').select('*').eq('zona',key).order('orden');
    const colArray=(cols??[]) as ZonaColumna[];
    setZonaColumnas(colArray);
    if(colArray.length>0){
      const {data:cells}=await supabase.from('zona_picking_ubicacion_celdas').select('*').in('columna_id',colArray.map(c=>c.id));
      const byCol:Record<string,any[]>={};
      for(const cell of(cells??[])){if(!byCol[cell.columna_id])byCol[cell.columna_id]=[];byCol[cell.columna_id].push(cell);}
      setCeldasFormulas(byCol);
    }else{setCeldasFormulas({});}
    setColLoading(false);
  },[]);

  useEffect(()=>{if(colZoneKey)loadZonaColumnas(colZoneKey);},[colZoneKey,loadZonaColumnas]);

  const systemVarDefs=useMemo(():VariableDef[]=>{try{return buildVariableDefs(toAllDataSources(formulaCtx));}catch{return [];}},[ formulaCtx]);
  const systemVarMap=useMemo(():Record<string,number>=>{if(!systemVarDefs.length)return{};try{return buildVariableMap(systemVarDefs,toAllDataSources(formulaCtx));}catch{return {};}},[ formulaCtx,systemVarDefs]);

  const colNameToToken=useCallback((n:string)=>n.replace(/[^a-zA-Z0-9]/g,'_').toUpperCase(),[]);

  const buildRowVarMap=useCallback((row:PickingRow)=>({
    TOTAL_ARTICULOS: row.total_articulos,
    SUMA_CANT_MAX: row.suma_cant_max,
    SUMA_CANT_MIN: row.suma_cant_min,
    PCT_PICKING_PROM: row.pct_picking_promedio,
    ZONA_TOTAL: zonaTotalUbicaciones,
    PCT_ZONA: zonaTotalUbicaciones > 0 ? (row.total_articulos / rows.reduce((s,r)=>s+r.total_articulos,1)) * 100 : 0,
    ...extraVars,
    ...systemVarMap,
  }),[zonaTotalUbicaciones, rows, systemVarMap, extraVars]);

  const columnOrder=useMemo(()=>{
    const derived=[
      'FIXED:ubicacion','FIXED:total_articulos','FIXED:pct_zona',
      'FIXED:pct_picking_prom','FIXED:suma_cant_max','FIXED:suma_cant_min','FIXED:companias',
      ...zonaColumnas.map(c=>c.id)
    ];
    const s=new Set(derived);
    if(colOrder.length===derived.length&&colOrder.every(k=>s.has(k)))return colOrder;
    return derived;
  },[colOrder,zonaColumnas]);

  // Drill-down: articles within a selected location
  const [expandedUbic, setExpandedUbic] = useState<string|null>(null);
  const [ubicArticulos, setUbicArticulos] = useState<ArticuloRow[]>([]);
  const [ubicArtsLoading, setUbicArtsLoading] = useState(false);
  const loadUbicArticulos = useCallback(async (ubicacion: string) => {
    if (expandedUbic === ubicacion) { setExpandedUbic(null); return; }
    setExpandedUbic(ubicacion);
    setUbicArtsLoading(true);
    const zona = zonas[0] ?? '';
    const {data} = await supabase.rpc('fn_picking_ubicacion_articulos', { p_zona: zona, p_ubicacion: ubicacion, p_offset: 0, p_limit: 200 });
    setUbicArticulos(((data??[]) as any[]).map((r:any) => ({ id_articulo:String(r.id_articulo??''), descripcion:String(r.descripcion??''), id_compania:String(r.id_compania??''), compania:String(r.compania??''), pct_picking:Number(r.pct_picking)||0, cant_max:Number(r.cant_max)||0, cant_min:Number(r.cant_min)||0, id_presentacion:String(r.id_presentacion??''), auto_reponer:String(r.auto_reponer??'') })));
    setUbicArtsLoading(false);
  }, [expandedUbic, zonas]);

  // computedCells — per-row, accumulates column values
  const computedCells=useMemo(()=>{
    const result:Record<string,Record<string,{value:number|null;formula:string|null;error:boolean;isGlobal:boolean}>>={};
    const rowKey=(r:PickingRow)=>r.ubicacion;  // Key = Ubicación (unique per location)
    const accum:Record<string,Record<string,number>>={};
    for(const r of rows)accum[rowKey(r)]={};
    for(const col of zonaColumnas){
      result[col.id]={};
      const colToken=colNameToToken(col.nombre);
      const colFormula=col.formula?.trim();
      if(!colFormula){for(const r of rows){accum[rowKey(r)][colToken]=0;result[col.id][rowKey(r)]={value:null,formula:null,error:false,isGlobal:false};}continue;}
      const hasRowVars=/\{(TOTAL_ARTICULOS|SUMA_CANT_MAX|SUMA_CANT_MIN|PCT_PICKING_PROM|ZONA_TOTAL|PCT_ZONA)\}/i.test(colFormula);
      if(!hasRowVars){
        const rv=evalFormula(colFormula,{...systemVarMap});
        const val=rv.ok?rv.value:null;
        for(const r of rows){accum[rowKey(r)][colToken]=val??0;result[col.id][rowKey(r)]={value:val,formula:colFormula,error:!rv.ok,isGlobal:true};}
      }else{
        for(const r of rows){
          const k=rowKey(r);
          const cells=celdasFormulas[col.id]??[];
          const cellFormula=cells.find(c=>c.ubicacion===r.ubicacion)?.formula??colFormula;
          const varMap={...buildRowVarMap(r),...accum[k]};
          const ev=evalFormula(cellFormula,varMap);
          const val=ev.ok?ev.value:null;
          accum[k][colToken]=val??0;
          result[col.id][k]={value:val,formula:cellFormula,error:!ev.ok,isGlobal:false};
        }
      }
    }
    return result;
  },[zonaColumnas,celdasFormulas,rows,buildRowVarMap,systemVarMap,colNameToToken]);

  const footerTotals=useMemo(()=>{
    const t:Record<string,number>={};
    for(const col of zonaColumnas)t[col.id]=rows.reduce((s,r)=>{const c=computedCells[col.id]?.[r.ubicacion];return s+(!c?.isGlobal&&c?.value!=null?c.value:0);},0);
    return t;
  },[zonaColumnas,computedCells,rows]);

  const totalArticulosZona = useMemo(() => rows.reduce((s,r)=>s+r.total_articulos, 0), [rows]);

  const filteredRows=useMemo(()=>{
    if(!deferredSearch)return rows;
    const q=deferredSearch.toLowerCase();
    return rows.filter(r=>r.ubicacion.toLowerCase().includes(q)||r.companias.toLowerCase().includes(q));
  },[rows,deferredSearch]);

  const sortedRows=useMemo(()=>{
    const rowKey=(r:PickingRow)=>r.ubicacion;
    return [...filteredRows].sort((a,b)=>{
      const dir=artSortDir==='asc'?1:-1;
      if(artSortKey==='FIXED:ubicacion')return a.ubicacion.localeCompare(b.ubicacion)*dir;
      if(artSortKey==='FIXED:total_articulos')return(a.total_articulos-b.total_articulos)*dir;
      if(artSortKey==='FIXED:pct_zona')return(a.total_articulos-b.total_articulos)*dir;
      if(artSortKey==='FIXED:pct_picking_prom')return(a.pct_picking_promedio-b.pct_picking_promedio)*dir;
      if(artSortKey==='FIXED:suma_cant_max')return(a.suma_cant_max-b.suma_cant_max)*dir;
      if(artSortKey==='FIXED:suma_cant_min')return(a.suma_cant_min-b.suma_cant_min)*dir;
      const va=computedCells[artSortKey]?.[rowKey(a)]?.value??0;
      const vb=computedCells[artSortKey]?.[rowKey(b)]?.value??0;
      return(va-vb)*dir;
    });
  },[filteredRows,artSortKey,artSortDir,computedCells]);

  const toggleSort=(key:string)=>{if(artSortKey===key)setArtSortDir(d=>d==='asc'?'desc':'asc');else{setArtSortKey(key);setArtSortDir('desc');}setArtPage(0);};
  const sortIcon=(key:string)=>artSortKey!==key?'ri-expand-up-down-line text-slate-300':artSortDir==='asc'?'ri-sort-asc text-slate-700':'ri-sort-desc text-slate-700';

  const totalArtPages=Math.ceil(sortedRows.length/ART_PAGE_SIZE);
  const paginatedRows=sortedRows.slice(artPage*ART_PAGE_SIZE,(artPage+1)*ART_PAGE_SIZE);

  const handleAddColumn=useCallback(async()=>{
    if(!newColName.trim())return;
    const {data:newCol,error}=await supabase.from('zona_picking_zona_columnas').insert({zona:colZoneKey,nombre:newColName.trim(),tipo:'formula',orden:zonaColumnas.length}).select().maybeSingle();
    if(error){alert(`Error: ${error.message}`);return;}
    if(newCol)setZonaColumnas(prev=>[...prev,newCol as ZonaColumna]);
    setNewColName('');setAddingColumn(false);
  },[newColName,colZoneKey,zonaColumnas]);

  const handleDeleteColumn=useCallback(async(id:string)=>{
    if(!confirm('¿Eliminar esta columna?'))return;
    await supabase.from('zona_picking_zona_columnas').delete().eq('id',id);
    setZonaColumnas(prev=>prev.filter(c=>c.id!==id));
  },[]);

  const handleRenameColumn=useCallback(async(id:string,nombre:string)=>{
    await supabase.from('zona_picking_zona_columnas').update({nombre}).eq('id',id);
    setZonaColumnas(prev=>prev.map(c=>c.id===id?{...c,nombre}:c));
  },[]);

  const handleOpenColumnFormulaEditor=useCallback((col:ZonaColumna,e:React.MouseEvent)=>{
    const rect=(e.currentTarget as HTMLElement).getBoundingClientRect();
    const colIdx=zonaColumnas.findIndex(c=>c.id===col.id);
    const prevCols=colIdx>0?zonaColumnas.slice(0,colIdx):[];
    const sampleRow=rows[0];
    const prevColValues:Record<string,number>={};
    prevCols.forEach(pc=>{if(sampleRow){const v=computedCells[pc.id]?.[sampleRow.ubicacion]?.value;if(v!=null)prevColValues[colNameToToken(pc.nombre)]=v;}});
    const enrichedVarMap=sampleRow?{...buildRowVarMap(sampleRow),...prevColValues}:{...systemVarMap,...prevColValues};
    const columnTokens=prevCols.map(pc=>({token:colNameToToken(pc.nombre),label:pc.nombre,value:sampleRow?(computedCells[pc.id]?.[sampleRow.ubicacion]?.value??undefined):undefined}));
    setEditingColumnFormula({columnaId:col.id,colNombre:col.nombre,formula:col.formula??'',position:{top:rect.bottom+4,left:rect.left},columnTokens,enrichedVarMap});
  },[zonaColumnas,rows,computedCells,colNameToToken,buildRowVarMap,systemVarMap]);

  const handleSaveColumnFormula=useCallback(async(formula:string)=>{
    if(!editingColumnFormula)return;
    await supabase.from('zona_picking_zona_columnas').update({formula:formula||null}).eq('id',editingColumnFormula.columnaId);
    await loadZonaColumnas(colZoneKey);
    setEditingColumnFormula(null);
  },[editingColumnFormula,colZoneKey,loadZonaColumnas]);

  const handleDragEnd=useCallback((event:DragEndEvent)=>{
    const{active,over}=event;
    if(!over||active.id===over.id)return;
    const cur=columnOrder;
    const oi=cur.indexOf(String(active.id));
    const ni=cur.indexOf(String(over.id));
    if(oi===-1||ni===-1)return;
    const next=[...cur];next.splice(oi,1);next.splice(ni,0,String(active.id));
    setColOrder(next);
  },[columnOrder]);

  const ZONE_COLORS=['bg-violet-500','bg-indigo-500','bg-fuchsia-500','bg-purple-500','bg-pink-500','bg-sky-500','bg-teal-500','bg-rose-500'];

  return(
    <div className="space-y-3">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-violet-50 border border-violet-100 rounded-lg px-3 py-2.5"><p className="text-xs text-violet-600">{zona_label}</p><p className="text-base font-bold text-violet-700">{fmt(rows.length)} ubicaciones</p></div>
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2.5"><p className="text-xs text-indigo-600">Total artículos</p><p className="text-base font-bold text-indigo-700">{fmt(totalArticulosZona)}</p></div>
        <div className="bg-fuchsia-50 border border-fuchsia-100 rounded-lg px-3 py-2.5"><p className="text-xs text-fuchsia-600">% Picking prom.</p><p className="text-base font-bold text-fuchsia-700">{fmtDec(rows.length>0?rows.reduce((s,r)=>s+r.pct_picking_promedio,0)/rows.length:0)}%</p></div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5"><p className="text-xs text-slate-500">Σ Cant. Máx.</p><p className="text-base font-bold text-slate-700">{fmt(rows.reduce((s,r)=>s+r.suma_cant_max,0))}</p></div>
      </div>

      {/* Cluster manager */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">Tabla de ubicaciones · {PICKING_TOKENS.map(t=>t.token).join(' · ')} disponibles en fórmulas</p>
        <button onClick={()=>setShowClusterMgr(v=>!v)} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap">
          <i className={`ri-stack-${showClusterMgr?'fill':'line'} text-sm`}/>Clusters{clusters.length>0&&<span className="ml-1 px-1.5 py-0.5 bg-violet-100 text-violet-700 rounded-full text-[10px] font-semibold">{clusters.length}</span>}
        </button>
      </div>
      {showClusterMgr&&<ZonaClusterManager tableName="zona_picking_clusters" clusters={clusters} zonas={allZoneNames} onChanged={onClustersChange}/>}

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><i className="ri-search-line text-sm text-slate-400"/></div>
          <input type="text" placeholder="Buscar ubicación, artículo, descripción..." value={search} onChange={e=>{setSearch(e.target.value);setArtPage(0);}} className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-100 focus:border-violet-300 outline-none bg-white placeholder:text-slate-400"/>
        </div>
        <span className="text-xs text-slate-400 whitespace-nowrap">{filteredRows.length} filas</span>
      </div>

      {/* Table */}
      {loading?<div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"/></div>:(
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="border border-slate-200 rounded-lg overflow-auto max-h-[65vh]">
            <table className="text-xs whitespace-nowrap w-full">
              <thead>
                <tr className="bg-slate-50 sticky top-0 z-10">
                  <SortableContext items={columnOrder} strategy={horizontalListSortingStrategy}>
                    {columnOrder.map(colKey=>{
                      if(colKey.startsWith('FIXED:')){
                        const key=colKey.slice(6);
                        const hdr:Record<string,string>={ubicacion:'Ubicación',total_articulos:'Artículos',pct_zona:'% Zona',pct_picking_prom:'% Pick. prom.',suma_cant_max:'Σ Cant. Máx.',suma_cant_min:'Σ Cant. Mín.',companias:'Compañías'};
                        const sortable=['total_articulos','pct_zona','pct_picking_prom','suma_cant_max','suma_cant_min','ubicacion'].includes(key);
                        return<SortableFixedHeader key={colKey} id={colKey} className="px-3 py-2.5 text-left text-slate-500 font-semibold border-r border-slate-200 bg-slate-50">
                          {sortable?<span onClick={()=>toggleSort(`FIXED:${key}`)} className="cursor-pointer hover:text-slate-700 flex items-center gap-1">{hdr[key]??key}<i className={`${sortIcon(`FIXED:${key}`)} ml-0.5`}/></span>:<span>{hdr[key]??key}</span>}
                        </SortableFixedHeader>;
                      }else{
                        const col=zonaColumnas.find(c=>c.id===colKey);
                        if(!col)return null;
                        return<SortableColHeader key={col.id} col={col} onDelete={handleDeleteColumn} onEditFormula={handleOpenColumnFormulaEditor} onRename={handleRenameColumn} onSort={()=>toggleSort(col.id)} sortIconClass={sortIcon(col.id)}/>;
                      }
                    })}
                  </SortableContext>
                  <th className="px-1 py-2.5 bg-slate-50">
                    {colLoading?<div className="flex justify-center px-2"><div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin"/></div>
                    :addingColumn?<div className="flex items-center gap-1 px-1">
                        <input type="text" value={newColName} onChange={e=>setNewColName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')handleAddColumn();if(e.key==='Escape'){setAddingColumn(false);setNewColName('');}}} placeholder="Nombre..." className="w-[120px] px-2 py-1 text-xs border border-violet-300 rounded-md focus:outline-none bg-white" autoFocus/>
                        <button onClick={handleAddColumn} disabled={!newColName.trim()} className="w-6 h-6 flex items-center justify-center rounded-md bg-violet-500 hover:bg-violet-600 text-white cursor-pointer disabled:opacity-50"><i className="ri-check-line text-xs"/></button>
                        <button onClick={()=>{setAddingColumn(false);setNewColName('');}} className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 cursor-pointer"><i className="ri-close-line text-xs"/></button>
                      </div>
                    :<button onClick={()=>setAddingColumn(true)} className="w-8 h-8 flex items-center justify-center rounded-lg border-2 border-dashed border-slate-300 text-slate-400 hover:border-violet-400 hover:text-violet-500 hover:bg-violet-50 cursor-pointer transition-all" title="Agregar columna de fórmula"><i className="ri-add-line text-sm"/></button>}
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedRows.length===0?<tr><td colSpan={columnOrder.length+1} className="px-3 py-10 text-center text-slate-400">{search?'Sin resultados':'Sin datos'}</td></tr>
                :paginatedRows.map((row,ai)=>{
                  const rKey = row.ubicacion;
                  const isExpanded = expandedUbic === row.ubicacion;
                  return(
                    <React.Fragment key={rKey}>
                    <tr className={`border-t border-slate-100 hover:bg-violet-50/40 ${isExpanded?'bg-violet-50':'ai%2===0?bg-white:bg-slate-50/30'} ${ai%2===0?'bg-white':'bg-slate-50/30'}`}>
                      {columnOrder.map(colKey=>{
                        if(colKey.startsWith('FIXED:')){
                          const key=colKey.slice(6);
                          switch(key){
                            case 'ubicacion':    return<td key={colKey} className="px-3 py-2 font-mono font-medium text-slate-700 border-r border-slate-100 text-[11px]">{row.ubicacion||'—'}</td>;
                            case 'total_articulos':  {
                              const pctZ = totalArticulosZona > 0 ? (row.total_articulos/totalArticulosZona)*100 : 0;
                              return<td key={colKey} className="px-3 py-2 text-right border-r border-slate-100">
                                <div className="flex items-center justify-end gap-2">
                                  <button onClick={()=>loadUbicArticulos(row.ubicacion)} className="text-[10px] px-1.5 py-0.5 bg-violet-100 hover:bg-violet-200 text-violet-700 rounded cursor-pointer" title="Ver artículos de esta ubicación"><i className="ri-arrow-down-s-line"/></button>
                                  <span className="font-bold text-indigo-700 text-sm">{fmt(row.total_articulos)}</span>
                                </div>
                              </td>;
                            }
                            case 'pct_zona': {
                              const pZ = totalArticulosZona > 0 ? (row.total_articulos/totalArticulosZona)*100 : 0;
                              return<td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><div className="flex items-center justify-end gap-2"><div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-violet-400 rounded-full" style={{width:`${Math.min(pZ,100)}%`}}/></div><span className="text-violet-700 font-semibold w-10 text-right">{pZ.toFixed(2)}%</span></div></td>;
                            }
                            case 'pct_picking_prom': return<td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-fuchsia-600 font-medium">{fmtDec(row.pct_picking_promedio)}%</span></td>;
                            case 'suma_cant_max':    return<td key={colKey} className="px-3 py-2 text-right text-slate-600 border-r border-slate-100">{fmt(row.suma_cant_max)}</td>;
                            case 'suma_cant_min':    return<td key={colKey} className="px-3 py-2 text-right text-slate-500 border-r border-slate-100">{fmt(row.suma_cant_min)}</td>;
                            case 'companias':       return<td key={colKey} className="px-3 py-2 text-slate-500 border-r border-slate-100 max-w-[180px] overflow-hidden text-ellipsis" title={row.companias}>{row.companias||'—'}</td>;
                            default:return null;
                          }
                        }else{
                          if(colLoading)return<td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><div className="flex justify-end"><div className="w-16 h-4 bg-slate-200 rounded animate-pulse"/></div></td>;
                          const col=zonaColumnas.find(c=>c.id===colKey);
                          if(!col)return<td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-slate-300">—</span></td>;
                          const cell=computedCells[col.id]?.[rKey];
                          const hasFormula=!!cell?.formula;
                          return(
                            <td key={col.id} onClick={e=>handleOpenColumnFormulaEditor(col,e)} className={`px-3 py-2 text-right border-r border-slate-100 cursor-pointer transition-colors ${hasFormula?'hover:bg-violet-100/60':'hover:bg-slate-100'}`} title={hasFormula?cell?.formula??'':'Clic para agregar fórmula'}>
                              {hasFormula?(cell?.error?<span className="text-rose-500">Error</span>:cell?.isGlobal?<span className="text-slate-300 text-[10px] italic">—</span>:cell?.value!=null?<span className="text-violet-700 font-bold tabular-nums">{new Intl.NumberFormat('es-CO',{minimumFractionDigits:2,maximumFractionDigits:2}).format(cell.value)}</span>:<span className="text-slate-300">—</span>):<span className="text-slate-300 text-[10px]">—</span>}
                            </td>
                          );
                        }
                      })}
                      <td className="px-1 py-2"/>
                    </tr>
                    {/* Drill-down: articles in this location */}
                    {isExpanded && (
                      <tr key={`${rKey}_detail`} className="bg-indigo-50/80 border-b border-indigo-100">
                        <td colSpan={columnOrder.length + 1} className="px-4 py-2">
                          {ubicArtsLoading ? (
                            <div className="flex items-center gap-2 py-2"><div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"/><span className="text-xs text-slate-500">Cargando artículos...</span></div>
                          ) : (
                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-indigo-700 mb-1.5"><i className="ri-map-pin-line mr-1"/>{row.ubicacion} — {ubicArticulos.length} artículos</p>
                              <div className="overflow-auto max-h-48">
                                <table className="text-[11px] w-full bg-white rounded-lg border border-indigo-100 overflow-hidden">
                                  <thead><tr className="bg-indigo-100">
                                    <th className="px-2 py-1.5 text-left text-indigo-700 font-semibold border-r border-indigo-200">Id Artículo</th>
                                    <th className="px-2 py-1.5 text-left text-indigo-700 font-semibold border-r border-indigo-200">Descripción</th>
                                    <th className="px-2 py-1.5 text-right text-indigo-700 font-semibold border-r border-indigo-200">% Pick.</th>
                                    <th className="px-2 py-1.5 text-right text-indigo-700 font-semibold border-r border-indigo-200">Cant. Máx.</th>
                                    <th className="px-2 py-1.5 text-right text-indigo-700 font-semibold border-r border-indigo-200">Cant. Mín.</th>
                                    <th className="px-2 py-1.5 text-left text-indigo-700 font-semibold">Compañía</th>
                                  </tr></thead>
                                  <tbody>
                                    {ubicArticulos.map(a => (
                                      <tr key={a.id_articulo+a.id_compania} className="border-t border-indigo-50 hover:bg-indigo-50/50">
                                        <td className="px-2 py-1 font-medium text-slate-700 border-r border-indigo-100">{a.id_articulo}</td>
                                        <td className="px-2 py-1 text-slate-600 border-r border-indigo-100 max-w-[200px] overflow-hidden text-ellipsis" title={a.descripcion}>{a.descripcion||'—'}</td>
                                        <td className="px-2 py-1 text-right text-violet-600 font-medium border-r border-indigo-100">{fmtDec(a.pct_picking)}%</td>
                                        <td className="px-2 py-1 text-right text-slate-600 border-r border-indigo-100">{fmt(a.cant_max)}</td>
                                        <td className="px-2 py-1 text-right text-slate-500 border-r border-indigo-100">{fmt(a.cant_min)}</td>
                                        <td className="px-2 py-1 text-slate-500">{a.compania||a.id_compania||'—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              {paginatedRows.length>0&&(
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-100/80">
                    {columnOrder.map(colKey=>{
                      if(colKey.startsWith('FIXED:')){
                        const key=colKey.slice(6);
                        switch(key){
                          case 'ubicacion':   return<td key={colKey} className="px-3 py-2 font-semibold text-slate-600 border-r border-slate-100 text-xs">{filteredRows.length} ubicaciones</td>;
                          case 'total_articulos': return<td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-indigo-700">{fmt(filteredRows.reduce((s,r)=>s+r.total_articulos,0))}</span></td>;
                          case 'pct_zona':    return<td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-violet-600">100%</span></td>;
                          case 'pct_picking_prom': return<td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-fuchsia-600">{fmtDec(filteredRows.length>0?filteredRows.reduce((s,r)=>s+r.pct_picking_promedio,0)/filteredRows.length:0)}%</span></td>;
                          case 'suma_cant_max': return<td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-slate-600">{fmt(filteredRows.reduce((s,r)=>s+r.suma_cant_max,0))}</span></td>;
                          case 'suma_cant_min': return<td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-slate-500">{fmt(filteredRows.reduce((s,r)=>s+r.suma_cant_min,0))}</span></td>;
                          default:return<td key={colKey} className="px-2 py-2 border-r border-slate-100"/>;
                        }
                      }else{
                        return<td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-violet-700 tabular-nums">{new Intl.NumberFormat('es-CO',{minimumFractionDigits:2,maximumFractionDigits:2}).format(footerTotals[colKey]??0)}</span></td>;
                      }
                    })}
                    <td className="px-1 py-2"/>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </DndContext>
      )}

      {totalArtPages>1&&<div className="flex items-center justify-between gap-3 pt-1">
        <span className="text-xs text-slate-400">{artPage*ART_PAGE_SIZE+1}–{Math.min((artPage+1)*ART_PAGE_SIZE,sortedRows.length)} de {sortedRows.length}</span>
        <div className="flex items-center gap-1">
          <button onClick={()=>setArtPage(p=>Math.max(0,p-1))} disabled={artPage===0} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 cursor-pointer whitespace-nowrap"><i className="ri-arrow-left-s-line"/>Anterior</button>
          <button onClick={()=>setArtPage(p=>Math.min(totalArtPages-1,p+1))} disabled={artPage>=totalArtPages-1} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 cursor-pointer whitespace-nowrap">Siguiente<i className="ri-arrow-right-s-line"/></button>
        </div>
      </div>}

      {editingColumnFormula&&(
        <ZonaCeldaFormulaEditor
          formula={editingColumnFormula.formula}
          varMap={editingColumnFormula.enrichedVarMap}
          onSave={handleSaveColumnFormula}
          onCancel={()=>setEditingColumnFormula(null)}
          position={editingColumnFormula.position}
          systemVarDefs={systemVarDefs}
          systemVarMap={systemVarMap}
          columnTokens={editingColumnFormula.columnTokens}
        />
      )}
    </div>
  );
}

// ── Tabla de Distribución Slot Prime — datos en crudo por artículo ───────────
type DistribRow = {ubicacion:string;id_articulo:string;descripcion:string;pct_picking:number;cant_max:number;cant_min:number;compania:string;zona_picking:string};
type DistribCol = {id:string;nombre:string;formula?:string;orden:number};
type UbicData = {total_articulos:number;suma_cant_max:number;suma_cant_min:number;pct_picking_promedio:number};

const DISTRIB_TOKENS = [
  { token: '{PCT_PICKING}',           label: '% Picking artículo',       desc: '% Picking de este artículo en la ubicación' },
  { token: '{CANT_MAX}',              label: 'Cant. Máx.',               desc: 'Cantidad Máxima de este artículo' },
  { token: '{CANT_MIN}',              label: 'Cant. Mín.',               desc: 'Cantidad Mínima de este artículo' },
  { token: '{TOTAL_ARTICULOS}',       label: 'Artículos en ubicación',   desc: 'Total artículos en la misma Ubicación (tabla Por Zona)' },
  { token: '{SUMA_CANT_MAX_UBIC}',    label: 'Σ Cant. Máx. ubicación',  desc: 'Suma de Cant. Máx. de todos los artículos de la ubicación' },
  { token: '{SUMA_CANT_MIN_UBIC}',    label: 'Σ Cant. Mín. ubicación',  desc: 'Suma de Cant. Mín. de todos los artículos de la ubicación' },
  { token: '{PCT_PICKING_PROM_UBIC}', label: '% Picking prom. ubic.',   desc: 'Promedio % Picking de todos los artículos de la ubicación' },
  { token: '{ZONA_TOTAL_ARTS}',       label: 'Total arts. zona',         desc: 'Total de artículos en la zona activa' },
  // Slot stats desde Costos de Slots — cruzados por código de Ubicación
  { token: '{SLOT_TOTAL}',            label: 'Slots totales',            desc: 'Total de slots físicos en esta Ubicación (Costos de Slots)' },
  { token: '{SLOT_LIBRES}',           label: 'Slots libres',             desc: 'Slots con estado Libre en esta Ubicación' },
  { token: '{SLOT_BLOQUEADOS}',       label: 'Slots bloqueados',         desc: 'Slots con estado Bloqueado' },
  { token: '{SLOT_RESERVADOS}',       label: 'Slots reservados',         desc: 'Slots con estado Reservado' },
  { token: '{SLOT_PCT_LIBRES}',       label: '% Slots libres',           desc: '% de slots libres en esta Ubicación' },
  // Volumetría — cruzada desde costos_almacen_volumetria_raw por Id Artículo
  { token: '{VOLUMEN}',               label: 'Volumen (Volumetría)',       desc: 'Volumen físico del artículo desde la tabla de Volumetría' },
];

function TablaDistribucionSlotPrime({ formulaCtx, extraVars, activeZonas }: { formulaCtx: FormulaContext; extraVars: Record<string,number>; activeZonas: string[] }) {
  const [rows, setRows] = useState<DistribRow[]>([]);
  const [ubicMap, setUbicMap] = useState<Record<string, UbicData>>({});
  const [volMap, setVolMap] = useState<Record<string, number>>({}); // id_articulo → volumen
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string>('zona_picking');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('asc');
  const [page, setPage] = useState(0);
  const filterZona = '';  // Zone filter is now handled by parent via activeZonas
  const PAGE = 200;
  // Each cluster/zone has its own set of formula columns (like zona_picking_zona_columnas)
  const distColZoneKey = useMemo(
    () => activeZonas.length === 1 ? activeZonas[0] : `_cluster_${[...activeZonas].sort().join('_')}`,
    [activeZonas.join(',')]  // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Slot stats cross-reference: ubicacion → {total, libres, bloqueados, tipo_ubicacion, dimension}
  const [slotStats, setSlotStats] = useState<Record<string,{total:number;libres:number;bloqueados:number;reservados:number;pct_libres:number;tipo_ubicacion:string;dimension:string;zona_almacenaje:string}>>({});
  // Computed slot costs from Costos de Slots module: ubicacion → {"name:NombreCol": value}
  const [slotCostos, setSlotCostos] = useState<Record<string, Record<string, number>>>({});
  // Unique column names to display (grouped so same name across zones shows as one column)
  const [slotCostoCols, setSlotCostoCols] = useState<{id:string;nombre:string;formula:string}[]>([]);
  // Tipo/dim stats for formula evaluation (stored in state so second useEffect can use it)
  const [slotTdMap, setSlotTdMap] = useState<Record<string, any>>({});
  // All raw formula cols — include zona AND tipo for accurate matching
  const [slotRawCols, setSlotRawCols] = useState<{id:string;nombre:string;formula:string;zona:string;tipo:string}[]>([]);
  // Formula columns
  const [columnas, setColumnas] = useState<DistribCol[]>([]);
  const [addingCol, setAddingCol] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [editingFormula, setEditingFormula] = useState<{id:string;formula:string;colIdx:number;position:{top:number;left:number}}|null>(null);

  // Reload when activeZonas changes — uses clean zone-filtered RPCs
  useEffect(() => {
    if (!activeZonas.length) { setRows([]); setUbicMap({}); return; }
    setLoading(true);
    const rpc = activeZonas.length > 1 ? 'fn_picking_zonas_detalle' : 'fn_picking_zona_detalle';
    const baseZonaParams = activeZonas.length > 1 ? { p_zonas: activeZonas } : { p_zona: activeZonas[0] };

    async function fetchAllPickingPages(): Promise<any[]> {
      const CHUNK = 500;
      const MAX_PAGES = 300;
      let all: any[] = [];
      let offset = 0;
      for (let page = 0; page < MAX_PAGES; page++) {
        const { data: chunk } = await supabase.rpc(rpc, { ...baseZonaParams, p_offset: offset, p_limit: CHUNK });
        if (!chunk || chunk.length === 0) break;
        all = [...all, ...chunk];
        if (chunk.length < CHUNK) break;
        offset += CHUNK;
      }
      return all;
    }

    (async () => {
    const [rpcData, {data: cols}] = await Promise.all([
      fetchAllPickingPages(),
      supabase.from('zona_picking_distribucion_columnas').select('*').eq('zona', distColZoneKey).order('orden'),
    ]);
    {
      // RPC already returns cleaned numeric values
      const mapped: DistribRow[] = ((rpcData ?? []) as any[]).map((r: any) => ({
        ubicacion: String(r.ubicacion ?? ''),
        id_articulo: String(r.id_articulo ?? ''),
        descripcion: String(r.descripcion ?? ''),
        pct_picking: Number(r.pct_picking) || 0,
        cant_max: Number(r.cant_max) || 0,
        cant_min: Number(r.cant_min) || 0,
        compania: String(r.compania ?? ''),
        zona_picking: String(r.zona_picking ?? activeZonas[0] ?? ''),
      }));
      setRows(mapped);
      // Build ubicMap from the loaded rows
      const ubMap: Record<string, UbicData> = {};
      const pctAcc: Record<string, number> = {};
      for (const r of mapped) {
        if (!ubMap[r.ubicacion]) ubMap[r.ubicacion] = { total_articulos:0, suma_cant_max:0, suma_cant_min:0, pct_picking_promedio:0 };
        ubMap[r.ubicacion].total_articulos++;
        ubMap[r.ubicacion].suma_cant_max += r.cant_max;
        ubMap[r.ubicacion].suma_cant_min += r.cant_min;
        pctAcc[r.ubicacion] = (pctAcc[r.ubicacion] ?? 0) + r.pct_picking;
      }
      for (const k of Object.keys(ubMap)) ubMap[k].pct_picking_promedio = ubMap[k].total_articulos > 0 ? pctAcc[k] / ubMap[k].total_articulos : 0;
      setUbicMap(ubMap);
      setColumnas((cols ?? []) as DistribCol[]);

      // Load volumetría cross-reference by Id Artículo
      const articulos = [...new Set(mapped.map(r => r.id_articulo).filter(Boolean))];
      if (articulos.length > 0) {
        const { data: volData } = await supabase.rpc('fn_almacen_volumetria_by_articulos', { p_articulos: articulos }).range(0, 99999);
        // Average across all rows for the same article (RPC already averages within article+company)
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

      // Load slot stats + compute slot costs from Costos de Slots module
      const ubicaciones = [...new Set(mapped.map(r => r.ubicacion).filter(Boolean))];
      if (ubicaciones.length > 0) {
        // Step 1: get tipo/dim/zona per ubicacion
        const { data: sData } = await supabase.rpc('fn_slot_stats_por_ubicacion', { p_ubicaciones: ubicaciones });
        const sMap: Record<string, any> = {};
        for (const s of (sData ?? []) as any[]) {
          sMap[String(s.ubicacion ?? '')] = {
            total: Number(s.total)||0, libres: Number(s.libres)||0,
            bloqueados: Number(s.bloqueados)||0, reservados: Number(s.reservados)||0,
            pct_libres: Number(s.pct_libres)||0,
            tipo_ubicacion: String(s.tipo_ubicacion??''), dimension: String(s.dimension??''), zona_almacenaje: String(s.zona_almacenaje??''),
          };
        }
        setSlotStats(sMap);

        // Step 2: get tipo/dim group aggregations + formula cols from costos_slots_tipo_columnas
        const zonasAlmacenaje = [...new Set(Object.values(sMap).map((v:any) => v.zona_almacenaje).filter(Boolean))];
        const [{ data: tdStats }, { data: slotCols }] = await Promise.all([
          supabase.rpc('fn_slot_tipo_dim_stats', { p_zonas_almacenaje: zonasAlmacenaje }),
          // ← costos_slots_TIPO_columnas is where user configures formulas per tipo (PICKIN, ALMREP, etc.)
          supabase.from('costos_slots_tipo_columnas').select('id, nombre, formula, zona, tipo').not('formula', 'is', null),
        ]);

        // Build tipo/dim stats map: "zona|tipo|dim" → stats
        const newTdMap: Record<string, any> = {};
        for (const td of (tdStats ?? []) as any[]) {
          const k = `${td.zona_almacenaje}|${td.tipo_ubicacion}|${td.dimension}`;
          newTdMap[k] = { total:Number(td.total)||0, libres:Number(td.libres)||0, bloqueados:Number(td.bloqueados)||0, reservados:Number(td.reservados)||0, otros:Number(td.otros)||0, zona_total:Number(td.zona_total)||0, pct_zona:Number(td.pct_zona)||0, pct_libres:Number(td.pct_libres)||0 };
        }
        setSlotTdMap(newTdMap);

        // Store raw formula cols — NOW includes tipo for matching
        const rawCols = ((slotCols ?? []) as any[])
          .filter((c:any) => c.formula?.trim())
          .map((c:any) => ({ id:String(c.id), nombre:String(c.nombre), formula:String(c.formula), zona:String(c.zona??''), tipo:String(c.tipo??'') }));
        setSlotRawCols(rawCols);

        // Show unique column names (grouped — same name across zonas/tipos = one column in table)
        const seen = new Set<string>();
        const uniqueCols: {id:string;nombre:string;formula:string}[] = [];
        for (const c of rawCols) {
          if (!seen.has(c.nombre)) { seen.add(c.nombre); uniqueCols.push({id:`name:${c.nombre}`,nombre:c.nombre,formula:c.formula}); }
        }
        setSlotCostoCols(uniqueCols);
        // Cost computation is in the second useEffect (needs systemVarMap)
      }
      setLoading(false);
    }
    })(); // end async IIFE
  }, [activeZonas.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Declare system var maps BEFORE the useEffect that depends on them
  const systemVarDefs_sc = useMemo(():VariableDef[]=>{try{return buildVariableDefs(toAllDataSources(formulaCtx));}catch{return [];}},[ formulaCtx]);
  const systemVarMap_sc  = useMemo(():Record<string,number>=>{if(!systemVarDefs_sc.length)return{};try{return buildVariableMap(systemVarDefs_sc,toAllDataSources(formulaCtx));}catch{return {};}},[ formulaCtx,systemVarDefs_sc]);

  // ── Second useEffect: compute slot costs once systemVarMap is available ──────
  // Separated so systemVarMap (depends on formulaCtx) is ready when we evaluate
  useEffect(() => {
    if (!Object.keys(slotStats).length || !slotRawCols.length || !Object.keys(slotTdMap).length) return;
    const cosMap: Record<string, Record<string, number>> = {};
    for (const [ubic, st] of Object.entries(slotStats)) {
      const groupKey = `${st.zona_almacenaje}|${st.tipo_ubicacion}|${st.dimension}`;
      const td = slotTdMap[groupKey];
      if (!td) continue;
      // Full var map: slot stats + system variables (has {COSTOS_TOTAL_*}, {INVERSIONES_*}, etc.)
      const varMap = {
        TOTAL: td.total, LIBRES: td.libres, BLOQUEADOS: td.bloqueados,
        RESERVADOS: td.reservados, OTROS: td.otros,
        ZONA_TOTAL: td.zona_total, PCT_ZONA: td.pct_zona, PCT_LIBRES: td.pct_libres,
        ...systemVarMap_sc,  // ← includes {COSTOS_TOTAL_*} and all system variables
      };
      cosMap[ubic] = {};
      // Match: col.tipo must match ubicacion.tipo_ubicacion
      //        col.zona must match ubicacion.zona_almacenaje OR be a cluster containing it
      const zonaMatchFn = (colZona: string, ubicZona: string) =>
        colZona === ubicZona || (colZona.startsWith('_cluster_') && colZona.includes(ubicZona));

      const seen = new Set<string>();
      for (const col of slotRawCols) {
        if (seen.has(col.nombre)) continue;
        // Find best match: same nombre + matching tipo + matching zona
        const bestCol = slotRawCols.find(c =>
          c.nombre === col.nombre &&
          c.tipo === st.tipo_ubicacion &&
          zonaMatchFn(c.zona, st.zona_almacenaje)
        );
        if (!bestCol) continue; // no formula for this tipo in this zone — skip
        const ev = evalFormula(bestCol.formula, varMap);
        cosMap[ubic][`name:${col.nombre}`] = ev.ok ? ev.value : 0;
        seen.add(col.nombre);
      }
    }
    setSlotCostos(cosMap);
  }, [slotStats, slotRawCols, slotTdMap, systemVarMap_sc]); // eslint-disable-line react-hooks/exhaustive-deps

  const zonas = useMemo(() => [...new Set(rows.map(r => r.zona_picking).filter(Boolean))].sort(), [rows]);

  // System variable maps for formula evaluation
  const systemVarDefs = useMemo(() => { try { return buildVariableDefs(toAllDataSources(formulaCtx)); } catch { return []; } }, [formulaCtx]);
  const systemVarMap  = useMemo(() => { if (!systemVarDefs.length) return {}; try { return buildVariableMap(systemVarDefs, toAllDataSources(formulaCtx)); } catch { return {}; } }, [formulaCtx, systemVarDefs]);

  const totalArtsZona = rows.length;
  const colNameToToken = useCallback((n: string) => n.replace(/[^a-zA-Z0-9]/g,'_').toUpperCase(), []);

  const buildRowVarMapDistrib = useCallback((row: DistribRow) => {
    const ubic  = ubicMap[row.ubicacion] ?? { total_articulos:0, suma_cant_max:0, suma_cant_min:0, pct_picking_promedio:0 };
    const slot  = slotStats[row.ubicacion];

    // Slot cost variables — one per formula column in Costos de Slots, linked by Ubicación
    // Token = sanitized column name, e.g. "Costo por Slot" → COSTO_POR_SLOT
    const slotCostVars: Record<string, number> = {};
    for (const col of slotCostoCols) {
      const token = col.nombre.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
      slotCostVars[token] = slotCostos[row.ubicacion]?.[`name:${col.nombre}`] ?? 0;
    }

    return {
      // Article-level
      PCT_PICKING: row.pct_picking,
      CANT_MAX: row.cant_max,
      CANT_MIN: row.cant_min,
      // Volumetría — cruzada desde costos_almacen_volumetria_raw por Id Artículo
      VOLUMEN: volMap[row.id_articulo] ?? 0,
      // Ubicación-level (from grouped table)
      TOTAL_ARTICULOS: ubic.total_articulos,
      SUMA_CANT_MAX_UBIC: ubic.suma_cant_max,
      SUMA_CANT_MIN_UBIC: ubic.suma_cant_min,
      PCT_PICKING_PROM_UBIC: ubic.pct_picking_promedio,
      ZONA_TOTAL_ARTS: totalArtsZona,
      // Slot stats — cross-referenced from Costos de Slots by Ubicación code
      SLOT_TOTAL:      slot?.total      ?? 0,
      SLOT_LIBRES:     slot?.libres     ?? 0,
      SLOT_BLOQUEADOS: slot?.bloqueados ?? 0,
      SLOT_RESERVADOS: slot?.reservados ?? 0,
      SLOT_PCT_LIBRES: slot?.pct_libres ?? 0,
      // Slot cost variables — e.g. COSTO_POR_SLOT = 17.80 for this specific Ubicación
      ...slotCostVars,
      ...extraVars,
      ...systemVarMap,
    };
  }, [ubicMap, volMap, slotStats, slotCostoCols, slotCostos, totalArtsZona, extraVars, systemVarMap]);

  // Computed formula values per row (key = id_articulo + ubicacion)
  const computedCols = useMemo(() => {
    const result: Record<string, Record<string, {value:number|null;error:boolean}>> = {};
    const accum: Record<string, Record<string, number>> = {};
    for (const r of rows) { const k = r.ubicacion+'|'+r.id_articulo; accum[k] = {}; }
    for (const col of columnas) {
      result[col.id] = {};
      const colToken = colNameToToken(col.nombre);
      const f = col.formula?.trim();
      if (!f) { for (const r of rows) { const k=r.ubicacion+'|'+r.id_articulo; accum[k][colToken]=0; result[col.id][k]={value:null,error:false}; } continue; }
      for (const r of rows) {
        const k = r.ubicacion+'|'+r.id_articulo;
        const varMap = { ...buildRowVarMapDistrib(r), ...accum[k] };
        const ev = evalFormula(f, varMap);
        const val = ev.ok ? ev.value : null;
        accum[k][colToken] = val ?? 0;
        result[col.id][k] = { value: val, error: !ev.ok };
      }
    }
    return result;
  }, [columnas, rows, buildRowVarMapDistrib, colNameToToken]);

  // Column management
  const addCol = async () => {
    if (!newColName.trim()) return;
    const { data } = await supabase.from('zona_picking_distribucion_columnas').insert({ nombre: newColName.trim(), orden: columnas.length, zona: distColZoneKey }).select().maybeSingle();
    if (data) setColumnas(prev => [...prev, data as DistribCol]);
    setNewColName(''); setAddingCol(false);
  };
  const deleteCol = async (id: string) => {
    if (!confirm('¿Eliminar esta columna?')) return;
    await supabase.from('zona_picking_distribucion_columnas').delete().eq('id', id);
    setColumnas(prev => prev.filter(c => c.id !== id));
  };
  const saveFormula = async (formula: string) => {
    if (!editingFormula) return;
    const col = columnas.find(c => c.id === editingFormula.id);
    await supabase.from('zona_picking_distribucion_columnas').update({ formula: formula || null }).eq('id', editingFormula.id);
    logChange({ modulo: 'zona-picking', accion: 'update_formula_distribucion', entidad_tipo: 'zona_picking_distribucion_columnas', entidad_id: editingFormula.id, entidad_label: col?.nombre, campo: 'formula', valor_antes: col?.formula ?? null, valor_despues: formula || null });
    setColumnas(prev => prev.map(c => c.id === editingFormula.id ? {...c, formula: formula || undefined} : c));
    setEditingFormula(null);
  };

  const filtered = useMemo(() => {
    let r = rows;
    if (search) {
      const q = search.toLowerCase();
      r = r.filter(x => x.id_articulo.toLowerCase().includes(q) || x.descripcion.toLowerCase().includes(q) || x.ubicacion.toLowerCase().includes(q) || x.compania.toLowerCase().includes(q));
    }
    return [...r].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'pct_picking')   return (a.pct_picking - b.pct_picking) * dir;
      if (sortKey === 'cant_max')      return (a.cant_max - b.cant_max) * dir;
      if (sortKey === 'cant_min')      return (a.cant_min - b.cant_min) * dir;
      if (sortKey === 'FIXED:volumen') return ((volMap[a.id_articulo]??0) - (volMap[b.id_articulo]??0)) * dir;
      // Slot cost column sort
      if (sortKey.startsWith('SLOT:')) {
        const slotColId = sortKey.slice(5);
        const va = slotCostos[a.ubicacion]?.[slotColId] ?? 0;
        const vb = slotCostos[b.ubicacion]?.[slotColId] ?? 0;
        return (va - vb) * dir;
      }
      // Formula column sort — find column by id and compare computed values
      const matchedCol = columnas.find(c => c.id === sortKey);
      if (matchedCol) {
        const ka = a.ubicacion+'|'+a.id_articulo;
        const kb = b.ubicacion+'|'+b.id_articulo;
        const va = computedCols[sortKey]?.[ka]?.value ?? 0;
        const vb = computedCols[sortKey]?.[kb]?.value ?? 0;
        return (va - vb) * dir;
      }
      return (String((a as any)[sortKey] ?? '') < String((b as any)[sortKey] ?? '') ? -1 : String((a as any)[sortKey] ?? '') > String((b as any)[sortKey] ?? '') ? 1 : 0) * dir;
    });
  }, [rows, search, sortKey, sortDir, columnas, computedCols]);

  const totalPages = Math.ceil(filtered.length / PAGE);
  const paged = filtered.slice(page * PAGE, (page + 1) * PAGE);
  const toggleSort = (k: string) => { if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(k); setSortDir(columnas.some(c => c.id === k) ? 'desc' : 'asc'); } setPage(0); };
  const si = (k: string) => sortKey !== k ? 'ri-expand-up-down-line text-slate-300' : sortDir === 'asc' ? 'ri-sort-asc text-slate-700' : 'ri-sort-desc text-slate-700';

  const handleExportDistrib = useCallback(() => {
    const fmtN = (n: number|null|undefined) => n != null ? Math.round(n*10000)/10000 : '';
    const rk = (r: DistribRow) => r.ubicacion+'|'+r.id_articulo;
    const fixedH = ['Zona Picking','Ubicación','Id Artículo','Descripción','% Picking','Cant. Máx.','Cant. Mín.','Arts./Ubic.','Compañía','Volumen'];
    const slotH = slotCostoCols.map(c=>c.nombre);
    const colH = columnas.map(c=>c.nombre);
    const headers1 = [...fixedH, ...slotH, ...colH];
    const rows1 = filtered.map(r => [
      r.zona_picking, r.ubicacion, r.id_articulo, r.descripcion,
      fmtN(r.pct_picking), r.cant_max, r.cant_min, fmtN(ubicMap[r.ubicacion]?.total_articulos),
      r.compania, fmtN(volMap[r.id_articulo]),
      ...slotCostoCols.map(c => fmtN(slotCostos[r.ubicacion]?.[c.id])),
      ...columnas.map(c => fmtN(computedCols[c.id]?.[rk(r)]?.value)),
    ]);
    const headers2 = ['Columna','Expresión','Ejemplo (primera fila)'];
    const sampleKey = filtered[0] ? rk(filtered[0]) : '';
    const rows2 = columnas.map(c => [c.nombre, c.formula??'(sin fórmula)', fmtN(computedCols[c.id]?.[sampleKey]?.value)]);
    downloadExcelMultiSheet(`zona_picking_${activeZonas.join('_').slice(0,40)}.xlsx`, [
      { name: 'Datos', headers: headers1, rows: rows1 },
      ...(rows2.length > 0 ? [{ name: 'Fórmulas', headers: headers2, rows: rows2 }] : []),
    ]);
  }, [filtered, columnas, computedCols, slotCostoCols, slotCostos, ubicMap, volMap, activeZonas]);

  return (
    <div className="space-y-3">
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3">
        <p className="text-sm font-semibold text-indigo-800">Distribución Slot Prime — artículos individuales de la zona seleccionada</p>
        <p className="text-xs text-indigo-500 mt-0.5">
          Variables de artículo: <code className="bg-indigo-100 px-1 rounded">{'{PCT_PICKING}'}</code> <code className="bg-indigo-100 px-1 rounded ml-1">{'{CANT_MAX}'}</code> ·
          Variables de slot: <code className="bg-indigo-100 px-1 rounded ml-1">{'{SLOT_TOTAL}'}</code> <code className="bg-indigo-100 px-1 rounded ml-1">{'{SLOT_LIBRES}'}</code> ·
          {slotCostoCols.length > 0 && <span className="ml-1 text-emerald-600 font-medium">{slotCostoCols.length} columna(s) de costo desde Costos de Slots</span>}
        </p>
      </div>

      {/* ── Gestión de columnas de fórmula ── */}
      <div className="bg-white border border-indigo-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-indigo-100 bg-indigo-50 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-indigo-700">Columnas de fórmula — valor exacto por artículo</p>
            <p className="text-[10px] text-indigo-400 mt-0.5">Ej: <code className="bg-indigo-100 px-0.5 rounded">{'Costo = {COSTOS_TOTAL_*} * {PCT_PICKING} / 100 / {TOTAL_ARTICULOS}'}</code></p>
          </div>
          {!addingCol && <div className="flex items-center gap-2">
            <button onClick={handleExportDistrib} className="flex items-center gap-1 px-3 py-1.5 border border-indigo-300 text-indigo-700 hover:bg-indigo-50 text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap"><i className="ri-file-excel-2-line"/>Descargar .xlsx</button>
            <button onClick={()=>setAddingCol(true)} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap"><i className="ri-add-line"/>Agregar columna</button>
          </div>}
        </div>
        {addingCol && (
          <div className="px-4 py-3 border-b border-indigo-100 bg-indigo-50/50 flex items-center gap-3">
            <input type="text" value={newColName} onChange={e=>setNewColName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')addCol();if(e.key==='Escape'){setAddingCol(false);setNewColName('');}}} placeholder="Nombre de columna (ej: Costo por artículo)" className="flex-1 px-3 py-1.5 text-sm border border-indigo-300 rounded-lg focus:outline-none bg-white" autoFocus/>
            <button onClick={addCol} disabled={!newColName.trim()} className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white text-xs rounded-lg cursor-pointer">Crear</button>
            <button onClick={()=>{setAddingCol(false);setNewColName('');}} className="px-3 py-1.5 text-slate-500 hover:bg-slate-100 text-xs rounded-lg cursor-pointer">Cancelar</button>
          </div>
        )}
        {columnas.length === 0 && !addingCol ? (
          <p className="px-4 py-5 text-center text-slate-400 text-xs">Sin columnas aún. Agrega una con fórmula.</p>
        ) : (
          <div className="flex flex-wrap gap-3 px-4 py-3">
            {columnas.map(col => {
              const sRow = rows.find(r => !filterZona || r.zona_picking === filterZona);
              const sKey = sRow ? sRow.ubicacion+'|'+sRow.id_articulo : '';
              const sVal = sRow ? computedCols[col.id]?.[sKey]?.value : undefined;
              return (
                <div key={col.id} className="flex items-center gap-2 bg-white border border-indigo-200 rounded-lg px-3 py-2">
                  <span className="text-xs font-medium text-indigo-700">{col.nombre}</span>
                  {sVal != null && <span className="text-sm font-bold text-slate-800 tabular-nums">{new Intl.NumberFormat('es-CO',{minimumFractionDigits:2,maximumFractionDigits:2}).format(sVal)}</span>}
                  <span className="text-[10px] text-slate-400 italic max-w-[160px] overflow-hidden text-ellipsis whitespace-nowrap" title={col.formula}>{col.formula?col.formula.slice(0,35)+(col.formula.length>35?'...':''):'sin fórmula'}</span>
                  <button onClick={e=>{const rect=(e.currentTarget as HTMLElement).getBoundingClientRect();const colIdx=columnas.findIndex(c=>c.id===col.id);setEditingFormula({id:col.id,colIdx,formula:col.formula??'',position:{top:rect.bottom+4,left:Math.max(8,rect.left-250)}});}} className="w-6 h-6 flex items-center justify-center rounded text-indigo-400 hover:text-indigo-600 hover:bg-indigo-100 cursor-pointer" title="Editar fórmula"><i className="ri-functions text-xs"/></button>
                  <button onClick={()=>deleteCol(col.id)} className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-rose-500 hover:bg-rose-50 cursor-pointer"><i className="ri-delete-bin-line text-xs"/></button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[220px]">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><i className="ri-search-line text-sm text-slate-400"/></div>
          <input type="text" placeholder="Buscar artículo, descripción, ubicación..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none bg-white placeholder:text-slate-400"/>
        </div>
        <span className="text-xs text-slate-400 whitespace-nowrap">{filtered.length.toLocaleString('es-CO')} filas</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"/></div>
      ) : (
        <div className="border border-slate-200 rounded-lg overflow-auto max-h-[65vh]">
          <table className="text-xs whitespace-nowrap w-full">
            <thead>
              <tr className="bg-slate-50 sticky top-0 z-10">
                <th onClick={() => toggleSort('zona_picking')} className="px-3 py-2.5 text-left text-slate-500 font-semibold border-r border-slate-200 cursor-pointer hover:bg-slate-100">Zona Picking <i className={si('zona_picking')}/></th>
                <th onClick={() => toggleSort('ubicacion')} className="px-3 py-2.5 text-left text-slate-500 font-semibold border-r border-slate-200 cursor-pointer hover:bg-slate-100">Ubicación <i className={si('ubicacion')}/></th>
                <th onClick={() => toggleSort('id_articulo')} className="px-3 py-2.5 text-left text-slate-500 font-semibold border-r border-slate-200 cursor-pointer hover:bg-slate-100">Id Artículo <i className={si('id_articulo')}/></th>
                <th className="px-3 py-2.5 text-left text-slate-500 font-semibold border-r border-slate-200">Descripción</th>
                <th onClick={() => toggleSort('pct_picking')} className="px-3 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200 cursor-pointer hover:bg-slate-100">% Pick. <i className={si('pct_picking')}/></th>
                <th onClick={() => toggleSort('cant_max')} className="px-3 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200 cursor-pointer hover:bg-slate-100">Cant. Máx. <i className={si('cant_max')}/></th>
                <th className="px-3 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200">Cant. Mín.</th>
                <th className="px-3 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200">Artíc./Ubic.</th>
                <th className="px-3 py-2.5 text-left text-slate-500 font-semibold border-r border-slate-200">Compañía</th>
                <th onClick={() => toggleSort('FIXED:volumen')} className="px-3 py-2.5 text-right text-cyan-600 font-semibold border-r border-slate-200 cursor-pointer hover:bg-cyan-100 bg-cyan-50 whitespace-nowrap"><i className="ri-box-3-line text-[10px] mr-1"/>Volumen <i className={`ml-0.5 ${si('FIXED:volumen')}`}/></th>
                {/* Slot cost columns from Costos de Slots — matched by Ubicación code */}
                {slotCostoCols.map(col => <th key={col.id} onClick={()=>toggleSort(`SLOT:${col.id}`)} className={`px-3 py-2.5 text-right font-semibold border-r border-slate-200 whitespace-nowrap cursor-pointer hover:bg-emerald-100 bg-emerald-50 text-emerald-700`} title={`Fórmula (Costos de Slots): ${col.formula}`}><i className="ri-stack-line text-[10px] mr-1"/>{col.nombre} <i className={`ml-0.5 ${si(`SLOT:${col.id}`)}`}/></th>)}
                {/* Custom formula columns */}
                {columnas.map(col => <th key={col.id} onClick={()=>toggleSort(col.id)} className={`px-3 py-2.5 text-right font-semibold border-r border-slate-200 whitespace-nowrap cursor-pointer hover:bg-indigo-100 ${col.formula?'bg-indigo-50 text-indigo-600':'text-slate-400'}`}>{col.nombre}{col.formula&&<span className="ml-1 text-[9px] bg-indigo-200 text-indigo-700 px-1 rounded font-mono">fx</span>} <i className={`ml-0.5 ${si(col.id)}`}/></th>)}
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-400">{search ? 'Sin resultados' : 'Sin datos'}</td></tr>
              ) : paged.map((row, i) => (
                <tr key={`${row.zona_picking}|${row.ubicacion}|${row.id_articulo}|${i}`} className={`border-t border-slate-100 hover:bg-indigo-50/40 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                  <td className="px-3 py-1.5 text-slate-500 border-r border-slate-100 max-w-[160px] overflow-hidden text-ellipsis" title={row.zona_picking}>{row.zona_picking || '—'}</td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-slate-700 border-r border-slate-100 font-medium">{row.ubicacion || '—'}</td>
                  <td className="px-3 py-1.5 font-medium text-indigo-700 border-r border-slate-100">{row.id_articulo || '—'}</td>
                  <td className="px-3 py-1.5 text-slate-600 border-r border-slate-100 max-w-[260px] overflow-hidden text-ellipsis" title={row.descripcion}>{row.descripcion || '—'}</td>
                  <td className="px-3 py-1.5 text-right border-r border-slate-100">
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="w-10 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-violet-400 rounded-full" style={{ width: `${Math.min(row.pct_picking, 100)}%` }}/></div>
                      <span className="text-violet-700 font-semibold w-10 text-right">{fmtDec(row.pct_picking)}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-right text-slate-700 font-medium border-r border-slate-100">{row.cant_max.toLocaleString('es-CO')}</td>
                  <td className="px-3 py-1.5 text-right text-slate-500 border-r border-slate-100">{row.cant_min.toLocaleString('es-CO')}</td>
                  <td className="px-3 py-1.5 text-right text-indigo-600 font-semibold border-r border-slate-100">{fmt(ubicMap[row.ubicacion]?.total_articulos ?? 0)}</td>
                  <td className="px-3 py-1.5 text-slate-500 border-r border-slate-100">{row.compania || '—'}</td>
                  {/* Volumen from costos_almacen_volumetria_raw */}
                  {(() => { const vol = volMap[row.id_articulo] ?? 0; return <td className="px-3 py-1.5 text-right border-r border-slate-100 bg-cyan-50/40"><span className={vol>0?'text-cyan-700 font-medium tabular-nums':'text-slate-200 text-[10px]'}>{vol>0?new Intl.NumberFormat('es-CO',{minimumFractionDigits:4,maximumFractionDigits:4}).format(vol):'—'}</span></td>; })()}
                  {/* Slot cost cells from Costos de Slots module */}
                  {slotCostoCols.map(col => {
                    const val = slotCostos[row.ubicacion]?.[col.id];
                    return <td key={`slot_${col.id}`} className="px-3 py-1.5 text-right border-r border-slate-100 bg-emerald-50/30" title={`${col.nombre} (Costos de Slots)`}>
                      {val != null ? <span className="text-emerald-700 font-bold tabular-nums">{new Intl.NumberFormat('es-CO',{minimumFractionDigits:2,maximumFractionDigits:2}).format(val)}</span> : <span className="text-slate-200 text-[10px]">—</span>}
                    </td>;
                  })}
                  {columnas.map(col => {
                    const k = row.ubicacion+'|'+row.id_articulo;
                    const cell = computedCols[col.id]?.[k];
                    const hasF = !!col.formula;
                    return <td key={col.id} className="px-3 py-1.5 text-right border-r border-slate-100 bg-indigo-50/20">
                      {hasF ? (cell?.error ? <span className="text-rose-400 text-[10px]">Err</span> : cell?.value != null ? <span className="text-indigo-700 font-bold tabular-nums">{new Intl.NumberFormat('es-CO',{minimumFractionDigits:2,maximumFractionDigits:2}).format(cell.value)}</span> : <span className="text-slate-300">—</span>) : <span className="text-slate-200 text-[10px]">—</span>}
                    </td>;
                  })}
                </tr>
              ))}
            </tbody>
            {paged.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-100/80">
                  <td className="px-3 py-2 font-semibold text-slate-600 text-xs" colSpan={2}>{filtered.length.toLocaleString('es-CO')} filas</td>
                  <td colSpan={2} className="px-3 py-2 border-r border-slate-100"/>
                  <td className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-violet-700">{fmtDec(filtered.length > 0 ? filtered.reduce((s,r)=>s+r.pct_picking,0)/filtered.length : 0)}% prom.</span></td>
                  <td className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-slate-700">{filtered.reduce((s,r)=>s+r.cant_max,0).toLocaleString('es-CO')}</span></td>
                  <td className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-slate-500">{filtered.reduce((s,r)=>s+r.cant_min,0).toLocaleString('es-CO')}</span></td>
                  <td className="px-3 py-2 border-r border-slate-100"/>
                  {/* Slot cost totals */}
                  {slotCostoCols.map(col => {
                    const total = filtered.reduce((s,r) => s + (slotCostos[r.ubicacion]?.[col.id] ?? 0), 0);
                    return <td key={`sf_${col.id}`} className="px-3 py-2 text-right border-r border-slate-100 bg-emerald-50/40"><span className="text-xs font-bold text-emerald-700 tabular-nums">{new Intl.NumberFormat('es-CO',{minimumFractionDigits:2,maximumFractionDigits:2}).format(total)}</span></td>;
                  })}
                  {columnas.map(col => { const t = filtered.reduce((s,r) => s+(computedCols[col.id]?.[r.ubicacion+'|'+r.id_articulo]?.value??0),0); return <td key={`cf_${col.id}`} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-indigo-700">{new Intl.NumberFormat('es-CO',{minimumFractionDigits:2,maximumFractionDigits:2}).format(t)}</span></td>; })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-xs text-slate-400">{page*PAGE+1}–{Math.min((page+1)*PAGE,filtered.length)} de {filtered.length.toLocaleString('es-CO')}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 cursor-pointer"><i className="ri-arrow-left-s-line"/>Anterior</button>
            <span className="text-xs text-slate-400 px-2">{page+1}/{totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page >= totalPages-1} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 cursor-pointer">Siguiente<i className="ri-arrow-right-s-line"/></button>
          </div>
        </div>
      )}

      {/* Formula editor popup — includes previous formula columns as variables */}
      {editingFormula && (() => {
        const sRow = rows[0];
        const sKey = sRow ? sRow.ubicacion+'|'+sRow.id_articulo : '';
        const prevCols = editingFormula.colIdx > 0 ? columnas.slice(0, editingFormula.colIdx) : [];
        const prevColTokens = prevCols.map(pc => ({
          token: colNameToToken(pc.nombre),
          label: pc.nombre + ' (columna anterior)',
          value: sRow ? (computedCols[pc.id]?.[sKey]?.value ?? undefined) : undefined,
        }));
        // Slot cost tokens — one per configured formula in Costos de Slots, value depends on Ubicación
        const slotCostTokens = slotCostoCols.map(col => ({
          token: col.nombre.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase(),
          label: `${col.nombre} (Costos de Slots · por ubicación)`,
          value: sRow ? (slotCostos[sRow.ubicacion]?.[`name:${col.nombre}`] ?? 0) : undefined,
        }));
        const allTokens = [
          ...DISTRIB_TOKENS.map(t => ({ token: t.token.replace(/\{|\}/g,''), label: t.label, value: sRow ? (buildRowVarMapDistrib(sRow) as any)[t.token.replace(/\{|\}/g,'')] : undefined })),
          ...slotCostTokens,   // ← slot cost variables (COSTO_POR_SLOT, etc.)
          ...prevColTokens,
        ];
        const enrichedVarMap = sRow ? { ...buildRowVarMapDistrib(sRow), ...Object.fromEntries(prevCols.map(pc => [colNameToToken(pc.nombre), computedCols[pc.id]?.[sKey]?.value ?? 0])) } : systemVarMap;
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

// ── Tabla de Variables — define constantes globales usables en fórmulas ───────
function TablaVariables({ varColumnas, varColValues, formulaCtx, onReload }: {
  varColumnas: VarColumna[];
  varColValues: Record<string, number>;
  formulaCtx: FormulaContext;
  onReload: () => void;
}) {
  const [addingCol, setAddingCol] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingFormula, setEditingFormula] = useState<{ id: string; formula: string; position: { top: number; left: number } } | null>(null);

  const systemVarDefs = useMemo(() => { try { return buildVariableDefs(toAllDataSources(formulaCtx)); } catch { return []; } }, [formulaCtx]);
  const systemVarMap = useMemo(() => { if (!systemVarDefs.length) return {}; try { return buildVariableMap(systemVarDefs, toAllDataSources(formulaCtx)); } catch { return {}; } }, [formulaCtx, systemVarDefs]);

  const addCol = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    await supabase.from('zona_picking_variables_columnas').insert({ nombre: newName.trim(), orden: varColumnas.length });
    setSaving(false); setNewName(''); setAddingCol(false); onReload();
  };

  const deleteCol = async (id: string) => {
    if (!confirm('¿Eliminar esta variable?')) return;
    await supabase.from('zona_picking_variables_columnas').delete().eq('id', id);
    onReload();
  };

  const saveFormula = async (formula: string) => {
    if (!editingFormula) return;
    await supabase.from('zona_picking_variables_columnas').update({ formula: formula || null }).eq('id', editingFormula.id);
    setEditingFormula(null); onReload();
  };

  return (
    <div className="bg-white border border-violet-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-violet-100 bg-violet-50 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-violet-800">Tabla de Variables</p>
          <p className="text-xs text-violet-500 mt-0.5">Define valores globales con fórmulas del sistema. Usa el token en fórmulas de ubicación: <code className="bg-violet-100 px-1 rounded">{'{NOMBRE_VARIABLE}'}</code></p>
        </div>
        {!addingCol && <button onClick={() => setAddingCol(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500 hover:bg-violet-600 text-white text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap"><i className="ri-add-line"/>Agregar variable</button>}
      </div>

      {addingCol && (
        <div className="px-5 py-3 border-b border-violet-100 bg-violet-50/50 flex items-center gap-3">
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addCol(); if (e.key === 'Escape') { setAddingCol(false); setNewName(''); } }} placeholder="Nombre de la variable (ej: Costo Picking Total)" className="flex-1 px-3 py-1.5 text-sm border border-violet-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-violet-400 bg-white" autoFocus />
          <button onClick={addCol} disabled={!newName.trim() || saving} className="px-3 py-1.5 bg-violet-500 hover:bg-violet-600 disabled:opacity-40 text-white text-xs rounded-lg cursor-pointer">Crear</button>
          <button onClick={() => { setAddingCol(false); setNewName(''); }} className="px-3 py-1.5 text-slate-500 hover:bg-slate-100 text-xs rounded-lg cursor-pointer">Cancelar</button>
        </div>
      )}

      {varColumnas.length === 0 && !addingCol ? (
        <div className="px-5 py-8 text-center text-slate-400 text-sm">
          <i className="ri-variable-line text-2xl block mb-2 text-slate-300"/>
          Sin variables. Crea una variable con una fórmula y úsala como <code className="bg-slate-100 px-1 rounded text-xs">{'{TOKEN}'}</code> en las fórmulas por ubicación.
        </div>
      ) : (
        <table className="text-xs w-full">
          <thead><tr className="bg-slate-50 border-b border-slate-200">
            <th className="px-4 py-2.5 text-left text-slate-500 font-semibold border-r border-slate-200">Nombre</th>
            <th className="px-4 py-2.5 text-left text-slate-500 font-semibold border-r border-slate-200">Token</th>
            <th className="px-4 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200">Valor Calculado</th>
            <th className="px-4 py-2.5 text-left text-slate-500 font-semibold border-r border-slate-200">Fórmula</th>
            <th className="px-4 py-2.5 text-center text-slate-500 font-semibold w-20">Acciones</th>
          </tr></thead>
          <tbody>
            {varColumnas.map((col, i) => {
              const token = col.nombre.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
              const val = varColValues[token];
              return (
                <tr key={col.id} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                  <td className="px-4 py-2.5 font-medium text-slate-700 border-r border-slate-100">{col.nombre}</td>
                  <td className="px-4 py-2.5 border-r border-slate-100"><code className="bg-violet-100 text-violet-700 px-2 py-0.5 rounded font-mono text-[11px]">{`{${token}}`}</code></td>
                  <td className="px-4 py-2.5 text-right border-r border-slate-100">
                    {!col.formula ? <span className="text-slate-300 italic text-[11px]">sin fórmula</span>
                    : val != null ? <span className="text-lg font-bold text-violet-700">{new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val)}</span>
                    : <span className="text-rose-400 text-[11px]">Error en fórmula</span>}
                  </td>
                  <td className="px-4 py-2.5 border-r border-slate-100">
                    {col.formula ? <span className="font-mono text-[10px] text-slate-500 max-w-[200px] overflow-hidden text-ellipsis block">{col.formula}</span> : <span className="text-slate-300 italic text-[11px]">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={e => { const rect = (e.currentTarget as HTMLElement).getBoundingClientRect(); setEditingFormula({ id: col.id, formula: col.formula ?? '', position: { top: rect.bottom + 4, left: Math.max(8, rect.left - 300) } }); }} className={`w-7 h-7 flex items-center justify-center rounded cursor-pointer ${col.formula ? 'text-violet-600 hover:bg-violet-100' : 'text-slate-400 hover:text-violet-500 hover:bg-violet-50'}`} title="Editar fórmula"><i className="ri-functions text-xs"/></button>
                      <button onClick={() => deleteCol(col.id)} className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 cursor-pointer"><i className="ri-delete-bin-line text-xs"/></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {editingFormula && (
        <ZonaCeldaFormulaEditor
          formula={editingFormula.formula}
          varMap={systemVarMap}
          onSave={saveFormula}
          onCancel={() => setEditingFormula(null)}
          position={editingFormula.position}
          systemVarDefs={systemVarDefs}
          systemVarMap={systemVarMap}
        />
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CostoZonaPickingPage() {
  const [masivoInfo,setMasivoInfo]=useState<MasivoInfo|null>(null);
  const [loading,setLoading]=useState(true);
  const [showUpload,setShowUpload]=useState(false);
  const [clearing,setClearing]=useState(false);
  const [tab,setTab]=useState<Tab>('resumen');
  const [zonaResumen,setZonaResumen]=useState<ZonaResumen[]>([]);
  const [globalTotals,setGlobalTotals]=useState<{total_ubicaciones:number;total_zonas:number;total_articulos:number;total_companias:number;pct_picking_promedio:number}|null>(null);
  const [formulaCtx,setFormulaCtx]=useState<FormulaContext>(EMPTY_FORMULA_CTX);
  // Variable columns — global formula constants usable in per-location formulas
  const [varColumnas,setVarColumnas]=useState<VarColumna[]>([]);
  const [varColValues,setVarColValues]=useState<Record<string,number>>({});
  // Collapsible ubicacion table — collapsed by default, resets on zone/cluster change
  const [showUbicTable, setShowUbicTable] = useState(false);

  const [activeSelection,setActiveSelection]=useState<ActiveSelection>({type:'zone',zona:''});
  const isCluster=activeSelection.type==='cluster';
  const activeZona=activeSelection.type==='zone'?activeSelection.zona:'';
  const activeCluster=activeSelection.type==='cluster'?activeSelection.cluster:null;
  const activeZonas=isCluster?(activeCluster?.zonas??[]):(activeZona?[activeZona]:[]);
  const zonaLabel=isCluster?(activeCluster?.nombre??'Cluster'):activeZona;

  const {clusters,loadClusters}=useZonaClusters('zona_picking_clusters');

  const loadData=useCallback(async()=>{
    setLoading(true);
    const{count}=await supabase.from('zona_picking_raw').select('*',{count:'exact',head:true});
    if(!count||count===0){setMasivoInfo(null);setLoading(false);return;}
    const{data:sample}=await supabase.from('zona_picking_raw').select('raw_data').limit(1).single();
    setMasivoInfo({totalRegistros:count,headers:sample?.raw_data?Object.keys(sample.raw_data as Record<string,unknown>):[]});

    const[{data:totRaw},{data:zonRaw},base]=await Promise.all([
      supabase.rpc('fn_picking_totales'),
      supabase.rpc('fn_picking_zona_resumen'),
      fetchBaseQueryData(),
    ]);
    const t0=(totRaw as any[])?.[0]??{};
    setGlobalTotals({total_ubicaciones:Number(t0.total_ubicaciones)||0,total_zonas:Number(t0.total_zonas)||0,total_articulos:Number(t0.total_articulos)||0,total_companias:Number(t0.total_companias)||0,pct_picking_promedio:Number(t0.pct_picking_promedio)||0});
    const zonas=((zonRaw??[]) as any[]).map((r:any)=>({zona:String(r.zona??''),total_ubicaciones:Number(r.total_ubicaciones)||0,articulos_distintos:Number(r.articulos_distintos)||0,companias_distintas:Number(r.companias_distintas)||0,pct_picking_promedio:Number(r.pct_picking_promedio)||0,suma_cant_max:Number(r.suma_cant_max)||0}));
    setZonaResumen(zonas);

    // Build full formulaCtx (same enrichment as costos/page.tsx)
    const{areasData,invData,gastosColData,gastosFilData,areaDistribData,moColData,moFilData,volColData,volFilData,empData,volDistData,factoresData}=base as any;
    const[{data:cosColData},{data:cosFilData}]=await Promise.all([supabase.from('costos_columnas').select('*').order('orden'),supabase.from('costos_operacion').select('*').order('orden')]);
    const areasWithCat=((areasData??[]) as any[]).map((a:any)=>({nombre:a.nombre,metros_cuadrados:a.metros_cuadrados??0,metros_cubicos:a.metros_cubicos??0,cantidad_racks:a.cantidad_racks??0,categoria:a.categoria,costo_area:a.costo_area??0,costo_area_formula:a.costo_area_formula}));
    const catTotals:Record<string,number>={};const catTotalsCubic:Record<string,number>={};let totalM3=0;
    areasWithCat.forEach(a=>{const c=a.categoria??'Sin categoría';catTotals[c]=(catTotals[c]??0)+(a.metros_cuadrados??0);catTotalsCubic[c]=(catTotalsCubic[c]??0)+(a.metros_cubicos??0);totalM3+=a.metros_cubicos??0;});
    const enrichedAreaDist=((areaDistribData??[]) as any[]).map((d:any)=>{const match=areasWithCat.find(a=>a.nombre===d.area_name);const cat=match?.categoria??'Sin categoría';const m2=match?.metros_cuadrados??0;const m3=match?.metros_cubicos??0;const ct=catTotals[cat]??0;const ctc=catTotalsCubic[cat]??0;return{...d,categoria:cat,category_distribution_percentage:ct>0?+((m2/ct)*100).toFixed(2):0,global_distribution_cubic_percentage:totalM3>0?+((m3/totalM3)*100).toFixed(2):0,category_distribution_cubic_percentage:ctc>0?+((m3/ctc)*100).toFixed(2):0};});
    const baseCtx:FormulaContext={inversiones:(invData as InversionRecord[])??[],gastosColumnas:(gastosColData??[]) as FormulaContext['gastosColumnas'],gastosFilas:(gastosFilData??[]) as FormulaContext['gastosFilas'],areaDistribucion:enrichedAreaDist as FormulaContext['areaDistribucion'],manoObraColumnas:(moColData??[]) as FormulaContext['manoObraColumnas'],manoObraFilas:(moFilData??[]) as FormulaContext['manoObraFilas'],manoObraEmpleados:(empData??[]) as FormulaContext['manoObraEmpleados'],volumenesColumnas:(volColData??[]) as FormulaContext['volumenesColumnas'],volumenesFilas:(volFilData??[]) as FormulaContext['volumenesFilas'],costosColumnas:(cosColData??[]) as FormulaContext['costosColumnas'],costosFilas:(cosFilData??[]) as FormulaContext['costosFilas'],areasData:areasWithCat.map(a=>({nombre:a.nombre,metros_cuadrados:a.metros_cuadrados,cantidad_racks:a.cantidad_racks,metros_cubicos:a.metros_cubicos,costo_area:a.costo_area})),volDistribucion:(volDistData??[]) as FormulaContext['volDistribucion'],factores:(factoresData??[]) as FormulaContext['factores'],masivoArticulos:[],masivoZonas:[],masivoZonaArticulos:[],masivoTotals:undefined};
    const mappedAreas=areasWithCat.map(a=>({...a}));
    for(const area of mappedAreas){if(area.costo_area_formula){try{area.costo_area=calcularFormula(area.costo_area_formula,baseCtx,area.nombre);}catch{}}}
    setFormulaCtx({...baseCtx,areasData:mappedAreas.map(a=>({nombre:a.nombre,metros_cuadrados:a.metros_cuadrados,cantidad_racks:a.cantidad_racks,metros_cubicos:a.metros_cubicos,costo_area:a.costo_area}))});
    setLoading(false);
  },[]);

  // Load and compute variable columns
  const loadVarColumnas = useCallback(async () => {
    const { data } = await supabase.from('zona_picking_variables_columnas').select('*').order('orden');
    setVarColumnas((data ?? []) as VarColumna[]);
  }, []);

  useEffect(()=>{loadData();loadClusters();loadVarColumnas();},[loadData,loadClusters,loadVarColumnas]);

  // Re-compute var column values whenever formulaCtx or varColumnas change
  useEffect(()=>{
    if(!varColumnas.length)return;
    try {
      const defs = buildVariableDefs(toAllDataSources(formulaCtx));
      const sysVarMap = buildVariableMap(defs, toAllDataSources(formulaCtx));
      const vals: Record<string,number> = {};
      for(const col of varColumnas) {
        if(col.formula?.trim()) {
          const token = col.nombre.replace(/[^a-zA-Z0-9]/g,'_').toUpperCase();
          const r = evalFormula(col.formula, sysVarMap);
          vals[token] = r.ok ? r.value : 0;
        }
      }
      setVarColValues(vals);
    } catch { setVarColValues({}); }
  },[varColumnas, formulaCtx]);
  useEffect(()=>{
    if(activeSelection.type==='zone'&&!activeSelection.zona&&zonaResumen.length>0){
      const first=zonaResumen.find(z=>!clusters.some(c=>c.zonas.includes(z.zona)));
      if(first)setActiveSelection({type:'zone',zona:first.zona});
    }
  },[zonaResumen,clusters]); // eslint-disable-line

  const handleClearAll=async()=>{
    if(!confirm('¿Eliminar TODOS los datos de Costo Zona Picking?'))return;
    setClearing(true);
    await supabase.from('zona_picking_raw').delete().neq('id','00000000-0000-0000-0000-000000000000');
    setClearing(false);loadData();
  };

  const clusteredZones=new Set(clusters.flatMap(c=>c.zonas));
  const unclusteredZones=zonaResumen.filter(z=>!clusteredZones.has(z.zona));
  const allZoneNames=zonaResumen.map(z=>z.zona);
  const ZONE_COLORS=['bg-violet-500','bg-indigo-500','bg-fuchsia-500','bg-purple-500','bg-pink-500','bg-sky-500','bg-teal-500','bg-rose-500'];

  if(loading)return<AppLayout title="Costo Zona Picking" subtitle="Cargando..."><div className="flex items-center justify-center py-32"><div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"/></div></AppLayout>;

  return(
    <AppLayout
      title="Costo Zona Picking"
      subtitle="Costo exacto por ubicación de picking · {PCT_PICKING} · Clusters de zonas"
      actions={<div className="flex items-center gap-2">
        {masivoInfo&&<button onClick={handleClearAll} disabled={clearing} className="flex items-center gap-2 px-4 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap disabled:opacity-50"><i className="ri-delete-bin-line"/>{clearing?'Limpiando...':'Limpiar'}</button>}
        <button onClick={()=>setShowUpload(true)} className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap"><i className="ri-file-excel-2-line"/>Cargar Excel</button>
      </div>}
    >
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div><h3 className="text-sm font-semibold text-slate-800">Costo Zona Picking</h3><p className="text-xs text-slate-400 mt-0.5">Zona: <strong>Zona Picking</strong> · Item: <strong>Ubicación individual</strong> · Variable clave: <strong>{'{PCT_PICKING}'}</strong></p></div>
            {masivoInfo&&<span className="text-xs px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 font-medium">{fmt(masivoInfo.totalRegistros)} ubicaciones</span>}
          </div>

          {!masivoInfo?(
            <div className="px-6 py-12 flex flex-col items-center gap-4">
              <div className="w-14 h-14 flex items-center justify-center rounded-full bg-violet-50"><i className="ri-map-pin-line text-2xl text-violet-400"/></div>
              <div className="text-center max-w-sm"><p className="text-slate-700 font-semibold text-sm">Sin datos de picking</p><p className="text-slate-400 text-xs mt-1">Carga un Excel con las ubicaciones de picking.</p></div>
              <button onClick={()=>setShowUpload(true)} className="flex items-center gap-2 px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap"><i className="ri-file-excel-2-line"/>Cargar Excel</button>
            </div>
          ):(
            <div className="px-6 py-4">
              <div className="flex gap-1 mb-4 flex-wrap">
                {[{id:'resumen',icon:'ri-dashboard-line',label:'Resumen'},{id:'zonas',icon:'ri-map-pin-line',label:'Por Zona Picking'},{id:'datos',icon:'ri-table-line',label:'Ver datos'}].map(t=>(
                  <button key={t.id} onClick={()=>setTab(t.id as Tab)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${tab===t.id?'bg-slate-800 text-white':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    <i className={`${t.icon} text-[11px]`}/>{t.label}
                  </button>
                ))}
              </div>

              {tab==='resumen'&&globalTotals&&(
                <div className="space-y-5">
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    <div className="bg-violet-50 border border-violet-100 rounded-lg px-4 py-3"><p className="text-xs text-violet-600">Total Ubicaciones</p><p className="text-lg font-bold text-violet-700">{fmt(globalTotals.total_ubicaciones)}</p></div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3"><p className="text-xs text-slate-500">Zonas Picking</p><p className="text-lg font-bold text-slate-700">{globalTotals.total_zonas}</p></div>
                    <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3"><p className="text-xs text-indigo-600">Artículos distintos</p><p className="text-lg font-bold text-indigo-700">{fmt(globalTotals.total_articulos)}</p></div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3"><p className="text-xs text-slate-500">Compañías</p><p className="text-lg font-bold text-slate-700">{globalTotals.total_companias}</p></div>
                    <div className="bg-fuchsia-50 border border-fuchsia-100 rounded-lg px-4 py-3"><p className="text-xs text-fuchsia-600">% Picking prom.</p><p className="text-lg font-bold text-fuchsia-700">{fmtDec(globalTotals.pct_picking_promedio)}%</p></div>
                  </div>

                  {/* ── Tabla de Conteo por Zona ── */}
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-700">Conteo de Ubicaciones por Zona</p>
                        <p className="text-xs text-slate-400 mt-0.5">Los datos numéricos fueron limpiados (ej: "2UD" → 2)</p>
                      </div>
                    </div>
                    <div className="overflow-auto">
                      <table className="text-xs w-full">
                        <thead><tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-4 py-2.5 text-left text-slate-500 font-semibold border-r border-slate-200">Zona Picking</th>
                          <th className="px-4 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200">Ubicaciones</th>
                          <th className="px-4 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200">% Total</th>
                          <th className="px-4 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200">Artículos</th>
                          <th className="px-4 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200">% Picking prom.</th>
                          <th className="px-4 py-2.5 text-right text-slate-500 font-semibold border-r border-slate-200">Σ Cant. Máx.</th>
                          {varColumnas.filter(c=>c.formula).map(c=><th key={c.id} className="px-4 py-2.5 text-right text-violet-600 font-semibold border-r border-slate-200 bg-violet-50/50">{c.nombre} <span className="text-[10px] font-mono bg-violet-100 px-1 rounded">fx</span></th>)}
                        </tr></thead>
                        <tbody>
                          {zonaResumen.map((z,i)=>{
                            const pctT=globalTotals.total_ubicaciones>0?(z.total_ubicaciones/globalTotals.total_ubicaciones)*100:0;
                            return<tr key={z.zona} className={`border-b border-slate-100 hover:bg-violet-50/30 ${i%2===0?'bg-white':'bg-slate-50/30'}`}>
                              <td className="px-4 py-2.5 font-medium text-slate-700 border-r border-slate-100 flex items-center gap-2"><span className={`w-2 h-2 rounded-full flex-shrink-0 ${ZONE_COLORS[i%ZONE_COLORS.length]}`}/>{z.zona}</td>
                              <td className="px-4 py-2.5 text-right font-bold text-violet-700 border-r border-slate-100">{fmt(z.total_ubicaciones)}</td>
                              <td className="px-4 py-2.5 text-right border-r border-slate-100"><div className="flex items-center justify-end gap-2"><div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-violet-400 rounded-full" style={{width:`${Math.max(pctT,0.5)}%`}}/></div><span className="text-slate-500 w-8 text-right">{pctT.toFixed(1)}%</span></div></td>
                              <td className="px-4 py-2.5 text-right text-slate-600 border-r border-slate-100">{fmt(z.articulos_distintos)}</td>
                              <td className="px-4 py-2.5 text-right text-fuchsia-600 font-medium border-r border-slate-100">{fmtDec(z.pct_picking_promedio)}%</td>
                              <td className="px-4 py-2.5 text-right text-slate-600 border-r border-slate-100">{fmtDec(z.suma_cant_max)}</td>
                              {varColumnas.filter(c=>c.formula).map(c=>{
                                const token=c.nombre.replace(/[^a-zA-Z0-9]/g,'_').toUpperCase();
                                const val=varColValues[token];
                                return<td key={c.id} className="px-4 py-2.5 text-right font-bold text-violet-700 border-r border-slate-100 bg-violet-50/30">{val!=null?new Intl.NumberFormat('es-CO',{minimumFractionDigits:2,maximumFractionDigits:2}).format(val):'—'}</td>;
                              })}
                            </tr>;
                          })}
                          <tr className="border-t-2 border-slate-200 bg-slate-100/80">
                            <td className="px-4 py-2 font-semibold text-slate-600 text-xs">{zonaResumen.length} zonas</td>
                            <td className="px-4 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-violet-700">{fmt(globalTotals.total_ubicaciones)}</span></td>
                            <td className="px-4 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-violet-600">100%</span></td>
                            <td className="px-4 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-slate-600">{fmt(globalTotals.total_articulos)}</span></td>
                            <td className="px-4 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-fuchsia-600">{fmtDec(globalTotals.pct_picking_promedio)}%</span></td>
                            <td className="px-4 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-slate-600">{fmtDec(zonaResumen.reduce((s,z)=>s+z.suma_cant_max,0))}</span></td>
                            {varColumnas.filter(c=>c.formula).map(c=><td key={c.id} className="px-4 py-2 border-r border-slate-100"/>)}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* ── Tabla de Variables — fórmulas globales usables en por-ubicación ── */}
                  <TablaVariables varColumnas={varColumnas} varColValues={varColValues} formulaCtx={formulaCtx} onReload={loadVarColumnas}/>
                </div>
              )}

              {tab==='zonas'&&(
                <div className="space-y-4">
                  <div className="flex gap-1.5 flex-wrap">
                    {clusters.map(cluster=>{
                      const isActive=activeSelection.type==='cluster'&&activeSelection.cluster.id===cluster.id;
                      const total=zonaResumen.filter(z=>cluster.zonas.includes(z.zona)).reduce((s,z)=>s+z.total_ubicaciones,0);
                      return<button key={cluster.id} onClick={()=>{setActiveSelection({type:'cluster',cluster});setShowUbicTable(false);}}
                        className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${isActive?`${clusterActiveBg(cluster.color)} border-transparent`:'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                        <i className={`ri-stack-line ${isActive?'text-white/80':'text-slate-400'}`}/>{cluster.nombre}
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${isActive?'bg-white/20 text-white':'bg-slate-100 text-slate-500'}`}>{fmt(total)}</span>
                      </button>;
                    })}
                    {clusters.length>0&&unclusteredZones.length>0&&<div className="flex items-center px-1"><div className="h-5 w-px bg-slate-200"/></div>}
                    {unclusteredZones.map((z,i)=>{
                      const isActive=activeSelection.type==='zone'&&activeSelection.zona===z.zona;
                      return<button key={z.zona} onClick={()=>{setActiveSelection({type:'zone',zona:z.zona});setShowUbicTable(false);}}
                        className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${isActive?'bg-violet-600 text-white border-transparent shadow-sm':'bg-white text-slate-600 border-slate-200 hover:border-violet-300 hover:bg-violet-50'}`}>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive?'bg-white/70':ZONE_COLORS[i%ZONE_COLORS.length]}`}/>
                        {z.zona}
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${isActive?'bg-white/20 text-white':'bg-slate-100 text-slate-500'}`}>{fmt(z.total_ubicaciones)}</span>
                        <span className={`text-[10px] ${isActive?'text-white/60':'text-fuchsia-600'}`}>{fmtDec(z.pct_picking_promedio)}%</span>
                      </button>;
                    })}
                  </div>

                  {/* ── 1. Distribución Slot Prime (principal — siempre visible) ── */}
                  {activeZonas.length > 0 && (
                    <TablaDistribucionSlotPrime
                      formulaCtx={formulaCtx}
                      extraVars={varColValues}
                      activeZonas={activeZonas}
                    />
                  )}

                  {/* ── 2. Tabla de Ubicaciones — colapsable, debajo, específica por cluster ── */}
                  {activeZonas.length > 0 && (
                    <div className="mt-3 border-t border-slate-200 pt-3">
                      <button
                        onClick={() => setShowUbicTable(v => !v)}
                        className="flex items-center gap-2 px-4 py-2.5 w-full bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 transition-colors cursor-pointer"
                      >
                        <i className={`ri-${showUbicTable ? 'subtract' : 'add'}-line text-sm`}/>
                        {showUbicTable ? 'Ocultar' : 'Ver'} tabla de ubicaciones por artículo
                        <span className="ml-auto text-xs text-slate-400">
                          {isCluster ? `Cluster: ${zonaLabel}` : zonaLabel}
                        </span>
                        <i className={`ri-arrow-${showUbicTable ? 'up' : 'down'}-s-line text-slate-400`}/>
                      </button>
                      {showUbicTable && (
                        <div className="mt-3">
                          <ZonaPickingDetailTable
                            zonas={activeZonas}
                            zona_label={zonaLabel}
                            formulaCtx={formulaCtx}
                            clusters={clusters}
                            onClustersChange={loadClusters}
                            allZoneNames={allZoneNames}
                            zonaTotals={zonaResumen}
                            extraVars={varColValues}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {tab==='datos'&&<RawTable headers={masivoInfo?.headers??[]}/>}
            </div>
          )}
        </div>
      </div>

      {showUpload&&(
        <React.Suspense fallback={null}>
          {React.createElement(React.lazy(()=>import('./components/ExcelUploadModal')),{onClose:()=>setShowUpload(false),onSuccess:loadData})}
        </React.Suspense>
      )}
    </AppLayout>
  );
}
