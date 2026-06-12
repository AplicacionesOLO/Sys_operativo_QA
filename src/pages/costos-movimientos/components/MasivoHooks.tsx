import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import ExportMenu from '@/components/base/ExportMenu';
import type {
  MovimientosArticuloResumenRow,
  MovimientosZonaResumenRow,
  MovimientosZonaArticuloDetalleRow,
  MovimientosZonaArticuloCompaniaRow,
  MovimientosZonaArticuloMensualRow,
  MovimientosResumenCompleto,
} from '@/types/costos_movimientos';

export type {
  MovimientosArticuloResumenRow as ArticuloResumenRow,
  MovimientosZonaResumenRow as ZonaResumenRow,
  MovimientosZonaArticuloDetalleRow as ZonaArticuloDetalleRow,
  MovimientosZonaArticuloCompaniaRow as ZonaArticuloCompaniaRow,
  MovimientosZonaArticuloMensualRow as ZonaArticuloMensualRow,
  MovimientosResumenCompleto as ResumenCompleto,
};

export interface MovimientosMasivoResumen {
  totalRegistros: number;
  headers: string[];
}

// ── Resumen básico ────────────────────────────────────────────────────────────

export function useMovimientosMasivoResumen() {
  const [data, setData] = useState<MovimientosMasivoResumen | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { count } = await supabase.from('costos_movimientos_raw').select('*', { count: 'exact', head: true });
    if (!count || count === 0) { setData(null); setLoading(false); return; }
    const { data: sampleRow } = await supabase.from('costos_movimientos_raw').select('raw_data').limit(1).single();
    let headers: string[] = [];
    if (sampleRow?.raw_data && typeof sampleRow.raw_data === 'object') {
      headers = Object.keys(sampleRow.raw_data as Record<string, unknown>);
    }
    setData({ totalRegistros: count, headers });
    setLoading(false);
  }, []);

  return { data, loading, load };
}

// ── Artículo + Zona resumen ───────────────────────────────────────────────────

export function useMovimientosArticuloResumen() {
  const [data, setData] = useState<MovimientosResumenCompleto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const PAGE = 1000;
      let allArticulos: any[] = [];
      let offset = 0;
      while (true) {
        const { data: page } = await supabase.rpc('fn_movimientos_articulo_resumen', { p_offset: offset, p_limit: PAGE });
        if (!page || page.length === 0) break;
        allArticulos = allArticulos.concat(page);
        if (page.length < PAGE) break;
        offset += PAGE;
      }

      const [{ data: zonasRaw }, { data: totalesRaw }, { count: totalRows }] = await Promise.all([
        supabase.rpc('fn_movimientos_zona_resumen'),
        supabase.rpc('fn_movimientos_totales'),
        supabase.from('costos_movimientos_raw').select('*', { count: 'exact', head: true }),
      ]);

      const t0 = (totalesRaw as any[])?.[0] ?? {};
      setData({
        articulos: ((allArticulos ?? []) as any[]).map((r: any) => ({
          articulo: String(r.articulo ?? ''),
          descripcion: String(r.descripcion ?? ''),
          movimientos: Number(r.movimientos) || 0,
          unidades: Number(r.unidades) || 0,
          meses_distintos: Number(r.meses_distintos) || 0,
          prom_movimientos_mes: Number(r.prom_movimientos_mes) || 0,
          prom_unidades_mes: Number(r.prom_unidades_mes) || 0,
        })),
        zonas: ((zonasRaw ?? []) as any[]).map((r: any) => ({
          zona: String(r.zona ?? ''),
          movimientos: Number(r.movimientos) || 0,
          unidades: Number(r.unidades) || 0,
          articulos_distintos: Number(r.articulos_distintos) || 0,
          meses_distintos: Number(r.meses_distintos) || 0,
          prom_movimientos_mes: Number(r.prom_movimientos_mes) || 0,
          prom_unidades_mes: Number(r.prom_unidades_mes) || 0,
        })),
        zonaArticulos: [],
        totalRows: totalRows ?? 0,
        totalMovArticulos: Number(t0.total_movimientos) || 0,
        totalMovZonas: Number(t0.total_mov_zonas) || 0,
        totalUnidArticulos: Number(t0.total_unidades) || 0,
        totalUnidZonas: Number(t0.total_unid_zonas) || 0,
        totalArticulos: Number(t0.total_articulos) || 0,
        totalZonas: Number(t0.total_zonas) || 0,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar resumen');
      setData(null);
    }
    setLoading(false);
  }, []);

  return { data, loading, error, load };
}

