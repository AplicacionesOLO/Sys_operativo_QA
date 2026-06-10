import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import AppLayout from '@/components/feature/AppLayout';
import type { VolumenFila, ModuloColumna } from '@/types/volumenes';
import VolumenesBlockTable from './components/VolumenesBlockTable';
import VolumenesClientSummary from './components/VolumenesClientSummary';
import ExcelUploadModal from './components/ExcelUploadModal';

// ── Main Page ───────────────────────────────────────────────────────────────

export default function VolumenesPage() {
  /** Columnas = meses detectados del Excel */
  const [meses, setMeses] = useState<ModuloColumna[]>([]);
  const [recibidas, setRecibidas] = useState<VolumenFila[]>([]);
  const [despachadas, setDespachadas] = useState<VolumenFila[]>([]);
  const [totalInOut, setTotalInOut] = useState<VolumenFila | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: colData }, { data: filData }] = await Promise.all([
      supabase.from('volumenes_columnas').select('*').order('orden'),
      supabase.from('volumenes').select('*').order('created_at'),
    ]);

    const cols = (colData as ModuloColumna[]) ?? [];
    const filas = (filData as VolumenFila[]) ?? [];

    setMeses(cols);
    setRecibidas(filas.filter(f => f.proceso === 'recibido'));
    setDespachadas(filas.filter(f => f.proceso === 'despachado'));
    const tiRow = filas.find(f => f.proceso === 'total_in_out');
    setTotalInOut(tiRow ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const hasData = recibidas.length > 0 || despachadas.length > 0;

  if (loading) {
    return (
      <AppLayout title="Volúmenes" subtitle="Cargando módulo...">
        <div className="flex items-center justify-center py-32">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Cargando datos...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Volúmenes"
      subtitle="Unidades recibidas y despachadas por cliente y mes"
      actions={
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
        >
          <div className="w-4 h-4 flex items-center justify-center">
            <i className="ri-file-excel-2-line" />
          </div>
          Cargar Excel
        </button>
      }
    >
      <div className="space-y-6">
        {!hasData ? (
          <EmptyState onUpload={() => setShowUpload(true)} />
        ) : (
          <>
            <StatsBar recibidas={recibidas} despachadas={despachadas} meses={meses} />

            <VolumenesBlockTable tipo="recibido" filas={recibidas} meses={meses} />
            <VolumenesBlockTable
              tipo="despachado"
              filas={despachadas}
              meses={meses}
              totalInOut={totalInOut}
            />
            <VolumenesClientSummary meses={meses} recibidas={recibidas} despachadas={despachadas} />
          </>
        )}
      </div>

      {showUpload && (
        <ExcelUploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={() => { loadData(); }}
        />
      )}
    </AppLayout>
  );
}

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 border-dashed px-8 py-20 flex flex-col items-center gap-5">
      <div className="w-16 h-16 flex items-center justify-center rounded-full bg-emerald-50">
        <i className="ri-bar-chart-box-line text-3xl text-emerald-400" />
      </div>
      <div className="text-center max-w-sm">
        <p className="text-slate-700 font-semibold text-base">Sin datos de volúmenes</p>
        <p className="text-slate-400 text-sm mt-2">
          Carga un archivo Excel con los bloques <strong>&quot;Uds recibidas&quot;</strong> y <strong>&quot;Uds Despachadas&quot;</strong>.<br />
          <span className="text-xs mt-1 block">Columna A = clientes · Columnas B+ = meses</span>
        </p>
      </div>
      <button
        onClick={onUpload}
        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
      >
        <div className="w-4 h-4 flex items-center justify-center">
          <i className="ri-file-excel-2-line" />
        </div>
        Cargar Excel
      </button>
      <p className="text-xs text-slate-400 text-center max-w-xs">
        Los clientes y meses se detectan automáticamente desde el archivo. La carga siempre reemplaza la información anterior.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatsBar
// ---------------------------------------------------------------------------

function sumFilas(filas: VolumenFila[], meses: ModuloColumna[]): number {
  return filas.reduce((s, f) => {
    return s + meses.reduce((ms, m) => {
      const v = f.valores[m.id];
      return ms + (typeof v === 'number' ? v : 0);
    }, 0);
  }, 0);
}

function getUniqueClients(rec: VolumenFila[], des: VolumenFila[]): string[] {
  return [...new Set([...rec.map(f => f.subproceso), ...des.map(f => f.subproceso)].filter(Boolean))];
}

interface StatsBarProps {
  recibidas: VolumenFila[];
  despachadas: VolumenFila[];
  meses: ModuloColumna[];
}

function StatsBar({ recibidas, despachadas, meses }: StatsBarProps) {
  const totalRec = sumFilas(recibidas, meses);
  const totalDes = sumFilas(despachadas, meses);
  const pctDes = totalRec > 0 ? Math.round((totalDes / totalRec) * 100) : 0;
  const nClientes = getUniqueClients(recibidas, despachadas).length;

  const fmt = (n: number) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        icon="ri-arrow-down-circle-line"
        iconColor="text-emerald-500"
        bg="bg-emerald-50"
        label="Total recibidas"
        value={fmt(totalRec)}
        sub={`${recibidas.length} clientes`}
      />
      <StatCard
        icon="ri-arrow-up-circle-line"
        iconColor="text-sky-500"
        bg="bg-sky-50"
        label="Total despachadas"
        value={fmt(totalDes)}
        sub={`${despachadas.length} clientes`}
      />
      <StatCard
        icon="ri-percent-line"
        iconColor="text-amber-500"
        bg="bg-amber-50"
        label="% Despacho"
        value={`${pctDes}%`}
        sub="sobre total recibido"
      />
      <StatCard
        icon="ri-calendar-line"
        iconColor="text-violet-500"
        bg="bg-violet-50"
        label="Meses / Clientes"
        value={`${meses.length} / ${nClientes}`}
        sub="períodos y clientes"
      />
    </div>
  );
}

interface StatCardProps {
  icon: string;
  iconColor: string;
  bg: string;
  label: string;
  value: string;
  sub: string;
}

function StatCard({ icon, iconColor, bg, label, value, sub }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center gap-4">
      <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${bg} flex-shrink-0`}>
        <i className={`${icon} text-xl ${iconColor}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-400 whitespace-nowrap">{label}</p>
        <p className="text-lg font-bold text-slate-800 leading-tight mt-0.5">{value}</p>
        <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}