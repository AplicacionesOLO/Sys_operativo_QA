import type { CostoColumna, CostoFila } from '@/types/costos';
import { formatCellValue, getColumnTotal } from '@/types/costos';

interface CostosSummaryProps {
  columnas: CostoColumna[];
  filas: CostoFila[];
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 px-5 py-4 flex items-center gap-4">
      <div className={`w-11 h-11 flex items-center justify-center rounded-xl ${color}`}>
        <i className={`${icon} text-xl`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-lg font-bold text-slate-800 mt-0.5 truncate">{value}</p>
      </div>
    </div>
  );
}

export default function CostosSummary({ columnas, filas }: CostosSummaryProps) {
  // Find key columns to highlight
  const numericCols = columnas.filter(c => ['moneda', 'numero', 'porcentaje'].includes(c.tipo));
  const procesosUnicos = new Set(filas.map(f => f.proceso)).size;
  const subprocesosUnicos = filas.length;

  // Top 2 moneda columns for summary cards
  const monedaCols = columnas.filter(c => c.tipo === 'moneda').slice(0, 2);

  return (
    <div className="space-y-4">
      {/* Base stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Procesos"
          value={String(procesosUnicos)}
          icon="ri-organization-chart"
          color="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Subprocesos"
          value={String(subprocesosUnicos)}
          icon="ri-flow-chart"
          color="bg-slate-100 text-slate-600"
        />
        <StatCard
          label="Columnas activas"
          value={String(columnas.length)}
          icon="ri-table-view"
          color="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Métricas numéricas"
          value={String(numericCols.length)}
          icon="ri-bar-chart-grouped-line"
          color="bg-teal-50 text-teal-600"
        />
      </div>

      {/* Top moneda column totals */}
      {monedaCols.length > 0 && filas.length > 0 && (
        <div className={`grid gap-3 ${monedaCols.length === 1 ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-2'}`}>
          {monedaCols.map(col => {
            const total = getColumnTotal(filas, col.id, col.tipo);
            if (total === null) return null;

            // Breakdown by proceso
            const porProceso = Array.from(new Set(filas.map(f => f.proceso))).map(proc => {
              const rows = filas.filter(f => f.proceso === proc);
              const sum = rows.reduce((acc, r) => acc + (Number(r.valores[col.id]) || 0), 0);
              return { proceso: proc, sum, pct: total > 0 ? (sum / total) * 100 : 0 };
            }).sort((a, b) => b.sum - a.sum);

            return (
              <div key={col.id} className="bg-white rounded-xl border border-slate-100 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">{col.nombre}</p>
                    <p className="text-2xl font-bold text-slate-800 mt-0.5">
                      {formatCellValue(total, col.tipo)}
                    </p>
                  </div>
                  <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-emerald-50">
                    <i className="ri-money-dollar-box-line text-xl text-emerald-600" />
                  </div>
                </div>
                {/* Breakdown */}
                <div className="space-y-2">
                  {porProceso.slice(0, 4).map(({ proceso, sum, pct }) => (
                    <div key={proceso}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-600 font-medium truncate max-w-[120px]">{proceso}</span>
                        <span className="text-xs text-slate-500 flex-shrink-0 ml-2">{formatCellValue(sum, col.tipo)} ({pct.toFixed(2)}%)</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
