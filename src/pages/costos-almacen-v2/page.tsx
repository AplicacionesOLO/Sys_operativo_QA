import { useState, useEffect, useMemo, useCallback } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import { supabase } from '@/lib/supabase';
import { evalFormula } from '@/lib/mathEvaluator';
import { useZonaClusters } from '@/hooks/useZonaClusters';
import V2UploadModal, { V2_TABLE_NAME, V2_COL_CONFIG_KEY } from './components/UploadModal';
import type { ColConfig } from './components/UploadModal';
import type { ZonaCluster } from '@/hooks/useZonaClusters';

const CLUSTERS_TABLE = 'costos_almacen_v2_clusters';
const PAGE_SIZE = 150;
const LOAD_CHUNK = 10000;

type ActiveSel =
  | { type: 'all' }
  | { type: 'zone'; zona: string }
  | { type: 'cluster'; cluster: ZonaCluster };

export default function CostosAlmacenV2Page() {
  const [colConfig, setColConfig] = useState<ColConfig | null>(null);
  const [allRows, setAllRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadStep, setLoadStep] = useState('');
  const [showUpload, setShowUpload] = useState(false);

  const [activeSel, setActiveSel] = useState<ActiveSel>({ type: 'all' });
  const [activeTipo, setActiveTipo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [slotTdMap, setSlotTdMap] = useState<Record<string, {
    total: number; libres: number; bloqueados: number; reservados: number;
    otros: number; zona_total: number; pct_zona: number; pct_libres: number;
  }>>({});
  const [slotCostCols, setSlotCostCols] = useState<{ id: string; nombre: string; formula: string; zona: string; tipo: string }[]>([]);
  const [zonaCostMap, setZonaCostMap] = useState<Record<string, Record<string, number>>>({});

  const { clusters, loadClusters } = useZonaClusters(CLUSTERS_TABLE);

  // Load config from localStorage
  useEffect(() => {
    const raw = localStorage.getItem(V2_COL_CONFIG_KEY);
    if (raw) { try { setColConfig(JSON.parse(raw)); } catch {} }
    loadClusters();
  }, [loadClusters]);

  // Load all rows from Supabase
  const loadAllRows = useCallback(async () => {
    setLoading(true);
    setLoadStep('Cargando datos...');
    try {
      const data: Record<string, unknown>[] = [];
      let from = 0;
      while (true) {
        setLoadStep(`Cargando filas ${from.toLocaleString('es-CO')}...`);
        const { data: chunk, error } = await supabase
          .from(V2_TABLE_NAME)
          .select('raw_data')
          .range(from, from + LOAD_CHUNK - 1);
        if (error) throw error;
        if (!chunk || chunk.length === 0) break;
        data.push(...chunk.map((r: { raw_data: Record<string, unknown> }) => r.raw_data));
        if (chunk.length < LOAD_CHUNK) break;
        from += LOAD_CHUNK;
      }
      setAllRows(data);
    } catch (err) {
      console.error('Error loading rows:', err);
    }
    setLoadStep('');
    setLoading(false);
  }, []);

  useEffect(() => {
    if (colConfig) loadAllRows();
    else setLoading(false);
  }, [colConfig, loadAllRows]);

  // Unique zonas and tipos from all rows
  const { allZonas, allTipos } = useMemo(() => {
    if (!colConfig || !allRows.length) return { allZonas: [] as string[], allTipos: [] as string[] };
    const zonas = new Set<string>();
    const tipos = new Set<string>();
    for (const row of allRows) {
      const z = String(row[colConfig.zonaCol] ?? '').trim(); if (z) zonas.add(z);
      const t = String(row[colConfig.tipoCol] ?? '').trim(); if (t) tipos.add(t);
    }
    return { allZonas: [...zonas].sort(), allTipos: [...tipos].sort() };
  }, [allRows, colConfig]);

  // Active zones array
  const activeZonas = useMemo(() => {
    if (activeSel.type === 'all') return allZonas;
    if (activeSel.type === 'zone') return [activeSel.zona];
    return activeSel.cluster.zonas;
  }, [activeSel, allZonas]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    if (!colConfig || !allRows.length) return [];
    const zonaSet = new Set(activeZonas);
    const q = search.trim().toLowerCase();
    return allRows.filter(row => {
      const zona = String(row[colConfig.zonaCol] ?? '').trim();
      if (!zonaSet.has(zona)) return false;
      if (activeTipo && String(row[colConfig.tipoCol] ?? '').trim() !== activeTipo) return false;
      if (q) {
        const art = String(row[colConfig.articuloCol] ?? '').toLowerCase();
        const ubic = String(row[colConfig.ubicacionCol] ?? '').toLowerCase();
        const desc = colConfig.descripcionCol ? String(row[colConfig.descripcionCol] ?? '').toLowerCase() : '';
        const comp = colConfig.companiaCol ? String(row[colConfig.companiaCol] ?? '').toLowerCase() : '';
        if (!art.includes(q) && !ubic.includes(q) && !desc.includes(q) && !comp.includes(q)) return false;
      }
      return true;
    });
  }, [allRows, colConfig, activeZonas, activeTipo, search]);

  // Zona row counts for selector buttons
  const zonaStats = useMemo(() => {
    if (!colConfig || !allRows.length) return {} as Record<string, number>;
    const stats: Record<string, number> = {};
    for (const row of allRows) {
      const z = String(row[colConfig.zonaCol] ?? '').trim();
      if (z) stats[z] = (stats[z] ?? 0) + 1;
    }
    return stats;
  }, [allRows, colConfig]);

  // Load slot aggregate data when active zones change
  useEffect(() => {
    if (!activeZonas.length) { setSlotTdMap({}); setSlotCostCols([]); return; }
    (async () => {
      const normalizeZ = (s: string) => String(s).trim().replace(/\s+/g, '').toUpperCase();
      const [{ data: zResumen }, { data: slotCols }] = await Promise.all([
        supabase.rpc('fn_slots_zona_resumen'),
        supabase.from('costos_slots_tipo_columnas').select('id, nombre, formula, zona, tipo').not('formula', 'is', null),
      ]);

      // Build norm(slotZone) → exact slotZone mapping
      const slotZoneByNorm: Record<string, string> = {};
      for (const sz of (zResumen ?? []) as { zona: string }[]) {
        const n = normalizeZ(String(sz.zona ?? ''));
        if (!slotZoneByNorm[n]) slotZoneByNorm[n] = String(sz.zona ?? '');
      }

      // Map inventory zone → slot zone (normalize to match)
      const invToSlot: Record<string, string> = {};
      const slotToInv: Record<string, string> = {};
      for (const iz of activeZonas) {
        const slotZ = slotZoneByNorm[normalizeZ(iz)] ?? iz;
        invToSlot[iz] = slotZ;
        if (!slotToInv[slotZ]) slotToInv[slotZ] = iz;
      }
      const slotZonas = [...new Set(Object.values(invToSlot))];
      if (!slotZonas.length) { setSlotTdMap({}); return; }

      const rpcName = slotZonas.length > 1 ? 'fn_slots_zonas_tipo_resumen_all' : 'fn_slots_zona_tipo_resumen_all';
      const params = slotZonas.length > 1 ? { p_zonas: slotZonas } : { p_zona: slotZonas[0] };
      const { data: tdJson } = await supabase.rpc(rpcName, params);
      const tdRows: Record<string, unknown>[] = Array.isArray(tdJson) ? tdJson : [];

      const tdMap: typeof slotTdMap = {};
      for (const td of tdRows) {
        const slotZ = String(td.zona_almacenaje ?? td.zona ?? (slotZonas.length === 1 ? slotZonas[0] : ''));
        const invZ = slotToInv[slotZ] ?? slotZ;
        const k = `${invZ}|${td.tipo_ubicacion ?? ''}`;
        if (!tdMap[k]) tdMap[k] = { total: 0, libres: 0, bloqueados: 0, reservados: 0, otros: 0, zona_total: 0, pct_zona: 0, pct_libres: 0 };
        tdMap[k].total      += Number(td.total) || 0;
        tdMap[k].libres     += Number(td.libres) || 0;
        tdMap[k].bloqueados += Number(td.bloqueados) || 0;
        tdMap[k].reservados += Number(td.reservados) || 0;
        tdMap[k].otros      += Number(td.otros) || 0;
      }
      // Compute zona_total and pcts client-side
      const zTot: Record<string, number> = {};
      for (const [k, v] of Object.entries(tdMap)) { const z = k.split('|')[0]; zTot[z] = (zTot[z] ?? 0) + v.total; }
      for (const [k, v] of Object.entries(tdMap)) {
        const z = k.split('|')[0];
        v.zona_total = zTot[z] ?? 0;
        v.pct_zona   = v.zona_total > 0 ? (v.total / v.zona_total) * 100 : 0;
        v.pct_libres = v.total > 0      ? (v.libres / v.total) * 100     : 0;
      }
      setSlotTdMap(tdMap);

      const rawCols = ((slotCols ?? []) as { id: unknown; nombre: unknown; formula: unknown; zona: unknown; tipo: unknown }[])
        .filter(c => (c.formula as string)?.trim())
        .map(c => ({ id: String(c.id), nombre: String(c.nombre), formula: String(c.formula), zona: String(c.zona ?? ''), tipo: String(c.tipo ?? '') }));
      setSlotCostCols(rawCols);
    })();
  }, [activeZonas.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute slot costs per (zona, tipo) — same result for every row with same zona+tipo
  useEffect(() => {
    if (!slotCostCols.length || !Object.keys(slotTdMap).length) { setZonaCostMap({}); return; }
    const zonaMatchFn = (colZ: string, ubZ: string) =>
      colZ === ubZ || (colZ.startsWith('_cluster_') && colZ.includes(ubZ));

    const costMap: Record<string, Record<string, number>> = {};
    const seen = new Set<string>();
    for (const row of filteredRows) {
      if (!colConfig) break;
      const zona = String(row[colConfig.zonaCol] ?? '').trim();
      const tipo = String(row[colConfig.tipoCol] ?? '').trim();
      const key = `${zona}|${tipo}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const td = slotTdMap[key];
      if (!td) continue;

      const vm = {
        TOTAL: td.total, LIBRES: td.libres, BLOQUEADOS: td.bloqueados,
        RESERVADOS: td.reservados, OTROS: td.otros,
        ZONA_TOTAL: td.zona_total, PCT_ZONA: td.pct_zona, PCT_LIBRES: td.pct_libres,
      };

      costMap[key] = {};
      const seenCol = new Set<string>();
      for (const col of slotCostCols) {
        if (seenCol.has(col.nombre)) continue;
        seenCol.add(col.nombre);
        const best =
          slotCostCols.find(c => c.nombre === col.nombre && c.tipo === tipo && zonaMatchFn(c.zona, zona)) ??
          slotCostCols.find(c => c.nombre === col.nombre && !c.tipo && zonaMatchFn(c.zona, zona)) ??
          slotCostCols.find(c => c.nombre === col.nombre && c.tipo === tipo) ??
          slotCostCols.find(c => c.nombre === col.nombre && !c.tipo);
        if (!best) continue;
        const res = evalFormula(best.formula, vm);
        if (res.ok) costMap[key][col.nombre] = res.value;
      }
    }
    setZonaCostMap(costMap);
  }, [slotTdMap, slotCostCols, filteredRows, colConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Unique slot cost column names to show
  const slotColNames = useMemo(() => {
    const seen = new Set<string>();
    for (const col of slotCostCols) seen.add(col.nombre);
    return [...seen];
  }, [slotCostCols]);

  // Cluster / zone split
  const clusteredZonaSet = useMemo(() => new Set(clusters.flatMap(c => c.zonas)), [clusters]);
  const unclusteredZonas = useMemo(() => allZonas.filter(z => !clusteredZonaSet.has(z)), [allZonas, clusteredZonaSet]);

  // Pagination
  const pageCount = Math.ceil(filteredRows.length / PAGE_SIZE);
  const paginatedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleUploadSuccess = (config: ColConfig) => {
    setColConfig(config);
    setActiveSel({ type: 'all' });
    setActiveTipo('');
    setSearch('');
    setPage(1);
    loadAllRows();
    loadClusters();
  };

  const selClusterName = activeSel.type === 'cluster' ? activeSel.cluster.nombre : '';
  const selZona = activeSel.type === 'zone' ? activeSel.zona : '';

  const fmt = (n: number) => n.toLocaleString('es-CO');

  return (
    <AppLayout>
      {showUpload && (
        <V2UploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={config => { handleUploadSuccess(config); setShowUpload(false); }}
        />
      )}

      <div className="flex flex-col h-full min-h-0">

        {/* ── Header ── */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-100 flex-shrink-0 bg-white">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-slate-800">Costos Almacén V2</h1>
            {colConfig && (
              <p className="text-xs text-slate-400 mt-0.5">
                {allRows.length ? `${fmt(allRows.length)} filas cargadas` : 'Sin datos'}
                {' · '}Subido {new Date(colConfig.uploadedAt).toLocaleDateString('es-CO')}
              </p>
            )}
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium rounded-lg cursor-pointer flex-shrink-0"
          >
            <i className="ri-upload-2-line text-sm" />
            {colConfig ? 'Recargar datos' : 'Cargar datos'}
          </button>
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

        {/* ── Loading ── */}
        {colConfig && loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-10 h-10 mx-auto mb-3 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-500">{loadStep || 'Cargando...'}</p>
            </div>
          </div>
        )}

        {/* ── Main content ── */}
        {colConfig && !loading && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

            {/* Zone / Cluster selector */}
            <div className="flex-shrink-0 px-6 py-3 border-b border-slate-100 bg-slate-50/60">
              <div className="flex flex-wrap gap-2">
                {/* All */}
                <button
                  onClick={() => { setActiveSel({ type: 'all' }); setPage(1); }}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${activeSel.type === 'all' ? 'bg-teal-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-600'}`}
                >
                  Todas las zonas
                  <span className="ml-1.5 opacity-70">{fmt(allRows.length)}</span>
                </button>

                {/* Clusters */}
                {clusters.map(cluster => {
                  const count = cluster.zonas.reduce((s, z) => s + (zonaStats[z] ?? 0), 0);
                  const isAct = activeSel.type === 'cluster' && activeSel.cluster.id === cluster.id;
                  return (
                    <button
                      key={cluster.id}
                      onClick={() => { setActiveSel({ type: 'cluster', cluster }); setPage(1); }}
                      style={isAct
                        ? { background: cluster.color, borderColor: cluster.color }
                        : { borderColor: cluster.color + '55', color: cluster.color }}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${isAct ? 'text-white' : 'bg-white hover:opacity-80'}`}
                    >
                      {cluster.nombre}
                      <span className="ml-1.5 opacity-80">{fmt(count)}</span>
                    </button>
                  );
                })}

                {/* Individual zones */}
                {unclusteredZonas.map(zona => (
                  <button
                    key={zona}
                    onClick={() => { setActiveSel({ type: 'zone', zona }); setPage(1); }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${activeSel.type === 'zone' && activeSel.zona === zona ? 'bg-teal-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-600'}`}
                  >
                    {zona}
                    <span className="ml-1.5 opacity-70">{fmt(zonaStats[zona] ?? 0)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Filters bar */}
            <div className="flex-shrink-0 flex items-center gap-3 px-6 py-2.5 border-b border-slate-100">
              <i className="ri-filter-3-line text-slate-400 text-sm" />
              <input
                type="text"
                placeholder="Buscar artículo, ubicación, descripción..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400 min-w-56"
              />
              <select
                value={activeTipo}
                onChange={e => { setActiveTipo(e.target.value); setPage(1); }}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
              >
                <option value="">Todos los tipos</option>
                {allTipos.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <div className="flex-1" />
              <span className="text-xs text-slate-400">
                {activeSel.type !== 'all' && (
                  <span className="font-medium text-teal-600 mr-1">{activeSel.type === 'cluster' ? selClusterName : selZona}</span>
                )}
                {fmt(filteredRows.length)} filas
                {activeTipo && <span className="ml-1 text-slate-300">· {activeTipo}</span>}
              </span>
            </div>

            {/* Table */}
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-50 border-b-2 border-slate-200">
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">Ubicación</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">Artículo</th>
                    {colConfig.descripcionCol && <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500">Descripción</th>}
                    {colConfig.companiaCol && <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">Compañía</th>}
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">Zona</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">Tipo</th>
                    {colConfig.extraCols.map(ec => (
                      <th key={ec.key} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{ec.label}</th>
                    ))}
                    {slotColNames.map(n => (
                      <th key={n} className="px-3 py-2.5 text-right text-xs font-semibold text-teal-600 whitespace-nowrap">{n}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row, i) => {
                    const zona = String(row[colConfig.zonaCol] ?? '').trim();
                    const tipo = String(row[colConfig.tipoCol] ?? '').trim();
                    const costs = zonaCostMap[`${zona}|${tipo}`] ?? {};
                    return (
                      <tr key={i} className={`border-b border-slate-100 hover:bg-teal-50/40 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                        <td className="px-3 py-2 font-mono text-xs text-slate-700 whitespace-nowrap">
                          {String(row[colConfig.ubicacionCol] ?? '')}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-slate-800 whitespace-nowrap font-medium">
                          {String(row[colConfig.articuloCol] ?? '')}
                        </td>
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
                        <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{tipo}</td>
                        {colConfig.extraCols.map(ec => (
                          <td key={ec.key} className="px-3 py-2 text-xs text-slate-600">
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
                  {paginatedRows.length === 0 && (
                    <tr>
                      <td colSpan={99} className="px-3 py-12 text-center text-sm text-slate-400">
                        Sin resultados para los filtros seleccionados
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pageCount > 1 && (
              <div className="flex-shrink-0 flex items-center gap-2 px-6 py-3 border-t border-slate-100 bg-white">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1 text-xs border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
                  ← Anterior
                </button>
                <span className="text-xs text-slate-500">Pág. {page} de {pageCount}</span>
                <button disabled={page === pageCount} onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1 text-xs border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
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
