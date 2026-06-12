import React, { useState, useEffect, useCallback, useMemo, useDeferredValue } from 'react';
import { supabase } from '@/lib/supabase';
import AppLayout from '@/components/feature/AppLayout';
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
interface ZonaResumen { zona: string; total_ubicaciones: number; articulos_distintos: number; companias_distintas: number; pct_picking_promedio: number; }
interface PickingRow { ubicacion: string; id_articulo: string; id_compania: string; descripcion: string; zona_picking: string; pct_picking: number; cant_max: number; cant_min: number; compania: string; sucursal: string; id_presentacion: string; auto_reponer: string; }
interface ZonaColumna { id: string; zona: string; nombre: string; tipo: string; orden: number; formula?: string; }
interface MasivoInfo { totalRegistros: number; headers: string[] }
type Tab = 'resumen' | 'zonas' | 'datos';
type ActiveSelection = { type: 'zone'; zona: string } | { type: 'cluster'; cluster: { id: string; nombre: string; zonas: string[]; color: string; orden: number } };

const fmt    = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);
const fmtDec = (n: number) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

// Tokens disponibles en fórmulas de Zona Picking
const PICKING_TOKENS = [
  { token: '{PCT_PICKING}',   label: '% Picking',        desc: 'Porcentaje de picking de esta ubicación' },
  { token: '{CANT_MAX}',      label: 'Cantidad Máxima',  desc: 'Cantidad máxima de la ubicación' },
  { token: '{CANT_MIN}',      label: 'Cantidad Mínima',  desc: 'Cantidad mínima de la ubicación' },
  { token: '{ZONA_TOTAL}',    label: 'Total Zona',       desc: 'Total de ubicaciones en la zona' },
  { token: '{PCT_ZONA}',      label: '% de Zona',        desc: '% de esta ubicación sobre el total de la zona (1/ZONA_TOTAL × 100)' },
];

