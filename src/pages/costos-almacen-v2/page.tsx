import { useState, useEffect, useMemo, useCallback } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import { supabase } from '@/lib/supabase';
import { evalFormula } from '@/lib/mathEvaluator';
import { fetchBaseQueryData } from '@/lib/formulaBaseCache';
import { EMPTY_FORMULA_CTX, toAllDataSources } from '@/lib/formulaEngine';
import type { FormulaContext } from '@/lib/formulaEngine';
import { buildVariableDefs, buildVariableMap } from '@/lib/formulaVariables';
import { useZonaClusters } from '@/hooks/useZonaClusters';
import ZonaClusterManager, { clusterActiveBg } from '@/components/feature/ZonaClusterManager';
import V2UploadModal, { V2_COL_CONFIG_KEY } from './components/UploadModal';
import type { ColConfig } from './components/UploadModal';
import type { ZonaCluster } from '@/hooks/useZonaClusters';

const CLUSTERS_TABLE = 'costos_almacen_v2_clusters';
const COL_ORDER_KEY  = 'costos_almacen_v2_col_order';
const PAGE_SIZE      = 150;

type ActiveSel =
  | { type: 'none' }
  | { type: 'all' }
  | { type: 'zone'; zona: string }
  | { type: 'cluster'; cluster: ZonaCluster };

type SortDir = 'asc' | 'desc';
type ColDef  = { id: string; label: string; kind: 'extra' | 'cost' };

// normalize zone string: uppercase + collapse spaces
const normZona = (s: string) =>
  String(s ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

// normalize any identifier: uppercase + trim for lookup
const normId = (s: string) => String(s ?? '').trim().toUpperCase();

const fmt    = (n: number) => n.toLocaleString('es-CO');
const fmtUSD = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });

// ── Sort icon ─────────────────────────────────────────────────────────────────
function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <i className="ri-expand-up-down-fill text-[10px] text-slate-300 group-hover:text-slate-400 ml-0.5" />;
  return <i className={`text-[10px] ml-0.5 text-teal-500 ${dir === 'asc' ? 'ri-sort-asc' : 'ri-sort-desc'}`} />;
}

