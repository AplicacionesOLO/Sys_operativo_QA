import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import AppLayout from '@/components/feature/AppLayout';
import { useZonaClusters } from '@/hooks/useZonaClusters';
import ZonaClusterManager, { clusterActiveBg, clusterColorDot } from '@/components/feature/ZonaClusterManager';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ZonaResumen {
  zona: string;
  total_slots: number;
  libres: number;
  bloqueados: number;
  reservados: number;
  otros: number;
}

interface BreakdownItem { label: string; cantidad: number; }

interface MasivoInfo { totalRegistros: number; headers: string[] }

type Tab = 'resumen' | 'zonas' | 'datos';
type ActiveSelection = { type: 'zone'; zona: string } | { type: 'cluster'; cluster: { id: string; nombre: string; zonas: string[]; color: string; orden: number } };

const MESES_ES = ['','Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const fmt = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);
const pct = (a: number, b: number) => b > 0 ? ((a / b) * 100).toFixed(1) : '0.0';

// ── Pill ──────────────────────────────────────────────────────────────────────
function StatPill({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className={`rounded-lg px-4 py-3 border ${color}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="text-lg font-bold mt-0.5">{typeof value === 'number' ? fmt(value) : value}</p>
    </div>
  );
}

// ── Breakdown bar ─────────────────────────────────────────────────────────────
function BreakdownBar({ items, total }: { items: BreakdownItem[]; total: number }) {
  const colors = ['bg-cyan-500','bg-indigo-500','bg-amber-500','bg-rose-500','bg-teal-500','bg-violet-500','bg-emerald-500','bg-orange-500'];
  return (
    <div className="space-y-2">
      {items.slice(0, 8).map((it, i) => (
        <div key={it.label} className="flex items-center gap-3">
          <div className="w-28 text-xs text-slate-600 truncate flex-shrink-0" title={it.label}>{it.label}</div>
          <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${colors[i % colors.length]}`} style={{ width: `${Math.max(total > 0 ? (it.cantidad / total) * 100 : 0, 1)}%` }} />
          </div>
          <div className="w-16 text-right text-xs text-slate-700 font-medium flex-shrink-0">{fmt(it.cantidad)} <span className="text-slate-400">({pct(it.cantidad, total)}%)</span></div>
        </div>
      ))}
    </div>
  );
}