// ── Raw Table ─────────────────────────────────────────────────────────────────
function RawTable({ headers }: { headers: string[] }) {
  const [rows, setRows] = useState<Array<{ id: string; raw_data: Record<string, unknown> }>>([]);
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const PAGE = 50;
  const load = useCallback(async (p: number) => {
    setLoading(true);
    const { data, count: c } = await supabase.from('zona_picking_raw').select('id,raw_data', { count:'exact' }).order('created_at',{ascending:false}).range(p*PAGE,(p+1)*PAGE-1);
    if (data) { setRows(data as any); setCount(c ?? 0); }
    setLoading(false);
  }, []);
  useEffect(() => { load(page); }, [load, page]);
  const totalPages = Math.ceil(count / PAGE);
  const dh = headers.length > 0 ? headers : (rows[0]?.raw_data ? Object.keys(rows[0].raw_data) : []);
  return (
    <div className="space-y-3">
      <span className="text-xs text-slate-400">Pág. {page+1}/{Math.max(totalPages,1)} · {fmt(count)} filas</span>
      <div className="border border-slate-200 rounded-lg overflow-auto max-h-[55vh]">
        <table className="text-xs whitespace-nowrap w-full">
          <thead><tr className="bg-slate-50 sticky top-0 z-10"><th className="px-3 py-2 text-left text-slate-500 border-r border-slate-200">#</th>{dh.map(h=><th key={h} className="px-3 py-2 text-left text-slate-500 border-r border-slate-200 max-w-[160px] overflow-hidden text-ellipsis">{h}</th>)}</tr></thead>
          <tbody>{loading?<tr><td colSpan={dh.length+1} className="px-3 py-8 text-center text-slate-400">Cargando...</td></tr>:rows.map((r,i)=><tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50"><td className="px-3 py-1.5 text-slate-400 border-r border-slate-100 text-center">{page*PAGE+i+1}</td>{dh.map(h=>{const v=r.raw_data?.[h];return<td key={h} className="px-3 py-1.5 text-slate-600 border-r border-slate-100 max-w-[160px] overflow-hidden text-ellipsis">{v!=null?String(v):'—'}</td>;})}</tr>)}</tbody>
        </table>
      </div>
      {totalPages>1&&<div className="flex items-center justify-between gap-3"><button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 cursor-pointer"><i className="ri-arrow-left-line mr-1"/>Anterior</button><span className="text-xs text-slate-400">{page+1}/{totalPages}</span><button onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={page>=totalPages-1} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 cursor-pointer">Siguiente<i className="ri-arrow-right-line ml-1"/></button></div>}
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
function ZonaPickingDetailTable({zonas,zona_label,formulaCtx,clusters,onClustersChange,allZoneNames,zonaTotals}:{
  zonas:string[];zona_label:string;formulaCtx:FormulaContext;
  clusters:{id:string;nombre:string;zonas:string[];color:string;orden:number}[];
  onClustersChange:()=>void;allZoneNames:string[];
  zonaTotals:ZonaResumen[];
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
    const rpc=zonas.length>1?'fn_picking_zonas_detalle':'fn_picking_zona_detalle';
    const params=zonas.length>1?{p_zonas:zonas,p_offset:0,p_limit:2000}:{p_zona:zonas[0],p_offset:0,p_limit:2000};
    const {data}=await supabase.rpc(rpc,params);
    setRows(((data??[])as any[]).map((r:any)=>({
      ubicacion:String(r.ubicacion??''),id_articulo:String(r.id_articulo??''),id_compania:String(r.id_compania??''),
      descripcion:String(r.descripcion??''),zona_picking:String(r.zona_picking??''),
      pct_picking:Number(r.pct_picking)||0,cant_max:Number(r.cant_max)||0,cant_min:Number(r.cant_min)||0,
      compania:String(r.compania??''),sucursal:String(r.sucursal??''),
      id_presentacion:String(r.id_presentacion??''),auto_reponer:String(r.auto_reponer??''),
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
    PCT_PICKING:row.pct_picking,
    CANT_MAX:row.cant_max,
    CANT_MIN:row.cant_min,
    ZONA_TOTAL:zonaTotalUbicaciones,
    PCT_ZONA:zonaTotalUbicaciones>0?(1/zonaTotalUbicaciones)*100:0,
    ...systemVarMap,
  }),[zonaTotalUbicaciones,systemVarMap]);

  const columnOrder=useMemo(()=>{
    const derived=['FIXED:ubicacion','FIXED:id_articulo','FIXED:descripcion','FIXED:compania','FIXED:pct_picking','FIXED:cant_max','FIXED:cant_min','FIXED:auto_reponer',...zonaColumnas.map(c=>c.id)];
    const s=new Set(derived);
    if(colOrder.length===derived.length&&colOrder.every(k=>s.has(k)))return colOrder;
    return derived;
  },[colOrder,zonaColumnas]);

  // computedCells — per-row, accumulates column values
  const computedCells=useMemo(()=>{
    const result:Record<string,Record<string,{value:number|null;formula:string|null;error:boolean;isGlobal:boolean}>>={};
    const rowKey=(r:PickingRow)=>`${r.ubicacion}|${r.id_articulo}|${r.id_compania}`;
    const accum:Record<string,Record<string,number>>={};
    for(const r of rows)accum[rowKey(r)]={};
    for(const col of zonaColumnas){
      result[col.id]={};
      const colToken=colNameToToken(col.nombre);
      const colFormula=col.formula?.trim();
      if(!colFormula){for(const r of rows){accum[rowKey(r)][colToken]=0;result[col.id][rowKey(r)]={value:null,formula:null,error:false,isGlobal:false};}continue;}
      const hasRowVars=/\{(PCT_PICKING|CANT_MAX|CANT_MIN|ZONA_TOTAL|PCT_ZONA)\}/i.test(colFormula);
      if(!hasRowVars){
        const rv=evalFormula(colFormula,{...systemVarMap});
        const val=rv.ok?rv.value:null;
        for(const r of rows){accum[rowKey(r)][colToken]=val??0;result[col.id][rowKey(r)]={value:val,formula:colFormula,error:!rv.ok,isGlobal:true};}
      }else{
        for(const r of rows){
          const k=rowKey(r);
          const cells=celdasFormulas[col.id]??[];
          const cellFormula=cells.find(c=>c.ubicacion===r.ubicacion&&(!c.id_compania||c.id_compania===r.id_compania))?.formula??colFormula;
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
    const rowKey=(r:PickingRow)=>`${r.ubicacion}|${r.id_articulo}|${r.id_compania}`;
    for(const col of zonaColumnas)t[col.id]=rows.reduce((s,r)=>{const c=computedCells[col.id]?.[rowKey(r)];return s+(!c?.isGlobal&&c?.value!=null?c.value:0);},0);
    return t;
  },[zonaColumnas,computedCells,rows]);

  const filteredRows=useMemo(()=>{
    if(!deferredSearch)return rows;
    const q=deferredSearch.toLowerCase();
    return rows.filter(r=>r.ubicacion.toLowerCase().includes(q)||r.id_articulo.toLowerCase().includes(q)||r.descripcion.toLowerCase().includes(q)||r.compania.toLowerCase().includes(q));
  },[rows,deferredSearch]);

  const sortedRows=useMemo(()=>{
    const rowKey=(r:PickingRow)=>`${r.ubicacion}|${r.id_articulo}|${r.id_compania}`;
    return [...filteredRows].sort((a,b)=>{
      const dir=artSortDir==='asc'?1:-1;
      if(artSortKey==='FIXED:ubicacion')return a.ubicacion.localeCompare(b.ubicacion)*dir;
      if(artSortKey==='FIXED:id_articulo')return a.id_articulo.localeCompare(b.id_articulo)*dir;
      if(artSortKey==='FIXED:pct_picking')return(a.pct_picking-b.pct_picking)*dir;
      if(artSortKey==='FIXED:cant_max')return(a.cant_max-b.cant_max)*dir;
      if(artSortKey==='FIXED:cant_min')return(a.cant_min-b.cant_min)*dir;
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
    const rowKey=(r:PickingRow)=>`${r.ubicacion}|${r.id_articulo}|${r.id_compania}`;
    const prevColValues:Record<string,number>={};
    prevCols.forEach(pc=>{if(sampleRow){const v=computedCells[pc.id]?.[rowKey(sampleRow)]?.value;if(v!=null)prevColValues[colNameToToken(pc.nombre)]=v;}});
    const enrichedVarMap=sampleRow?{...buildRowVarMap(sampleRow),...prevColValues}:{...systemVarMap,...prevColValues};
    const columnTokens=prevCols.map(pc=>({token:colNameToToken(pc.nombre),label:pc.nombre,value:sampleRow?(computedCells[pc.id]?.[rowKey(sampleRow)]?.value??undefined):undefined}));
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
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5"><p className="text-xs text-slate-500">% Picking prom.</p><p className="text-base font-bold text-slate-700">{fmtDec(rows.length>0?rows.reduce((s,r)=>s+r.pct_picking,0)/rows.length:0)}%</p></div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5"><p className="text-xs text-slate-500">Artículos distintos</p><p className="text-base font-bold text-slate-700">{new Set(rows.map(r=>r.id_articulo)).size}</p></div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5"><p className="text-xs text-slate-500">Compañías</p><p className="text-base font-bold text-slate-700">{new Set(rows.map(r=>r.id_compania)).size}</p></div>
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
                        const hdr:Record<string,string>={ubicacion:'Ubicación',id_articulo:'Id Artículo',descripcion:'Descripción',compania:'Compañía',pct_picking:'% Picking',cant_max:'Cant. Máx.',cant_min:'Cant. Mín.',auto_reponer:'Auto Reponer'};
                        const sortable=['pct_picking','cant_max','cant_min','ubicacion','id_articulo'].includes(key);
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
                  const rKey=`${row.ubicacion}|${row.id_articulo}|${row.id_compania}`;
                  return(
                    <tr key={rKey} className={`border-t border-slate-100 hover:bg-violet-50/40 ${ai%2===0?'bg-white':'bg-slate-50/30'}`}>
                      {columnOrder.map(colKey=>{
                        if(colKey.startsWith('FIXED:')){
                          const key=colKey.slice(6);
                          switch(key){
                            case 'ubicacion':    return<td key={colKey} className="px-3 py-2 font-mono font-medium text-slate-700 border-r border-slate-100 text-[11px]">{row.ubicacion||'—'}</td>;
                            case 'id_articulo':  return<td key={colKey} className="px-3 py-2 font-medium text-slate-700 border-r border-slate-100">{row.id_articulo||'—'}</td>;
                            case 'descripcion':  return<td key={colKey} className="px-3 py-2 text-slate-600 border-r border-slate-100 max-w-[240px] overflow-hidden text-ellipsis" title={row.descripcion}>{row.descripcion||'—'}</td>;
                            case 'compania':     return<td key={colKey} className="px-3 py-2 text-slate-500 border-r border-slate-100">{row.compania||row.id_compania||'—'}</td>;
                            case 'pct_picking':  return<td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><div className="flex items-center justify-end gap-2"><div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-violet-400 rounded-full" style={{width:`${Math.min(row.pct_picking,100)}%`}}/></div><span className="text-violet-700 font-semibold w-10 text-right">{fmtDec(row.pct_picking)}%</span></div></td>;
                            case 'cant_max':     return<td key={colKey} className="px-3 py-2 text-right text-slate-600 border-r border-slate-100">{fmt(row.cant_max)}</td>;
                            case 'cant_min':     return<td key={colKey} className="px-3 py-2 text-right text-slate-500 border-r border-slate-100">{fmt(row.cant_min)}</td>;
                            case 'auto_reponer': return<td key={colKey} className="px-3 py-2 text-center border-r border-slate-100">{row.auto_reponer?<span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${row.auto_reponer.toLowerCase()==='si'||row.auto_reponer==='1'||row.auto_reponer.toLowerCase()==='true'?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{row.auto_reponer}</span>:'—'}</td>;
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
                          case 'pct_picking': return<td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-violet-700">{fmtDec(filteredRows.length>0?filteredRows.reduce((s,r)=>s+r.pct_picking,0)/filteredRows.length:0)}% prom.</span></td>;
                          case 'cant_max':    return<td key={colKey} className="px-3 py-2 text-right border-r border-slate-100"><span className="text-xs font-bold text-slate-600">{fmt(filteredRows.reduce((s,r)=>s+r.cant_max,0))}</span></td>;
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
    const zonas=((zonRaw??[]) as any[]).map((r:any)=>({zona:String(r.zona??''),total_ubicaciones:Number(r.total_ubicaciones)||0,articulos_distintos:Number(r.articulos_distintos)||0,companias_distintas:Number(r.companias_distintas)||0,pct_picking_promedio:Number(r.pct_picking_promedio)||0}));
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

  useEffect(()=>{loadData();loadClusters();},[loadData,loadClusters]);
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
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <p className="text-sm font-semibold text-slate-700 mb-3">Zonas Picking</p>
                    <div className="space-y-2">
                      {zonaResumen.map((z,i)=>{
                        const pctT=globalTotals.total_ubicaciones>0?(z.total_ubicaciones/globalTotals.total_ubicaciones)*100:0;
                        return<div key={z.zona} className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ZONE_COLORS[i%ZONE_COLORS.length]}`}/>
                          <span className="w-32 text-xs text-slate-600 font-medium truncate flex-shrink-0">{z.zona}</span>
                          <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-violet-400 rounded-full" style={{width:`${Math.max(pctT,0.5)}%`}}/></div>
                          <span className="w-20 text-right text-xs text-slate-700 font-medium flex-shrink-0">{fmt(z.total_ubicaciones)} ubic.</span>
                          <span className="w-16 text-right text-xs text-fuchsia-600 flex-shrink-0">{fmtDec(z.pct_picking_promedio)}% prom.</span>
                        </div>;
                      })}
                    </div>
                  </div>
                </div>
              )}

              {tab==='zonas'&&(
                <div className="space-y-4">
                  <div className="flex gap-1.5 flex-wrap">
                    {clusters.map(cluster=>{
                      const isActive=activeSelection.type==='cluster'&&activeSelection.cluster.id===cluster.id;
                      const total=zonaResumen.filter(z=>cluster.zonas.includes(z.zona)).reduce((s,z)=>s+z.total_ubicaciones,0);
                      return<button key={cluster.id} onClick={()=>setActiveSelection({type:'cluster',cluster})}
                        className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${isActive?`${clusterActiveBg(cluster.color)} border-transparent`:'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                        <i className={`ri-stack-line ${isActive?'text-white/80':'text-slate-400'}`}/>{cluster.nombre}
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${isActive?'bg-white/20 text-white':'bg-slate-100 text-slate-500'}`}>{fmt(total)}</span>
                      </button>;
                    })}
                    {clusters.length>0&&unclusteredZones.length>0&&<div className="flex items-center px-1"><div className="h-5 w-px bg-slate-200"/></div>}
                    {unclusteredZones.map((z,i)=>{
                      const isActive=activeSelection.type==='zone'&&activeSelection.zona===z.zona;
                      return<button key={z.zona} onClick={()=>setActiveSelection({type:'zone',zona:z.zona})}
                        className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${isActive?'bg-violet-600 text-white border-transparent shadow-sm':'bg-white text-slate-600 border-slate-200 hover:border-violet-300 hover:bg-violet-50'}`}>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive?'bg-white/70':ZONE_COLORS[i%ZONE_COLORS.length]}`}/>
                        {z.zona}
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${isActive?'bg-white/20 text-white':'bg-slate-100 text-slate-500'}`}>{fmt(z.total_ubicaciones)}</span>
                        <span className={`text-[10px] ${isActive?'text-white/60':'text-fuchsia-600'}`}>{fmtDec(z.pct_picking_promedio)}%</span>
                      </button>;
                    })}
                  </div>

                  {activeZonas.length>0&&(
                    <ZonaPickingDetailTable
                      zonas={activeZonas}
                      zona_label={zonaLabel}
                      formulaCtx={formulaCtx}
                      clusters={clusters}
                      onClustersChange={loadClusters}
                      allZoneNames={allZoneNames}
                      zonaTotals={zonaResumen}
                    />
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
