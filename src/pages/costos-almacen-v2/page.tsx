import { useState, useEffect, useMemo, useCallback } from 'react';
import AppLayout from '@/components/feature/AppLayout';
import { supabase } from '@/lib/supabase';
import { evalFormula } from '@/lib/mathEvaluator';
import { useZonaClusters } from '@/hooks/useZonaClusters';
import ZonaClusterManager, { clusterActiveBg } from '@/components/feature/ZonaClusterManager';
import V2UploadModal, { V2_TABLE_NAME, V2_COL_CONFIG_KEY } from './components/UploadModal';
import type { ColConfig } from './components/UploadModal';
import type { ZonaCluster } from '@/hooks/useZonaClusters';

const CLUSTERS_TABLE = 'costos_almacen_v2_clusters';
const PAGE_SIZE = 150;

type ActiveSel =
  | { type: 'none' }
  | { type: 'all' }
  | { type: 'zone'; zona: string }
  | { type: 'cluster'; cluster: ZonaCluster };

export default function CostosAlmacenV2Page() {
  const [colConfig, setColConfig]   = useState<ColConfig | null>(null);
  const [zonaStats, setZonaStats]   = useState<{ zona: string; row_count: number }[]>([]);
  const [activeRows, setActiveRows] = useState<Record<string, unknown>[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingRows, setLoadingRows]   = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showClusterMgr, setShowClusterMgr] = useState(false);

  const [activeSel, setActiveSel] = useState<ActiveSel>({ type: 'none' });
  const [activeTipo, setActiveTipo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [slotTdMap, setSlotTdMap] = useState<Record<string, {
    total: number; libres: number; bloqueados: number; reservados: number;
    otros: number; zona_total: number; pct_zona: number; pct_libres: number;
  }>>({});
  const [slotCostCols, setSlotCostCols] = useState<{ nombre: string; formula: string; zona: string; tipo: string }[]>([]);
  const [zonaCostMap, setZonaCostMap]   = useState<Record<string, Record<string, number>>>({});

  const { clusters, loadClusters } = useZonaClusters(CLUSTERS_TABLE);

  // ── Load config from localStorage ────────────────────────────────────
  useEffect(() => {
    const raw = localStorage.getItem(V2_COL_CONFIG_KEY);
    if (raw) { try { setColConfig(JSON.parse(raw)); } catch {} }
    loadClusters();
  }, [loadClusters]);

  // ── Load zone stats (fast aggregation) ───────────────────────────────
  const loadZonaStats = useCallback(async (cfg: ColConfig) => {
    setLoadingStats(true);
    const { data } = await supabase.rpc('fn_v2_zona_stats', { p_zona_col: cfg.zonaCol });
    setZonaStats((data ?? []) as { zona: string; row_count: number }[]);
    setLoadingStats(false);
  }, []);

  useEffect(() => {
    if (colConfig) loadZonaStats(colConfig);
  }, [colConfig, loadZonaStats]);

  // ── Active zones derived from selection ──────────────────────────────
  const allZonas = useMemo(() => zonaStats.map(s => s.zona), [zonaStats]);

  const activeZonas = useMemo<string[]>(() => {
    if (activeSel.type === 'all')     return allZonas;
    if (activeSel.type === 'zone')    return [activeSel.zona];
    if (activeSel.type === 'cluster') return activeSel.cluster.zonas;
    return [];
  }, [activeSel, allZonas]);

  // ── Load rows for active zones (lazy, on selection change) ───────────
  useEffect(() => {
    if (!colConfig || activeZonas.length === 0) { setActiveRows([]); return; }
    setLoadingRows(true);
    setPage(1);
    setActiveTipo('');

    supabase.rpc('fn_v2_rows_by_zonas', { p_zona_col: colConfig.zonaCol, p_zonas: activeZonas })
      .then(({ data }) => {
        setActiveRows((data ?? []) as Record<string, unknown>[]);
      })
      .finally(() => setLoadingRows(false));
  }, [activeZonas.join('|'), colConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tipos available in current rows ──────────────────────────────────
  const allTipos = useMemo(() => {
    if (!colConfig || !activeRows.length) return [] as string[];
    const s = new Set<string>();
    for (const r of activeRows) {
      const t = String(r[colConfig.tipoCol] ?? '').trim(); if (t) s.add(t);
    }
    return [...s].sort();
  }, [activeRows, colConfig]);

  // ── Filtered rows (tipo + search) ────────────────────────────────────
  const filteredRows = useMemo(() => {
    if (!colConfig || !activeRows.length) return [] as Record<string, unknown>[];
    const q = search.trim().toLowerCase();
    return activeRows.filter(row => {
      if (activeTipo && String(row[colConfig.tipoCol] ?? '').trim() !== activeTipo) return false;
      if (q) {
        const art  = colConfig.articuloCol  ? String(row[colConfig.articuloCol]  ?? '').toLowerCase() : '';
        const ubic = String(row[colConfig.ubicacionCol] ?? '').toLowerCase();
        const desc = colConfig.descripcionCol ? String(row[colConfig.descripcionCol] ?? '').toLowerCase() : '';
        const comp = colConfig.companiaCol ? String(row[colConfig.companiaCol] ?? '').toLowerCase() : '';
        if (!art.includes(q) && !ubic.includes(q) && !desc.includes(q) && !comp.includes(q)) return false;
      }
      return true;
    });
  }, [activeRows, colConfig, activeTipo, search]);

  // ── Slot aggregate load ───────────────────────────────────────────────
  useEffect(() => {
    if (!activeZonas.length) { setSlotTdMap({}); setSlotCostCols([]); return; }
    const normalizeZ = (s: string) => String(s).trim().replace(/\s+/g, '').toUpperCase();
    (async () => {
      const [{ data: zResumen }, { data: slotCols }] = await Promise.all([
        supabase.rpc('fn_slots_zona_resumen'),
        supabase.from('costos_slots_tipo_columnas').select('nombre, formula, zona, tipo').not('formula', 'is', null),
      ]);
      const slotZoneByNorm: Record<string, string> = {};
      for (const sz of (zResumen ?? []) as { zona: string }[]) {
        const n = normalizeZ(sz.zona ?? '');
        if (!slotZoneByNorm[n]) slotZoneByNorm[n] = sz.zona;
      }
      const invToSlot: Record<string, string> = {};
      const slotToInv: Record<string, string> = {};
      for (const iz of activeZonas) {
        const sz = slotZoneByNorm[normalizeZ(iz)] ?? iz;
        invToSlot[iz] = sz;
        if (!slotToInv[sz]) slotToInv[sz] = iz;
      }
      const slotZonas = [...new Set(Object.values(invToSlot))];
      if (!slotZonas.length) return;
      const rpc = slotZonas.length > 1 ? 'fn_slots_zonas_tipo_resumen_all' : 'fn_slots_zona_tipo_resumen_all';
      const par = slotZonas.length > 1 ? { p_zonas: slotZonas } : { p_zona: slotZonas[0] };
      const { data: tdJson } = await supabase.rpc(rpc, par);
      const tdRows: Record<string, unknown>[] = Array.isArray(tdJson) ? tdJson : [];
      const tdMap: typeof slotTdMap = {};
      for (const td of tdRows) {
        const sz  = String(td.zona_almacenaje ?? td.zona ?? (slotZonas.length === 1 ? slotZonas[0] : ''));
        const iz  = slotToInv[sz] ?? sz;
        const k   = `${iz}|${td.tipo_ubicacion ?? ''}`;
        if (!tdMap[k]) tdMap[k] = { total:0, libres:0, bloqueados:0, reservados:0, otros:0, zona_total:0, pct_zona:0, pct_libres:0 };
        tdMap[k].total      += Number(td.total)      || 0;
        tdMap[k].libres     += Number(td.libres)     || 0;
        tdMap[k].bloqueados += Number(td.bloqueados) || 0;
        tdMap[k].reservados += Number(td.reservados) || 0;
        tdMap[k].otros      += Number(td.otros)      || 0;
      }
      const zTot: Record<string, number> = {};
      for (const [k, v] of Object.entries(tdMap)) { const z = k.split('|')[0]; zTot[z] = (zTot[z] ?? 0) + v.total; }
      for (const [k, v] of Object.entries(tdMap)) {
        const z = k.split('|')[0];
        v.zona_total = zTot[z] ?? 0;
        v.pct_zona   = v.zona_total > 0 ? (v.total / v.zona_total) * 100 : 0;
        v.pct_libres = v.total > 0      ? (v.libres / v.total) * 100     : 0;
      }
      setSlotTdMap(tdMap);
      setSlotCostCols(((slotCols ?? []) as { nombre: unknown; formula: unknown; zona: unknown; tipo: unknown }[])
        .filter(c => (c.formula as string)?.trim())
        .map(c => ({ nombre: String(c.nombre), formula: String(c.formula), zona: String(c.zona ?? ''), tipo: String(c.tipo ?? '') })));
    })();
  }, [activeZonas.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Slot cost per (zona, tipo) ────────────────────────────────────────
  useEffect(() => {
    if (!slotCostCols.length || !Object.keys(slotTdMap).length || !colConfig) { setZonaCostMap({}); return; }
    const zonaMatch = (colZ: string, ubZ: string) => colZ === ubZ || (colZ.startsWith('_cluster_') && colZ.includes(ubZ));
    const costMap: Record<string, Record<string, number>> = {};
    const seen = new Set<string>();
    for (const row of activeRows) {
      const zona = String(row[colConfig.zonaCol] ?? '').trim();
      const tipo = String(row[colConfig.tipoCol] ?? '').trim();
      const key  = `${zona}|${tipo}`;
      if (seen.has(key)) continue; seen.add(key);
      const td = slotTdMap[key]; if (!td) continue;
      const vm = { TOTAL:td.total, LIBRES:td.libres, BLOQUEADOS:td.bloqueados, RESERVADOS:td.reservados,
                   OTROS:td.otros, ZONA_TOTAL:td.zona_total, PCT_ZONA:td.pct_zona, PCT_LIBRES:td.pct_libres };
      costMap[key] = {};
      const seenCol = new Set<string>();
      for (const col of slotCostCols) {
        if (seenCol.has(col.nombre)) continue; seenCol.add(col.nombre);
        const best =
          slotCostCols.find(c => c.nombre === col.nombre && c.tipo === tipo && zonaMatch(c.zona, zona)) ??
          slotCostCols.find(c => c.nombre === col.nombre && !c.tipo && zonaMatch(c.zona, zona)) ??
          slotCostCols.find(c => c.nombre === col.nombre && c.tipo === tipo) ??
          slotCostCols.find(c => c.nombre === col.nombre && !c.tipo);
        if (!best) continue;
        const res = evalFormula(best.formula, vm);
        if (res.ok) costMap[key][col.nombre] = res.value;
      }
    }
    setZonaCostMap(costMap);
  }, [slotTdMap, slotCostCols, activeRows, colConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  const slotColNames = useMemo(() => [...new Set(slotCostCols.map(c => c.nombre))], [slotCostCols]);

  // ── Cluster / zone split ──────────────────────────────────────────────
  const clusteredZonaSet = useMemo(() => new Set(clusters.flatMap(c => c.zonas)), [clusters]);
  const unclusteredZonas = useMemo(() => allZonas.filter(z => !clusteredZonaSet.has(z)), [allZonas, clusteredZonaSet]);

  // ── Zone count helper ─────────────────────────────────────────────────
  const zoneCount = (zonas: string[]) => zonas.reduce((s, z) => s + (zonaStats.find(r => r.zona === z)?.row_count ?? 0), 0);
  const totalRows = zonaStats.reduce((s, r) => s + r.row_count, 0);

  // ── Pagination ────────────────────────────────────────────────────────
  const pageCount    = Math.ceil(filteredRows.length / PAGE_SIZE);
  const paginatedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const fmt = (n: number) => n.toLocaleString('es-CO');

  const handleUploadSuccess = (cfg: ColConfig) => {
    setColConfig(cfg);
    setActiveSel({ type: 'none' });
    setActiveRows([]);
    setSearch('');
    setPage(1);
    loadZonaStats(cfg);
    loadClusters();
  };

  const selLabel = activeSel.type === 'cluster' ? activeSel.cluster.nombre
                 : activeSel.type === 'zone'    ? activeSel.zona
                 : activeSel.type === 'all'     ? 'Todas las zonas' : '';

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
                {loadingStats ? 'Cargando...' : `${fmt(totalRows)} filas · ${zonaStats.length} zonas`}
                {' · '}Subido {new Date(colConfig.uploadedAt).toLocaleDateString('es-CO')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {colConfig && (
              <button
                onClick={() => setShowClusterMgr(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-colors ${showClusterMgr ? 'bg-slate-800 text-white border-slate-800' : 'border-slate-200 text-slate-600 hover:border-slate-400 hover:bg-slate-50'}`}
              >
                <i className="ri-stack-line" /> Clusters
              </button>
            )}
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs font-medium rounded-lg cursor-pointer"
            >
              <i className="ri-upload-2-line" />
              {colConfig ? 'Recargar' : 'Cargar datos'}
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
                Carga un archivo Excel con datos de ubicaciones. Seleccionarás qué columna es cada campo.
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

            {/* ── Cluster Manager (collapsible) ── */}
            {showClusterMgr && (
              <div className="flex-shrink-0 px-6 py-4 border-b border-slate-200 bg-slate-50/80">
                <ZonaClusterManager
                  tableName={CLUSTERS_TABLE}
                  clusters={clusters}
                  zonas={allZonas}
                  onChanged={() => { loadClusters(); }}
                />
              </div>
            )}

            {/* ── Zone / Cluster selector ── */}
            <div className="flex-shrink-0 px-6 py-3 border-b border-slate-100 bg-white">
              {loadingStats ? (
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <div className="w-3 h-3 border border-teal-400 border-t-transparent rounded-full animate-spin" />
                  Cargando zonas...
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {/* All zones */}
                  <button
                    onClick={() => { setActiveSel({ type: 'all' }); setPage(1); }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${activeSel.type === 'all' ? 'bg-teal-600 text-white border-teal-600' : 'bg-white border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-600'}`}
                  >
                    Todas <span className="opacity-70 ml-1">{fmt(totalRows)}</span>
                  </button>

                  {/* Clusters */}
                  {clusters.map(cl => {
                    const cnt = zoneCount(cl.zonas);
                    const isAct = activeSel.type === 'cluster' && activeSel.cluster.id === cl.id;
                    return (
                      <button key={cl.id}
                        onClick={() => { setActiveSel({ type: 'cluster', cluster: cl }); setPage(1); }}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${isAct ? clusterActiveBg(cl.color) + ' border-transparent' : 'bg-white border-slate-200 text-slate-600 hover:opacity-80'}`}
                        style={!isAct ? { borderColor: cl.color + '55', color: cl.color } : undefined}
                      >
                        {cl.nombre} <span className="opacity-70 ml-1">{fmt(cnt)}</span>
                      </button>
                    );
                  })}

                  {/* Individual zones */}
                  {unclusteredZonas.map(zona => {
                    const cnt = zonaStats.find(r => r.zona === zona)?.row_count ?? 0;
                    const isAct = activeSel.type === 'zone' && activeSel.zona === zona;
                    return (
                      <button key={zona}
                        onClick={() => { setActiveSel({ type: 'zone', zona }); setPage(1); }}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${isAct ? 'bg-teal-600 text-white border-teal-600' : 'bg-white border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-600'}`}
                      >
                        {zona} <span className="opacity-70 ml-1">{fmt(cnt)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Tipo pills + Search ── */}
            {activeSel.type !== 'none' && (
              <div className="flex-shrink-0 flex items-center gap-3 px-6 py-2.5 border-b border-slate-100 bg-slate-50/50 flex-wrap">
                {/* Tipo pills */}
                {!loadingRows && allTipos.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-slate-400 mr-1">Tipo:</span>
                    <button
                      onClick={() => { setActiveTipo(''); setPage(1); }}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${!activeTipo ? 'bg-slate-700 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                    >
                      Todos
                    </button>
                    {allTipos.map(t => (
                      <button key={t}
                        onClick={() => { setActiveTipo(t === activeTipo ? '' : t); setPage(1); }}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${activeTipo === t ? 'bg-teal-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-700'}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}

                {/* Search */}
                <div className="relative ml-auto">
                  <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs" />
                  <input
                    type="text"
                    placeholder="Buscar..."
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1); }}
                    className="pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400 w-44 bg-white"
                  />
                </div>

                {/* Result count */}
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  {selLabel && <span className="font-medium text-slate-600 mr-1">{selLabel}</span>}
                  {loadingRows ? 'cargando...' : `${fmt(filteredRows.length)} filas`}
                </span>
              </div>
            )}

            {/* ── No selection prompt ── */}
            {activeSel.type === 'none' && !loadingStats && (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
                Selecciona una zona o cluster para ver los datos
              </div>
            )}

            {/* ── Loading rows ── */}
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
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">Ubicación</th>
                      {colConfig.articuloCol && <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">Artículo</th>}
                      {colConfig.descripcionCol && <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Descripción</th>}
                      {colConfig.companiaCol && <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">Compañía</th>}
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">Zona</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">Tipo</th>
                      {colConfig.extraCols.map(ec => (
                        <th key={ec.key} className="px-3 py-2 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{ec.label}</th>
                      ))}
                      {slotColNames.map(n => (
                        <th key={n} className="px-3 py-2 text-right text-xs font-semibold text-teal-600 whitespace-nowrap">{n}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.map((row, i) => {
                      const zona  = String(row[colConfig.zonaCol] ?? '').trim();
                      const tipo  = String(row[colConfig.tipoCol] ?? '').trim();
                      const costs = zonaCostMap[`${zona}|${tipo}`] ?? {};
                      return (
                        <tr key={i} className={`border-b border-slate-100 hover:bg-teal-50/40 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                          <td className="px-3 py-2 font-mono text-xs text-slate-700 whitespace-nowrap">
                            {String(row[colConfig.ubicacionCol] ?? '')}
                          </td>
                          {colConfig.articuloCol && (
                            <td className="px-3 py-2 font-mono text-xs text-slate-800 font-medium whitespace-nowrap">
                              {String(row[colConfig.articuloCol] ?? '')}
                            </td>
                          )}
                          {colConfig.descripcionCol && (
                            <td className="px-3 py-2 text-xs text-slate-600 max-w-xs truncate">
                              {String(row[colConfig.descripcionCol] ?? '')}
                            </td>
                          )}
                          {colConfig.companiaCol && (
                            <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">
                              {String(row[colConfig.companiaCol] ?? '')}
                            </td>
                          )}
                          <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{zona}</td>
                          <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">{tipo}</span>
                          </td>
                          {colConfig.extraCols.map(ec => (
                            <td key={ec.key} className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">
                              {String(row[ec.key] ?? '')}
                            </td>
                          ))}
                          {slotColNames.map(n => (
                            <td key={n} className="px-3 py-2 text-right text-xs font-mono whitespace-nowrap">
                              {costs[n] !== undefined ? (
                                <span className="text-teal-700 font-semibold">
                                  ${costs[n].toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                                </span>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                    {paginatedRows.length === 0 && !loadingRows && (
                      <tr>
                        <td colSpan={99} className="px-3 py-10 text-center text-sm text-slate-400">
                          Sin resultados para los filtros seleccionados
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
                  {fmt((page - 1) * PAGE_SIZE + 1)}–{fmt(Math.min(page * PAGE_SIZE, filteredRows.length))} de {fmt(filteredRows.length)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