// ── Raw Table ─────────────────────────────────────────────────────────────────
function RawTable({ headers }: { headers: string[] }) {
  const [rows, setRows] = useState<Array<{ id: string; raw_data: Record<string, unknown> }>>([]);
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const PAGE = 50;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    const { data, count: c } = await supabase.from('conteo_slots_raw').select('id, raw_data', { count: 'exact' }).order('created_at', { ascending: false }).range(p * PAGE, (p + 1) * PAGE - 1);
    if (data) { setRows(data as any); setCount(c ?? 0); }
    setLoading(false);
  }, []);

  useEffect(() => { load(page); }, [load, page]);
  const totalPages = Math.ceil(count / PAGE);
  const displayHeaders = headers.length > 0 ? headers : (rows[0]?.raw_data ? Object.keys(rows[0].raw_data) : []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">Pág. {page + 1}/{Math.max(totalPages,1)} · {fmt(count)} slots</span>
      </div>
      <div className="border border-slate-200 rounded-lg overflow-auto max-h-[55vh]">
        <table className="text-xs whitespace-nowrap w-full">
          <thead>
            <tr className="bg-slate-50 sticky top-0 z-10">
              <th className="px-3 py-2 text-left text-slate-500 font-medium border-r border-slate-200">#</th>
              {displayHeaders.map(h => <th key={h} className="px-3 py-2 text-left text-slate-500 font-medium border-r border-slate-200 max-w-[160px] overflow-hidden text-ellipsis">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={displayHeaders.length + 1} className="px-3 py-8 text-center text-slate-400"><div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />Cargando...</td></tr>
            : rows.map((r, i) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-1.5 text-slate-400 border-r border-slate-100 text-center">{page * PAGE + i + 1}</td>
                {displayHeaders.map(h => { const v = r.raw_data?.[h]; return <td key={h} className="px-3 py-1.5 text-slate-600 border-r border-slate-100 max-w-[160px] overflow-hidden text-ellipsis">{v !== null && v !== undefined ? String(v) : '—'}</td>; })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 cursor-pointer whitespace-nowrap"><i className="ri-arrow-left-line mr-1" />Anterior</button>
          <span className="text-xs text-slate-400">{page + 1} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 cursor-pointer whitespace-nowrap">Siguiente<i className="ri-arrow-right-line ml-1" /></button>
        </div>
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
  const [zonaResumenLoading, setZonaResumenLoading] = useState(false);
  const [globalTotals, setGlobalTotals] = useState<{ total_slots:number; total_zonas:number; total_libres:number; total_bloqueados:number; total_reservados:number } | null>(null);

  // Zone/cluster selection
  const [activeSelection, setActiveSelection] = useState<ActiveSelection>({ type: 'zone', zona: '' });
  const [showClusterMgr, setShowClusterMgr] = useState(false);
  const isCluster = activeSelection.type === 'cluster';
  const activeZona = activeSelection.type === 'zone' ? activeSelection.zona : '';
  const activeCluster = activeSelection.type === 'cluster' ? activeSelection.cluster : null;
  const activeZonas = isCluster ? (activeCluster?.zonas ?? []) : (activeZona ? [activeZona] : []);

  // Per-zone detail
  const [estadoBreakdown, setEstadoBreakdown] = useState<BreakdownItem[]>([]);
  const [tipoBreakdown, setTipoBreakdown]     = useState<BreakdownItem[]>([]);
  const [detailLoading, setDetailLoading]     = useState(false);

  const { clusters, loadClusters } = useZonaClusters('conteo_slots_clusters');

  // Load overview
  const loadData = useCallback(async () => {
    setLoading(true);
    const { count } = await supabase.from('conteo_slots_raw').select('*', { count: 'exact', head: true });
    if (!count || count === 0) { setMasivoInfo(null); setLoading(false); return; }
    const { data: sample } = await supabase.from('conteo_slots_raw').select('raw_data').limit(1).single();
    const headers = sample?.raw_data ? Object.keys(sample.raw_data as Record<string, unknown>) : [];
    setMasivoInfo({ totalRegistros: count, headers });

    const [{ data: totalesRaw }, { data: zonasRaw }] = await Promise.all([
      supabase.rpc('fn_slots_totales'),
      supabase.rpc('fn_slots_zona_resumen'),
    ]);
    const t0 = (totalesRaw as any[])?.[0] ?? {};
    setGlobalTotals({ total_slots: Number(t0.total_slots)||0, total_zonas: Number(t0.total_zonas)||0, total_libres: Number(t0.total_libres)||0, total_bloqueados: Number(t0.total_bloqueados)||0, total_reservados: Number(t0.total_reservados)||0 });
    const zonas = ((zonasRaw ?? []) as any[]).map((r: any) => ({ zona: String(r.zona??''), total_slots: Number(r.total_slots)||0, libres: Number(r.libres)||0, bloqueados: Number(r.bloqueados)||0, reservados: Number(r.reservados)||0, otros: Number(r.otros)||0 }));
    setZonaResumen(zonas);
    // Auto-select first unclustered zone
    const firstUnclustered = zonas.find(z => !clusters.some(c => c.zonas.includes(z.zona)));
    if (firstUnclustered) setActiveSelection({ type: 'zone', zona: firstUnclustered.zona });
    setLoading(false);
  }, [clusters]);

  useEffect(() => { loadData(); loadClusters(); }, [loadData, loadClusters]);

  // Load detail breakdown when selection changes
  useEffect(() => {
    if (!activeZonas.length) return;
    setDetailLoading(true);
    Promise.all([
      supabase.rpc('fn_slots_estado_breakdown', { p_zonas: activeZonas }),
      supabase.rpc('fn_slots_tipo_breakdown', { p_zonas: activeZonas }),
    ]).then(([{ data: eData }, { data: tData }]) => {
      setEstadoBreakdown(((eData ?? []) as any[]).map((r: any) => ({ label: String(r.estado??''), cantidad: Number(r.cantidad)||0 })));
      setTipoBreakdown(((tData ?? []) as any[]).map((r: any) => ({ label: String(r.tipo??''), cantidad: Number(r.cantidad)||0 })));
      setDetailLoading(false);
    });
  }, [activeZonas.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClearAll = async () => {
    if (!confirm('¿Eliminar TODOS los datos de Conteo de Slots?')) return;
    setClearing(true);
    await supabase.from('conteo_slots_raw').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    setClearing(false);
    loadData();
  };

  // Cluster stats
  const clusterStats = useMemo(() => {
    if (!isCluster || !activeCluster) return null;
    const zonaRows = zonaResumen.filter(z => activeCluster.zonas.includes(z.zona));
    return zonaRows.reduce((acc, z) => ({ total: acc.total + z.total_slots, libres: acc.libres + z.libres, bloqueados: acc.bloqueados + z.bloqueados, reservados: acc.reservados + z.reservados, otros: acc.otros + z.otros }), { total: 0, libres: 0, bloqueados: 0, reservados: 0, otros: 0 });
  }, [isCluster, activeCluster, zonaResumen]);

  const activeZonaRow = zonaResumen.find(z => z.zona === activeZona);
  const activeStats = isCluster ? clusterStats : (activeZonaRow ? { total: activeZonaRow.total_slots, libres: activeZonaRow.libres, bloqueados: activeZonaRow.bloqueados, reservados: activeZonaRow.reservados, otros: activeZonaRow.otros } : null);

  const clusteredZones = new Set(clusters.flatMap(c => c.zonas));
  const unclusteredZones = zonaResumen.filter(z => !clusteredZones.has(z.zona));
  const ZONE_COLORS = ['bg-cyan-500','bg-indigo-500','bg-teal-500','bg-sky-500','bg-violet-500','bg-amber-500','bg-emerald-500','bg-rose-500'];

  if (loading) return (
    <AppLayout title="Conteo de Slots" subtitle="Cargando...">
      <div className="flex items-center justify-center py-32"><div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>
    </AppLayout>
  );

  return (
    <AppLayout
      title="Conteo de Slots"
      subtitle="Inventario de ubicaciones por zona · Agrupación por clusters"
      actions={
        <div className="flex items-center gap-2">
          {masivoInfo && <button onClick={handleClearAll} disabled={clearing} className="flex items-center gap-2 px-4 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap disabled:opacity-50"><i className="ri-delete-bin-line" />{clearing ? 'Limpiando...' : 'Limpiar'}</button>}
          <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap"><i className="ri-file-excel-2-line" />Cargar Excel</button>
        </div>
      }
    >
      <div className="space-y-6">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Conteo de Slots — Inventario de ubicaciones</h3>
              <p className="text-xs text-slate-400 mt-0.5">Zona de agrupación: <strong>Zona Almacenaje</strong></p>
            </div>
            {masivoInfo && <span className="text-xs px-2.5 py-1 rounded-full bg-cyan-50 text-cyan-700 font-medium">{fmt(masivoInfo.totalRegistros)} slots</span>}
          </div>

          {!masivoInfo ? (
            <div className="px-6 py-12 flex flex-col items-center gap-4">
              <div className="w-14 h-14 flex items-center justify-center rounded-full bg-cyan-50"><i className="ri-layout-grid-line text-2xl text-cyan-400" /></div>
              <div className="text-center max-w-sm"><p className="text-slate-700 font-semibold text-sm">Sin datos de slots</p><p className="text-slate-400 text-xs mt-1">Carga un archivo Excel con el inventario de ubicaciones.</p></div>
              <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap"><i className="ri-file-excel-2-line" />Cargar Excel</button>
            </div>
          ) : (
            <div className="px-6 py-4">
              {/* Tabs */}
              <div className="flex gap-1 mb-4 flex-wrap">
                {[{ id:'resumen', icon:'ri-dashboard-line', label:'Resumen' }, { id:'zonas', icon:'ri-map-pin-line', label:'Por Zona' }, { id:'datos', icon:'ri-table-line', label:'Ver datos' }].map(t => (
                  <button key={t.id} onClick={() => setTab(t.id as Tab)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${tab === t.id ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    <i className={`${t.icon} text-[11px]`} />{t.label}
                  </button>
                ))}
              </div>

              {/* ── RESUMEN TAB ── */}
              {tab === 'resumen' && globalTotals && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    <StatPill label="Total Slots" value={globalTotals.total_slots} color="bg-slate-50 border-slate-200 text-slate-800" />
                    <StatPill label="Zonas" value={globalTotals.total_zonas} color="bg-cyan-50 border-cyan-100 text-cyan-800" />
                    <StatPill label="Libres" value={globalTotals.total_libres} color="bg-emerald-50 border-emerald-100 text-emerald-800" />
                    <StatPill label="Bloqueados" value={globalTotals.total_bloqueados} color="bg-rose-50 border-rose-100 text-rose-800" />
                    <StatPill label="Reservados" value={globalTotals.total_reservados} color="bg-amber-50 border-amber-100 text-amber-800" />
                  </div>
                  {/* Occupancy bar */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <p className="text-sm font-semibold text-slate-700 mb-3">Distribución global por Estado</p>
                    <div className="flex h-6 rounded-full overflow-hidden gap-0.5">
                      {[
                        { label:'Libres', val: globalTotals.total_libres, cls: 'bg-emerald-400' },
                        { label:'Bloqueados', val: globalTotals.total_bloqueados, cls: 'bg-rose-400' },
                        { label:'Reservados', val: globalTotals.total_reservados, cls: 'bg-amber-400' },
                        { label:'Otros', val: globalTotals.total_slots - globalTotals.total_libres - globalTotals.total_bloqueados - globalTotals.total_reservados, cls: 'bg-slate-300' },
                      ].filter(s => s.val > 0).map(s => (
                        <div key={s.label} className={`${s.cls} transition-all`} style={{ width: `${(s.val / globalTotals.total_slots) * 100}%` }} title={`${s.label}: ${fmt(s.val)} (${pct(s.val, globalTotals.total_slots)}%)`} />
                      ))}
                    </div>
                    <div className="flex gap-4 mt-2 flex-wrap">
                      {[{ label:'Libres', val: globalTotals.total_libres, cls:'bg-emerald-400' }, { label:'Bloqueados', val: globalTotals.total_bloqueados, cls:'bg-rose-400' }, { label:'Reservados', val: globalTotals.total_reservados, cls:'bg-amber-400' }].map(s => (
                        <div key={s.label} className="flex items-center gap-1.5 text-xs text-slate-600">
                          <span className={`w-3 h-3 rounded-full flex-shrink-0 ${s.cls}`} />
                          {s.label}: {fmt(s.val)} ({pct(s.val, globalTotals.total_slots)}%)
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Zone list */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <p className="text-sm font-semibold text-slate-700 mb-3">Slots por Zona Almacenaje</p>
                    <div className="space-y-2">
                      {zonaResumen.map((z, i) => {
                        const pctTotal = globalTotals.total_slots > 0 ? (z.total_slots / globalTotals.total_slots) * 100 : 0;
                        return (
                          <div key={z.zona} className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: `hsl(${(i * 47) % 360}, 60%, 55%)` }} />
                            <span className="w-32 text-xs text-slate-600 font-medium truncate flex-shrink-0" title={z.zona}>{z.zona}</span>
                            <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-cyan-400 rounded-full transition-all" style={{ width: `${Math.max(pctTotal, 0.5)}%` }} /></div>
                            <span className="w-16 text-right text-xs text-slate-700 font-medium flex-shrink-0">{fmt(z.total_slots)}</span>
                            <span className="w-10 text-right text-xs text-slate-400 flex-shrink-0">{pctTotal.toFixed(1)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ── ZONAS TAB ── */}
              {tab === 'zonas' && (
                <div className="space-y-4">
                  {/* Cluster manager */}
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-400">Selecciona zona o cluster para ver el detalle</p>
                    <button onClick={() => setShowClusterMgr(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap">
                      <i className={`ri-stack-${showClusterMgr ? 'fill' : 'line'} text-sm`} />Clusters
                      {clusters.length > 0 && <span className="ml-1 px-1.5 py-0.5 bg-cyan-100 text-cyan-700 rounded-full text-[10px] font-semibold">{clusters.length}</span>}
                    </button>
                  </div>
                  {showClusterMgr && <ZonaClusterManager tableName="conteo_slots_clusters" clusters={clusters} zonas={zonaResumen.map(z => z.zona)} onChanged={loadClusters} />}

                  {/* Zone / cluster tabs */}
                  <div className="flex gap-1.5 flex-wrap">
                    {clusters.map(cluster => {
                      const isActive = activeSelection.type === 'cluster' && activeSelection.cluster.id === cluster.id;
                      const total = zonaResumen.filter(z => cluster.zonas.includes(z.zona)).reduce((s, z) => s + z.total_slots, 0);
                      const pctG = globalTotals ? pct(total, globalTotals.total_slots) : '0';
                      return (
                        <button key={cluster.id} onClick={() => setActiveSelection({ type: 'cluster', cluster })}
                          className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${isActive ? `${clusterActiveBg(cluster.color)} border-transparent` : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                          <i className={`ri-stack-line ${isActive ? 'text-white/80' : 'text-slate-400'}`} />
                          {cluster.nombre}
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{fmt(total)} · {pctG}%</span>
                        </button>
                      );
                    })}
                    {clusters.length > 0 && unclusteredZones.length > 0 && <div className="flex items-center px-1"><div className="h-5 w-px bg-slate-200" /></div>}
                    {unclusteredZones.map((z, i) => {
                      const isActive = activeSelection.type === 'zone' && activeSelection.zona === z.zona;
                      const dotColor = ZONE_COLORS[i % ZONE_COLORS.length];
                      const pctG = globalTotals ? pct(z.total_slots, globalTotals.total_slots) : '0';
                      return (
                        <button key={z.zona} onClick={() => setActiveSelection({ type: 'zone', zona: z.zona })}
                          className={`px-3 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${isActive ? 'bg-cyan-600 text-white border-transparent shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-cyan-300 hover:bg-cyan-50'}`}>
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-white/70' : dotColor}`} />
                          {z.zona}
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{fmt(z.total_slots)} · {pctG}%</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Active zone/cluster stats */}
                  {activeStats && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                        <StatPill label={isCluster ? `Total (${activeCluster?.nombre})` : `Total (${activeZona})`} value={activeStats.total} color="bg-cyan-50 border-cyan-100 text-cyan-800" />
                        <StatPill label="Libres" value={activeStats.libres} color="bg-emerald-50 border-emerald-100 text-emerald-800" />
                        <StatPill label="Bloqueados" value={activeStats.bloqueados} color="bg-rose-50 border-rose-100 text-rose-800" />
                        <StatPill label="Reservados" value={activeStats.reservados} color="bg-amber-50 border-amber-100 text-amber-800" />
                        <StatPill label="Otros" value={activeStats.otros} color="bg-slate-50 border-slate-200 text-slate-700" />
                      </div>

                      {isCluster && activeCluster && (
                        <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                          <p className="text-xs font-medium text-slate-600 mb-2">Zonas en este cluster:</p>
                          <div className="flex flex-wrap gap-1.5">{activeCluster.zonas.map(z => { const zr = zonaResumen.find(r => r.zona === z); return <span key={z} className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs text-slate-600">{z}{zr ? ` · ${fmt(zr.total_slots)}` : ''}</span>; })}</div>
                        </div>
                      )}

                      {detailLoading ? (
                        <div className="flex items-center justify-center py-8"><div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>
                      ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <div className="bg-white border border-slate-200 rounded-xl p-5">
                            <p className="text-sm font-semibold text-slate-700 mb-3">Por Estado</p>
                            {estadoBreakdown.length > 0 ? <BreakdownBar items={estadoBreakdown} total={activeStats.total} /> : <p className="text-xs text-slate-400">Sin datos</p>}
                          </div>
                          <div className="bg-white border border-slate-200 rounded-xl p-5">
                            <p className="text-sm font-semibold text-slate-700 mb-3">Por Tipo Ubicación</p>
                            {tipoBreakdown.length > 0 ? <BreakdownBar items={tipoBreakdown} total={activeStats.total} /> : <p className="text-xs text-slate-400">Sin datos</p>}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── DATOS TAB ── */}
              {tab === 'datos' && <RawTable headers={masivoInfo?.headers ?? []} />}
            </div>
          )}
        </div>
      </div>

      {showUpload && (
        <React.Suspense fallback={null}>
          {React.createElement(React.lazy(() => import('./components/ExcelUploadModal')), { onClose: () => setShowUpload(false), onSuccess: loadData })}
        </React.Suspense>
      )}
    </AppLayout>
  );
}