// ── Zona + Compañía + Artículo detalle ────────────────────────────────────────

export function useMovimientosZonaCompaniaResumen(zona: string) {
  const [data, setData] = useState<MovimientosZonaArticuloCompaniaRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!zona) { setData(null); return; }
    setLoading(true);
    const PAGE = 1000;
    let allRows: any[] = [];
    let offset = 0;
    while (true) {
      const { data: page } = await supabase.rpc('fn_movimientos_zona_compania_articulo', { p_zona: zona, p_offset: offset, p_limit: PAGE });
      if (!page || page.length === 0) break;
      allRows = allRows.concat(page);
      if (page.length < PAGE) break;
      offset += PAGE;
    }
    setData(allRows.map((r: any) => ({
      zona: String(r.zona ?? ''),
      idCompania: String(r.id_compania ?? ''),
      articulo: String(r.articulo ?? ''),
      descripcion: String(r.descripcion ?? ''),
      movimientos: Number(r.movimientos) || 0,
      unidades: Number(r.unidades) || 0,
    })));
    setLoading(false);
  }, [zona]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, load };
}

// ── Zona + Artículo mensual ───────────────────────────────────────────────────

export function useMovimientosZonaArticuloMensual(zona: string) {
  const [data, setData] = useState<MovimientosZonaArticuloMensualRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!zona) { setData(null); return; }
    setLoading(true);
    const PAGE = 1000;
    let allRows: any[] = [];
    let offset = 0;
    while (true) {
      const { data: page } = await supabase.rpc('fn_movimientos_zona_articulo_mensual', { p_zona: zona, p_offset: offset, p_limit: PAGE });
      if (!page || page.length === 0) break;
      allRows = allRows.concat(page);
      if (page.length < PAGE) break;
      offset += PAGE;
    }
    setData(allRows.map((r: any) => ({
      zona: String(r.zona ?? ''),
      idCompania: String(r.id_compania ?? ''),
      articulo: String(r.articulo ?? ''),
      descripcion: String(r.descripcion ?? ''),
      mes: Number(r.mes) || 0,
      mes_nombre: String(r.mes_nombre ?? ''),
      movimientos: Number(r.movimientos) || 0,
      unidades: Number(r.unidades) || 0,
    })));
    setLoading(false);
  }, [zona]);

  useEffect(() => { load(); }, [load]);
  return { data, loading, load };
}

// ── Tabla RAW paginada ────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export function MovimientosRawTable({ headers }: { headers: string[] }) {
  const [rows, setRows] = useState<Array<{ id: string; raw_data: Record<string, unknown> }>>([]);
  const [page, setPage] = useState(0);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadPage = useCallback(async (p: number) => {
    setLoading(true);
    const { data, count: c } = await supabase.from('costos_movimientos_raw').select('id, raw_data', { count: 'exact' }).order('created_at', { ascending: false }).range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1);
    if (data) { setRows(data as any); setCount(c ?? 0); }
    setLoading(false);
  }, []);

  useEffect(() => { loadPage(page); }, [loadPage, page]);

  const totalPages = Math.ceil(count / PAGE_SIZE);
  const fmt = (n: number) => new Intl.NumberFormat('es-CO').format(n);
  const displayHeaders = headers.length > 0 ? headers : (rows.length > 0 && rows[0].raw_data ? Object.keys(rows[0].raw_data) : []);

  const handleGetExportData = useCallback(async () => {
    const EXPORT_PAGE = 1000;
    let allRows: Array<{ id: string; raw_data: Record<string, unknown> }> = [];
    let offset = 0;
    while (true) {
      const { data: pageData } = await supabase.from('costos_movimientos_raw').select('id, raw_data').order('created_at', { ascending: false }).range(offset, offset + EXPORT_PAGE - 1);
      if (!pageData || pageData.length === 0) break;
      allRows = allRows.concat(pageData as any);
      if (pageData.length < EXPORT_PAGE) break;
      offset += EXPORT_PAGE;
    }
    const exportRows = allRows.map(r => displayHeaders.map(h => { const val = r.raw_data?.[h]; return val !== null && val !== undefined ? String(val) : ''; }));
    return { headers: displayHeaders, rows: exportRows };
  }, [displayHeaders]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-xs text-slate-400">Página {page + 1} de {totalPages || 1} · {fmt(count)} registros</span>
        <ExportMenu filenameBase="datos-movimientos" getExportData={handleGetExportData} />
      </div>
      <div className="border border-slate-200 rounded-lg overflow-auto max-h-[50vh]">
        <table className="text-xs whitespace-nowrap w-full">
          <thead>
            <tr className="bg-slate-50 sticky top-0 z-10">
              <th className="px-3 py-2 text-left text-slate-500 font-medium border-r border-slate-200">#</th>
              {displayHeaders.map(h => <th key={h} className="px-3 py-2 text-left text-slate-500 font-medium border-r border-slate-200 max-w-[200px] overflow-hidden text-ellipsis">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={displayHeaders.length + 1} className="px-3 py-8 text-center text-slate-400"><div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />Cargando...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={displayHeaders.length + 1} className="px-3 py-8 text-center text-slate-400">Sin registros</td></tr>
            ) : rows.map((r, i) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-1.5 text-slate-400 border-r border-slate-100 text-center">{page * PAGE_SIZE + i + 1}</td>
                {displayHeaders.map(h => { const val = r.raw_data?.[h]; const display = val !== null && val !== undefined ? String(val) : '—'; return <td key={h} className="px-3 py-1.5 text-slate-600 border-r border-slate-100 max-w-[200px] overflow-hidden text-ellipsis" title={display}>{display}</td>; })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"><i className="ri-arrow-left-line mr-1" /> Anterior</button>
          <span className="text-xs text-slate-400">{page + 1} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap">Siguiente <i className="ri-arrow-right-line ml-1" /></button>
        </div>
      )}
    </div>
  );
}