// ── TH with sort + optional drag ─────────────────────────────────────────────
function TH({
  colId, label, right, sortColId, sortDir, onSort,
  draggable, onDragStart, onDragOver, onDrop, onDragEnd, isDragOver,
  className = '',
}: {
  colId: string; label: string; right?: boolean;
  sortColId: string; sortDir: SortDir; onSort: (id: string) => void;
  draggable?: boolean; onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void; onDragEnd?: () => void;
  isDragOver?: boolean; className?: string;
}) {
  const active = sortColId === colId;
  return (
    <th
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={() => onSort(colId)}
      className={`px-3 py-2 text-xs font-semibold whitespace-nowrap select-none cursor-pointer group transition-colors
        ${right ? 'text-right' : 'text-left'}
        ${active ? 'text-teal-600 bg-teal-50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/60'}
        ${isDragOver ? 'border-l-2 border-teal-400' : ''}
        ${className}`}
    >
      <span className={`flex items-center gap-0.5 ${right ? 'justify-end' : ''}`}>
        {draggable && <i className="ri-draggable text-slate-300 text-[10px] mr-0.5 group-hover:text-slate-400" />}
        {label}
        <SortIcon active={active} dir={sortDir} />
      </span>
    </th>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function CostosAlmacenV2Page() {
  const [colConfig, setColConfig] = useState<ColConfig | null>(null);
  const [zonaStats, setZonaStats] = useState<{ zona: string; row_count: number }[]>([]);
  const [activeRows, setActiveRows] = useState<Record<string, unknown>[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingRows,  setLoadingRows]  = useState(false);
  const [statsError,   setStatsError]   = useState(false);
  const [showUpload,     setShowUpload]     = useState(false);
  const [showClusterMgr, setShowClusterMgr] = useState(false);

  const [activeSel,  setActiveSel]  = useState<ActiveSel>({ type: 'none' });
  const [activeTipo, setActiveTipo] = useState('');
  const [search,     setSearch]     = useState('');
  const [page,       setPage]       = useState(1);

  const [sortColId, setSortColId] = useState('');
  const [sortDir,   setSortDir]   = useState<SortDir>('asc');

  const [colOrderSaved, setColOrderSaved] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(COL_ORDER_KEY) ?? '[]'); } catch { return []; }
  });
  const [dragId,     setDragId]     = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // slot cost state
  const [slotCostByUbic, setSlotCostByUbic] =
    useState<Record<string, Record<string, number>>>({});  // ubicacion.toUpperCase() → colName → cost
  const [slotColNames,   setSlotColNames]   = useState<string[]>([]);
  const [slotDiag,       setSlotDiag]       = useState<string>('');

  // formula context for system variables (COSTOS_*, FACTOR_*, etc.)
  const [formulaCtx, setFormulaCtx] = useState<FormulaContext>(EMPTY_FORMULA_CTX);
  const systemVarMap = useMemo<Record<string, number>>(() => {
    try {
      const defs = buildVariableDefs(toAllDataSources(formulaCtx));
      return defs.length ? buildVariableMap(defs, toAllDataSources(formulaCtx)) : {};
    } catch { return {}; }
  }, [formulaCtx]);

  const { clusters, loadClusters } = useZonaClusters(CLUSTERS_TABLE);

  // ── Init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const raw = localStorage.getItem(V2_COL_CONFIG_KEY);
    if (raw) { try { setColConfig(JSON.parse(raw)); } catch {} }
    loadClusters();
    // Load system variables needed by slot cost formulas
    fetchBaseQueryData().then(d => { if (d) setFormulaCtx(d); }).catch(() => {});
  }, [loadClusters]);

  // ── Zone stats (with fallback) ────────────────────────────────────────────
  const loadZonaStats = useCallback(async (cfg: ColConfig) => {
    setLoadingStats(true);
    setStatsError(false);

    const { data, error } = await supabase.rpc('fn_v2_zona_stats', { p_zona_col: cfg.zonaCol });

    if (!error && Array.isArray(data) && data.length > 0) {
      // Keep raw zone strings — normZona is applied only for display/comparison, not for storage
      setZonaStats((data as { zona: string; row_count: number }[]).map(r => ({
        zona: r.zona, row_count: r.row_count,
      })));
      setLoadingStats(false);
      return;
    }

    // Fallback: paginate raw table client-side
    const counts: Record<string, number> = {};
    let from = 0;
    for (;;) {
      const { data: batch } = await supabase
        .from('costos_almacen_v2_data')
        .select('raw_data')
        .range(from, from + 9999);
      if (!batch || batch.length === 0) break;
      for (const r of batch as { raw_data: Record<string, unknown> }[]) {
        const z = String(r.raw_data?.[cfg.zonaCol] ?? '').trim();
        if (z) counts[z] = (counts[z] ?? 0) + 1;
      }
      if (batch.length < 10000) break;
      from += 10000;
    }
    if (Object.keys(counts).length > 0) {
      setZonaStats(Object.entries(counts).map(([zona, row_count]) => ({ zona, row_count })));
    } else {
      setZonaStats([]);
      setStatsError(true);
    }
    setLoadingStats(false);
  }, []);

  useEffect(() => {
    if (colConfig) loadZonaStats(colConfig);
  }, [colConfig, loadZonaStats]);

  // ── Derived zone lists ────────────────────────────────────────────────────
  // allZonas holds the RAW zone strings as they appear in the data (needed for exact RPC queries)
  const allZonas = useMemo(() => zonaStats.map(s => s.zona), [zonaStats]);

  const activeZonas = useMemo<string[]>(() => {
    if (activeSel.type === 'all')  return allZonas;
    if (activeSel.type === 'zone') return [activeSel.zona];
    if (activeSel.type === 'cluster') {
      // Cluster zonas stored in DB may differ in spacing/case from zonaStats raw values.
      // Use normZona to match stored cluster zones against actual raw zones in the data.
      const clNorms = new Set(activeSel.cluster.zonas.map(z => normZona(z)));
      return allZonas.filter(z => clNorms.has(normZona(z)));
    }
    return [];
  }, [activeSel, allZonas]);

  // ── Slot cost via VLOOKUP (Ubicacion → Codigo → zona/tipo → formula) ─────
  const loadSlotCosts = useCallback(async (
    rows: Record<string, unknown>[],
    cfg: ColConfig,
  ) => {
    // systemVarMap captured from closure — loaded from fetchBaseQueryData on mount
    setSlotDiag('');
    // 1. Unique ubicaciones from V2 rows
    const ubicSet = new Set<string>();
    for (const r of rows) {
      const u = normId(String(r[cfg.ubicacionCol] ?? ''));
      if (u) ubicSet.add(u);
    }
    const ubicaciones = [...ubicSet];
    if (!ubicaciones.length) return;

    // 2. VLOOKUP: find each ubicacion in conteo_slots_raw via Codigo column
    const { data: vlookupData, error: vlookupErr } = await supabase.rpc(
      'fn_v2_vlookup_slots',
      { p_codigos: ubicaciones },
    );

    if (vlookupErr) {
      setSlotDiag(`Error VLOOKUP: ${vlookupErr.message}`);
      return;
    }

    const vlookupRows: { codigo: string; zona: string; tipo: string }[] =
      Array.isArray(vlookupData) ? vlookupData : [];

    if (!vlookupRows.length) {
      setSlotDiag(
        `VLOOKUP sin coincidencias. Verifica que los códigos de Ubicación del Excel ` +
        `(ej. ${ubicaciones.slice(0, 3).join(', ')}) existan en la columna Codigo/Ubicación ` +
        `del módulo Conteo de Slots.`,
      );
      return;
    }

    // 3. Build map: NORM_UBICACION → { slotZona, slotTipo }
    const ubicToSlot: Record<string, { zona: string; tipo: string }> = {};
    for (const r of vlookupRows) {
      ubicToSlot[r.codigo] = { zona: r.zona, tipo: r.tipo };
    }

    // 4. Get unique slot zona/tipo combos
    const slotZonaSet = new Set<string>();
    for (const v of Object.values(ubicToSlot)) {
      if (v.zona) slotZonaSet.add(v.zona);
    }
    const slotZonas = [...slotZonaSet];

    // 5. Load aggregate stats + formula columns
    const [{ data: tdJson }, { data: slotCols }] = await Promise.all([
      slotZonas.length > 1
        ? supabase.rpc('fn_slots_zonas_tipo_resumen_all', { p_zonas: slotZonas })
        : supabase.rpc('fn_slots_zona_tipo_resumen_all', { p_zona: slotZonas[0] }),
      supabase
        .from('costos_slots_tipo_columnas')
        .select('nombre, formula, zona, tipo')
        .not('formula', 'is', null),
    ]);

    const tdRows: Record<string, unknown>[] = Array.isArray(tdJson) ? tdJson : [];
    if (!tdRows.length) {
      setSlotDiag(
        `Zonas del sistema de slots (${slotZonas.slice(0,3).join(', ')}) ` +
        `no tienen datos en Conteo de Slots.`,
      );
      return;
    }

    // 6. Build tdMap: "slotZona|TIPO_UPPER" → aggregated stats
    const tdMap: Record<string, {
      total: number; libres: number; bloqueados: number;
      reservados: number; otros: number; zona_total: number;
      pct_zona: number; pct_libres: number;
    }> = {};

    for (const td of tdRows) {
      const sz = String(td.zona_almacenaje ?? td.zona ?? (slotZonas.length === 1 ? slotZonas[0] : ''));
      const tp = String(td.tipo_ubicacion ?? '').trim().toUpperCase();
      const k  = `${sz}|${tp}`;
      if (!tdMap[k]) tdMap[k] = { total:0, libres:0, bloqueados:0, reservados:0, otros:0, zona_total:0, pct_zona:0, pct_libres:0 };
      tdMap[k].total      += Number(td.total)      || 0;
      tdMap[k].libres     += Number(td.libres)     || 0;
      tdMap[k].bloqueados += Number(td.bloqueados) || 0;
      tdMap[k].reservados += Number(td.reservados) || 0;
      tdMap[k].otros      += Number(td.otros)      || 0;
    }
    // Calc zona_total + pcts
    const zTot: Record<string, number> = {};
    for (const [k, v] of Object.entries(tdMap)) {
      const z = k.split('|')[0]; zTot[z] = (zTot[z] ?? 0) + v.total;
    }
    for (const [k, v] of Object.entries(tdMap)) {
      const z = k.split('|')[0];
      v.zona_total = zTot[z] ?? 0;
      v.pct_zona   = v.zona_total > 0 ? (v.total / v.zona_total) * 100 : 0;
      v.pct_libres = v.total > 0      ? (v.libres / v.total) * 100     : 0;
    }

    // 7. Load formula columns
    const rawCols = ((slotCols ?? []) as { nombre: unknown; formula: unknown; zona: unknown; tipo: unknown }[])
      .filter(c => (c.formula as string)?.trim())
      .map(c => ({ nombre: String(c.nombre), formula: String(c.formula), zona: String(c.zona ?? ''), tipo: String(c.tipo ?? '') }));

    const uniqueColNames = [...new Set(rawCols.map(c => c.nombre))];

    if (!uniqueColNames.length) {
      setSlotDiag('No hay fórmulas configuradas en costos_slots_tipo_columnas.');
      return;
    }

    // 8. Compute cost per ubicacion
    const normZM = (s: string) => s.trim().replace(/\s+/g, '').toUpperCase();
    const zonaMatch = (colZ: string, ubZ: string) =>
      colZ === ubZ || normZM(colZ) === normZM(ubZ) ||
      (colZ.startsWith('_cluster_') && normZM(colZ).includes(normZM(ubZ)));

    const costByUbic: Record<string, Record<string, number>> = {};
    let matchedCount = 0;

    for (const [normUbic, { zona: slotZona, tipo: slotTipo }] of Object.entries(ubicToSlot)) {
      const tipoUp = slotTipo.toUpperCase();
      const tdKey  = `${slotZona}|${tipoUp}`;
      const td     = tdMap[tdKey];
      if (!td) continue;

      const vm = {
        ...systemVarMap,   // COSTOS_*, FACTOR_*, etc. from formula context
        TOTAL:       td.total,
        LIBRES:      td.libres,
        BLOQUEADOS:  td.bloqueados,
        RESERVADOS:  td.reservados,
        OTROS:       td.otros,
        ZONA_TOTAL:  td.zona_total,
        PCT_ZONA:    td.pct_zona,
        PCT_LIBRES:  td.pct_libres,
        TOTAL_TIPO:  td.total,
        LIBRES_TIPO: td.libres,
      };

      costByUbic[normUbic] = {};
      const seen = new Set<string>();

      for (const col of rawCols) {
        if (seen.has(col.nombre)) continue;
        seen.add(col.nombre);
        const best =
          rawCols.find(c => c.nombre === col.nombre && c.tipo.toUpperCase() === tipoUp && zonaMatch(c.zona, slotZona)) ??
          rawCols.find(c => c.nombre === col.nombre && !c.tipo && zonaMatch(c.zona, slotZona)) ??
          rawCols.find(c => c.nombre === col.nombre && c.tipo.toUpperCase() === tipoUp) ??
          rawCols.find(c => c.nombre === col.nombre && !c.tipo);
        if (!best) continue;
        const res = evalFormula(best.formula, vm);
        if (res.ok) { costByUbic[normUbic][col.nombre] = res.value; matchedCount++; }
      }
    }

    setSlotCostByUbic(costByUbic);
    setSlotColNames(uniqueColNames);

    if (matchedCount === 0) {
      const slotTipos = [...new Set(Object.values(ubicToSlot).map(v => v.tipo.toUpperCase()))].slice(0,4).join(', ');
      setSlotDiag(
        `Tipos del sistema de slots (${slotTipos}) no tienen fórmulas configuradas. ` +
        `Revisa costos_slots_tipo_columnas.`,
      );
    }
  }, [systemVarMap]); // re-run when formula context loads

  // ── Load rows for selected zone/cluster ──────────────────────────────────
  useEffect(() => {
    if (!colConfig || activeZonas.length === 0) { setActiveRows([]); return; }
    setLoadingRows(true);
    setPage(1);
    setActiveTipo('');
    setSlotCostByUbic({});
    setSlotColNames([]);

    const load = async () => {
      const { data, error } = await supabase.rpc('fn_v2_rows_by_zonas', {
        p_zona_col: colConfig.zonaCol,
        p_zonas: activeZonas,
      });

      let rows: Record<string, unknown>[] = [];

      if (!error && Array.isArray(data) && data.length > 0) {
        rows = data as Record<string, unknown>[];
      } else {
        // Fallback: full scan + client filter
        const { data: all } = await supabase
          .from('costos_almacen_v2_data')
          .select('raw_data')
          .limit(50000);
        const zonaSet = new Set(activeZonas);
        rows = ((all ?? []) as { raw_data: Record<string, unknown> }[])
          .map(r => r.raw_data)
          .filter(r => zonaSet.has(normZona(String(r[colConfig.zonaCol] ?? ''))));
      }

      setActiveRows(rows);
      setLoadingRows(false);
    };
    load();
  }, [activeZonas.join('|'), colConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Trigger slot costs when rows OR systemVarMap changes ─────────────────
  useEffect(() => {
    if (activeRows.length > 0 && colConfig) {
      loadSlotCosts(activeRows, colConfig);
    }
  }, [activeRows, systemVarMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tipos ────────────────────────────────────────────────────────────────
  const allTipos = useMemo(() => {
    if (!colConfig || !activeRows.length) return [] as string[];
    const s = new Set<string>();
    for (const r of activeRows) {
      const t = String(r[colConfig.tipoCol] ?? '').trim(); if (t) s.add(t);
    }
    return [...s].sort();
  }, [activeRows, colConfig]);

  // ── Filtered rows ─────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    if (!colConfig || !activeRows.length) return [] as Record<string, unknown>[];
    const q = search.trim().toLowerCase();
    return activeRows.filter(row => {
      // tipo filter
      if (activeTipo && String(row[colConfig.tipoCol] ?? '').trim() !== activeTipo) return false;
      // search: check ALL string values in the row (covers ubicacion + every extra col)
      if (q) {
        const haystack = Object.values(row)
          .map(v => String(v ?? '').toLowerCase())
          .join(' ');
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [activeRows, colConfig, activeTipo, search]);

  // ── Moveable columns (extra + cost) ──────────────────────────────────────
  const moveableColDefs = useMemo<ColDef[]>(() => {
    if (!colConfig) return [];
    return [
      ...colConfig.extraCols.map(ec => ({ id: `extra:${ec.key}`, label: ec.label, kind: 'extra' as const })),
      ...slotColNames.map(n => ({ id: `cost:${n}`, label: n, kind: 'cost' as const })),
    ];
  }, [colConfig, slotColNames]);

  const orderedCols = useMemo<ColDef[]>(() => {
    const avail = new Map(moveableColDefs.map(c => [c.id, c]));
    const saved  = colOrderSaved.filter(id => avail.has(id));
    const fresh  = moveableColDefs.filter(c => !colOrderSaved.includes(c.id));
    return [...saved.map(id => avail.get(id)!), ...fresh];
  }, [moveableColDefs, colOrderSaved]);

  // ── Drag ─────────────────────────────────────────────────────────────────
  const handleDrop = useCallback((targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const ids = orderedCols.map(c => c.id);
    const fi = ids.indexOf(dragId);
    const ti = ids.indexOf(targetId);
    if (fi === -1 || ti === -1) return;
    const next = [...ids]; next.splice(fi, 1); next.splice(ti, 0, dragId);
    localStorage.setItem(COL_ORDER_KEY, JSON.stringify(next));
    setColOrderSaved(next);
    setDragId(null); setDragOverId(null);
  }, [dragId, orderedCols]);

  // ── Sort ─────────────────────────────────────────────────────────────────
  const toggleSort = useCallback((id: string) => {
    setSortColId(prev => {
      if (prev !== id) { setSortDir('asc'); return id; }
      setSortDir(d => { if (d === 'asc') return 'desc'; setSortColId(''); return 'asc'; });
      return prev;
    });
    setPage(1);
  }, []);

  const sortedRows = useMemo(() => {
    if (!sortColId || !colConfig) return filteredRows;
    const getVal = (row: Record<string, unknown>): string | number => {
      if (sortColId === 'fixed:ubicacion')    return String(row[colConfig.ubicacionCol] ?? '');
      if (sortColId === 'fixed:articulo')     return colConfig.articuloCol    ? String(row[colConfig.articuloCol]    ?? '') : '';
      if (sortColId === 'fixed:descripcion')  return colConfig.descripcionCol  ? String(row[colConfig.descripcionCol]  ?? '') : '';
      if (sortColId === 'fixed:compania')     return colConfig.companiaCol     ? String(row[colConfig.companiaCol]     ?? '') : '';
      if (sortColId === 'fixed:zona')         return normZona(String(row[colConfig.zonaCol] ?? ''));
      if (sortColId === 'fixed:tipo')         return String(row[colConfig.tipoCol] ?? '');
      if (sortColId.startsWith('extra:')) {
        const k = sortColId.slice(6);
        const v = String(row[k] ?? ''); const n = Number(v); return isNaN(n) ? v : n;
      }
      if (sortColId.startsWith('cost:')) {
        const name = sortColId.slice(5);
        const ubic = normId(String(row[colConfig.ubicacionCol] ?? ''));
        return slotCostByUbic[ubic]?.[name] ?? 0;
      }
      return '';
    };
    return [...filteredRows].sort((a, b) => {
      const va = getVal(a), vb = getVal(b);
      const dir = sortDir === 'asc' ? 1 : -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'es', { numeric: true }) * dir;
    });
  }, [filteredRows, sortColId, sortDir, colConfig, slotCostByUbic]);

  // ── Cluster / zone helpers ────────────────────────────────────────────────
  // Use normZona for membership checks so stored cluster zones (which may have different
  // spacing) still match raw zones from zonaStats
  const clusteredZonaSet = useMemo(
    () => new Set(clusters.flatMap(c => c.zonas.map(z => normZona(z)))),
    [clusters],
  );
  const unclusteredZonas = useMemo(
    () => allZonas.filter(z => !clusteredZonaSet.has(normZona(z))),
    [allZonas, clusteredZonaSet],
  );
  const zoneCount = (zonas: string[]) =>
    zonas.reduce((s, z) => s + (zonaStats.find(r => normZona(r.zona) === normZona(z))?.row_count ?? 0), 0);
  const totalRows = zonaStats.reduce((s, r) => s + r.row_count, 0);

  // ── Pagination ────────────────────────────────────────────────────────────
  const pageCount     = Math.ceil(sortedRows.length / PAGE_SIZE);
  const paginatedRows = sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleUploadSuccess = (cfg: ColConfig) => {
    setColConfig(cfg); setActiveSel({ type: 'none' }); setActiveRows([]);
    setSearch(''); setPage(1); loadZonaStats(cfg); loadClusters();
  };

  const selLabel = activeSel.type === 'cluster' ? activeSel.cluster.nombre
                 : activeSel.type === 'zone'    ? activeSel.zona
                 : activeSel.type === 'all'     ? 'Todas las zonas' : '';

  const thProps = (colId: string, right = false) => ({
    colId, right, sortColId, sortDir, onSort: toggleSort,
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      {showUpload && (
        <V2UploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={cfg => { handleUploadSuccess(cfg); setShowUpload(false); }}
        />
      )}

      <div className="flex flex-col h-full min-h-0">

        {/* ── Header ── */}
        <div className="flex items-center gap-4 px-6 py-3 border-b border-slate-100 flex-shrink-0 bg-white">
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-slate-800">Costos Almacén V2</h1>
            {colConfig && (
              <p className="text-xs text-slate-400 mt-0.5">
                {loadingStats ? 'Cargando...' : statsError
                  ? 'Sin datos — sube un Excel'
                  : `${fmt(totalRows)} filas · ${zonaStats.length} zonas`}
                {colConfig && !statsError &&
                  <span className="ml-1 text-slate-300">· {new Date(colConfig.uploadedAt).toLocaleDateString('es-CO')}</span>}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {colConfig && (
              <button
                onClick={() => setShowClusterMgr(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-colors
                  ${showClusterMgr ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 text-slate-600 hover:border-slate-400'}`}
              >
                <i className="ri-stack-line" /> Clusters
              </button>
            )}
            <button onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs font-medium rounded-lg cursor-pointer">
              <i className="ri-upload-2-line" />
              {colConfig ? 'Recargar Excel' : 'Cargar datos'}
            </button>
          </div>
        </div>

        {/* ── Empty state ── */}
        {!colConfig && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center rounded-full bg-slate-100">
                <i className="ri-file-excel-2-line text-3xl text-slate-400" />
              </div>
              <h2 className="text-base font-semibold text-slate-700 mb-2">Sin datos cargados</h2>
              <p className="text-sm text-slate-400 mb-4 max-w-xs mx-auto">
                Carga un archivo Excel. La configuración de columnas se guarda automáticamente.
              </p>
              <button onClick={() => setShowUpload(true)}
                className="px-5 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium rounded-lg cursor-pointer">
                Cargar archivo Excel
              </button>
            </div>
          </div>
        )}

        {colConfig && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

            {/* ── Cluster Manager ── */}
            {showClusterMgr && (
              <div className="flex-shrink-0 px-6 py-4 border-b border-slate-200 bg-slate-50/80">
                <ZonaClusterManager
                  tableName={CLUSTERS_TABLE}
                  clusters={clusters}
                  zonas={allZonas}
                  onChanged={() => loadClusters()}
                />
              </div>
            )}

            {/* ── Zone / Cluster pills ── */}
            <div className="flex-shrink-0 px-6 py-3 border-b border-slate-100 bg-white">
              {loadingStats ? (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <div className="w-3 h-3 border border-teal-400 border-t-transparent rounded-full animate-spin" />
                  Cargando zonas...
                </div>
              ) : statsError ? (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <i className="ri-alert-line" /> Sin datos. Sube un Excel.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => { setActiveSel({ type: 'all' }); setPage(1); }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                      ${activeSel.type === 'all' ? 'bg-teal-600 text-white border-teal-600' : 'bg-white border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-600'}`}>
                    Todas <span className="opacity-60 ml-1">{fmt(totalRows)}</span>
                  </button>
                  {clusters.map(cl => {
                    const isAct = activeSel.type === 'cluster' && activeSel.cluster.id === cl.id;
                    return (
                      <button key={cl.id}
                        onClick={() => { setActiveSel({ type: 'cluster', cluster: cl }); setPage(1); }}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                          ${isAct ? clusterActiveBg(cl.color) + ' border-transparent' : 'bg-white border-slate-200 text-slate-600 hover:opacity-80'}`}
                        style={!isAct ? { borderColor: cl.color + '55', color: cl.color } : undefined}>
                        {cl.nombre} <span className="opacity-60 ml-1">{fmt(zoneCount(cl.zonas))}</span>
                      </button>
                    );
                  })}
                  {unclusteredZonas.map(zona => {
                    const isAct = activeSel.type === 'zone' && activeSel.zona === zona;
                    return (
                      <button key={zona}
                        onClick={() => { setActiveSel({ type: 'zone', zona }); setPage(1); }}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                          ${isAct ? 'bg-teal-600 text-white border-teal-600' : 'bg-white border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-600'}`}>
                        {zona} <span className="opacity-60 ml-1">{fmt(zonaStats.find(r => r.zona === zona)?.row_count ?? 0)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Tipo pills + Search ── */}
            {activeSel.type !== 'none' && (
              <div className="flex-shrink-0 flex items-center gap-2 px-6 py-2.5 border-b border-slate-100 bg-slate-50/40 flex-wrap">
                {!loadingRows && allTipos.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
                    <span className="text-xs text-slate-400 shrink-0">Tipo:</span>
                    <button onClick={() => { setActiveTipo(''); setPage(1); }}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors shrink-0
                        ${!activeTipo ? 'bg-slate-700 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                      Todos
                    </button>
                    {allTipos.map(t => (
                      <button key={t} onClick={() => { setActiveTipo(t === activeTipo ? '' : t); setPage(1); }}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors shrink-0
                          ${activeTipo === t ? 'bg-teal-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-700'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                )}

                {/* Glassmorphism search */}
                <div className="relative shrink-0 ml-auto">
                  <div className="absolute inset-0 rounded-xl bg-white/80 backdrop-blur-xl border border-slate-200/80 shadow-sm pointer-events-none" />
                  <div className="relative flex items-center gap-2 px-3 py-1.5">
                    <i className={`ri-search-line text-sm shrink-0 transition-colors ${search ? 'text-teal-500' : 'text-slate-300'}`} />
                    <input type="text" placeholder="Buscar ubicación, artículo..."
                      value={search}
                      onChange={e => { setSearch(e.target.value); setPage(1); }}
                      className="bg-transparent outline-none text-xs text-slate-700 placeholder:text-slate-400 w-52 min-w-0"
                    />
                    {search && (
                      <button onClick={() => { setSearch(''); setPage(1); }}
                        className="shrink-0 text-slate-300 hover:text-rose-400 cursor-pointer transition-colors">
                        <i className="ri-close-circle-fill text-sm" />
                      </button>
                    )}
                  </div>
                </div>

                <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">
                  {selLabel && <span className="font-medium text-slate-600 mr-1">{selLabel}</span>}
                  {loadingRows ? 'cargando...' : `${fmt(sortedRows.length)} filas`}
                  {sortColId && <span className="ml-1 text-teal-500">· ord. {sortColId.split(':')[1]}</span>}
                </span>
              </div>
            )}

            {/* ── Slot cost diagnostic ── */}
            {slotDiag && !loadingRows && (
              <div className="flex-shrink-0 px-6 py-2 border-b border-amber-100 bg-amber-50 text-xs text-amber-700 flex items-start gap-2">
                <i className="ri-information-line mt-0.5 shrink-0" />
                <span>{slotDiag}</span>
              </div>
            )}

            {/* ── No selection ── */}
            {activeSel.type === 'none' && !loadingStats && !statsError && (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                Selecciona una zona o cluster para ver los datos
              </div>
            )}

            {/* ── Loading ── */}
            {loadingRows && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-8 h-8 mx-auto mb-2 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-slate-500">Cargando filas...</p>
                </div>
              </div>
            )}

            {/* ── Table ── */}
            {!loadingRows && activeSel.type !== 'none' && (
              <div className="flex-1 min-h-0 overflow-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50 border-b-2 border-slate-200">
                      {/* Fixed columns */}
                      <TH {...thProps('fixed:ubicacion')} label="Ubicación" />
                      {colConfig.articuloCol    && <TH {...thProps('fixed:articulo')}    label="Artículo" />}
                      {colConfig.descripcionCol && <TH {...thProps('fixed:descripcion')} label="Descripción" />}
                      {colConfig.companiaCol    && <TH {...thProps('fixed:compania')}    label="Compañía" />}
                      <TH {...thProps('fixed:zona')} label="Zona" />
                      <TH {...thProps('fixed:tipo')} label="Tipo" />

                      {/* Moveable columns — drag-to-reorder */}
                      {orderedCols.map(col => (
                        <TH
                          key={col.id}
                          {...thProps(col.id, col.kind === 'cost')}
                          label={col.label}
                          className={col.kind === 'cost' ? '!text-teal-600' : ''}
                          draggable
                          onDragStart={() => setDragId(col.id)}
                          onDragOver={e => { e.preventDefault(); setDragOverId(col.id); }}
                          onDrop={() => handleDrop(col.id)}
                          onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                          isDragOver={dragOverId === col.id && dragId !== col.id}
                        />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.map((row, i) => {
                      const ubic  = normId(String(row[colConfig.ubicacionCol] ?? ''));
                      const zona  = normZona(String(row[colConfig.zonaCol] ?? ''));
                      const tipo  = String(row[colConfig.tipoCol] ?? '').trim();
                      const costs = slotCostByUbic[ubic] ?? {};
                      return (
                        <tr key={i}
                          className={`border-b border-slate-100 hover:bg-teal-50/40 transition-colors
                            ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                          <td className="px-3 py-1.5 font-mono text-xs text-slate-800 font-medium whitespace-nowrap">
                            {String(row[colConfig.ubicacionCol] ?? '')}
                          </td>
                          {colConfig.articuloCol && (
                            <td className="px-3 py-1.5 font-mono text-xs text-slate-700 whitespace-nowrap">
                              {String(row[colConfig.articuloCol] ?? '')}
                            </td>
                          )}
                          {colConfig.descripcionCol && (
                            <td className="px-3 py-1.5 text-xs text-slate-600 max-w-xs truncate">
                              {String(row[colConfig.descripcionCol] ?? '')}
                            </td>
                          )}
                          {colConfig.companiaCol && (
                            <td className="px-3 py-1.5 text-xs text-slate-600 whitespace-nowrap">
                              {String(row[colConfig.companiaCol] ?? '')}
                            </td>
                          )}
                          <td className="px-3 py-1.5 text-xs text-slate-400 whitespace-nowrap">{zona}</td>
                          <td className="px-3 py-1.5 text-xs whitespace-nowrap">
                            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px]">{tipo}</span>
                          </td>

                          {/* Moveable columns */}
                          {orderedCols.map(col => {
                            if (col.kind === 'extra') {
                              const k = col.id.slice(6);
                              return (
                                <td key={col.id} className="px-3 py-1.5 text-xs text-slate-600 whitespace-nowrap">
                                  {String(row[k] ?? '')}
                                </td>
                              );
                            }
                            const name = col.id.slice(5);
                            const val  = costs[name];
                            return (
                              <td key={col.id} className="px-3 py-1.5 text-right text-xs font-mono whitespace-nowrap">
                                {val !== undefined ? (
                                  <span className="text-teal-700 font-semibold">${fmtUSD(val)}</span>
                                ) : (
                                  <span className="text-slate-200">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                    {paginatedRows.length === 0 && (
                      <tr>
                        <td colSpan={99} className="px-3 py-10 text-center text-sm text-slate-400">
                          Sin resultados
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Pagination ── */}
            {!loadingRows && pageCount > 1 && (
              <div className="flex-shrink-0 flex items-center gap-2 px-6 py-2.5 border-t border-slate-100 bg-white">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1 text-xs border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 cursor-pointer">
                  ← Anterior
                </button>
                <span className="text-xs text-slate-500">Pág. {page} / {pageCount}</span>
                <button disabled={page === pageCount} onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1 text-xs border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 cursor-pointer">
                  Siguiente →
                </button>
                <span className="text-xs text-slate-400 ml-2">
                  {fmt((page - 1) * PAGE_SIZE + 1)}–{fmt(Math.min(page * PAGE_SIZE, sortedRows.length))} de {fmt(sortedRows.length)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