// ── Cluster types ────────────────────────────────────────────────────────────

export interface MovimientosCluster {
  id: string;
  nombre: string;
  zonas: string[];
  color: string;
  orden: number;
}

// ── Multi-zone (cluster) hooks ────────────────────────────────────────────────

export function useMovimientosClusterCompaniaResumen(zonas: string[]) {
  const [data, setData] = useState<MovimientosZonaArticuloCompaniaRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!zonas.length) { setData(null); return; }
    setLoading(true);
    const PAGE = 1000;
    let allRows: any[] = [];
    let offset = 0;
    while (true) {
      const { data: page } = await supabase.rpc('fn_movimientos_zonas_compania_articulo', { p_zonas: zonas, p_offset: offset, p_limit: PAGE });
      if (!page || page.length === 0) break;
      allRows = allRows.concat(page);
      if (page.length < PAGE) break;
      offset += PAGE;
    }
    setData(allRows.map((r: any) => ({
      zona: r.zona ?? 'CLUSTER',
      idCompania: String(r.id_compania ?? ''),
      articulo: String(r.articulo ?? ''),
      descripcion: String(r.descripcion ?? ''),
      movimientos: Number(r.movimientos) || 0,
      unidades: Number(r.unidades) || 0,
    })));
    setLoading(false);
  }, [JSON.stringify(zonas)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  return { data, loading, load };
}

export function useMovimientosClusterMensual(zonas: string[]) {
  const [data, setData] = useState<MovimientosZonaArticuloMensualRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!zonas.length) { setData(null); return; }
    setLoading(true);
    const PAGE = 1000;
    let allRows: any[] = [];
    let offset = 0;
    while (true) {
      const { data: page } = await supabase.rpc('fn_movimientos_zonas_articulo_mensual', { p_zonas: zonas, p_offset: offset, p_limit: PAGE });
      if (!page || page.length === 0) break;
      allRows = allRows.concat(page);
      if (page.length < PAGE) break;
      offset += PAGE;
    }
    setData(allRows.map((r: any) => ({
      zona: r.zona ?? 'CLUSTER', idCompania: String(r.id_compania ?? ''),
      articulo: String(r.articulo ?? ''), descripcion: String(r.descripcion ?? ''),
      mes: Number(r.mes) || 0, mes_nombre: String(r.mes_nombre ?? ''),
      movimientos: Number(r.movimientos) || 0, unidades: Number(r.unidades) || 0,
    })));
    setLoading(false);
  }, [JSON.stringify(zonas)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  return { data, loading, load };
}

// ── StatCard ──────────────────────────────────────────────────────────────────

export function StatCard({ icon, iconColor, bg, label, value, sub }: { icon: string; iconColor: string; bg: string; label: string; value: string; sub: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center gap-4">
      <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${bg} flex-shrink-0`}><i className={`${icon} text-xl ${iconColor}`} /></div>
      <div className="min-w-0">
        <p className="text-xs text-slate-400 whitespace-nowrap">{label}</p>
        <p className="text-lg font-bold text-slate-800 leading-tight mt-0.5">{value}</p>
        <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}
