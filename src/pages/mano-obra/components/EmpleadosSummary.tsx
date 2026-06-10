import { useMemo } from 'react';
import type { EmpleadoImportado, DistribucionAgregada } from '@/types/mano_obra_empleados';

interface EmpleadosSummaryProps {
  empleados: EmpleadoImportado[];
}

function groupBy(
  empleados: EmpleadoImportado[],
  field: keyof Pick<EmpleadoImportado, 'area' | 'seccion' | 'tipo'>,
): DistribucionAgregada[] {
  const map: Record<string, { dist: number; count: number }> = {};
  empleados.forEach(e => {
    const key = String(e[field] ?? '').trim() || '(sin definir)';
    if (!map[key]) map[key] = { dist: 0, count: 0 };
    map[key].dist  += e.dist;
    map[key].count += 1;
  });
  return Object.entries(map)
    .map(([key, { dist, count }]) => ({ key, total_dist: dist, count }))
    .sort((a, b) => b.total_dist - a.total_dist);
}

function fmtDist(n: number): string {
  return n.toFixed(2);
}

function fmtPct(n: number, total: number): string {
  if (total === 0) return '0.00%';
  return ((n / total) * 100).toFixed(2) + '%';
}

// ── Component ────────────────────────────────────────────────────────────────

export default function EmpleadosSummary({ empleados }: EmpleadosSummaryProps) {
  const totalesPorArea   = useMemo(() => groupBy(empleados, 'area'),    [empleados]);
  const totalesPorSec    = useMemo(() => groupBy(empleados, 'seccion'), [empleados]);
  const totalesPorTipo   = useMemo(() => groupBy(empleados, 'tipo'),    [empleados]);
  const totalGeneral     = useMemo(() => empleados.reduce((s, e) => s + e.dist, 0), [empleados]);

  if (empleados.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* Total general card */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon="ri-team-line"
          iconColor="text-emerald-500"
          bg="bg-emerald-50"
          label="Total empleados"
          value={empleados.length.toString()}
          sub="registros activos"
        />
        <SummaryCard
          icon="ri-pie-chart-line"
          iconColor="text-sky-500"
          bg="bg-sky-50"
          label="Distribución total"
          value={fmtDist(totalGeneral)}
          sub="suma de Dist"
        />
        <SummaryCard
          icon="ri-layout-grid-line"
          iconColor="text-amber-500"
          bg="bg-amber-50"
          label="Áreas únicas"
          value={totalesPorArea.length.toString()}
          sub="con distribución"
        />
        <SummaryCard
          icon="ri-user-settings-line"
          iconColor="text-violet-500"
          bg="bg-violet-50"
          label="Tipos únicos"
          value={totalesPorTipo.length.toString()}
          sub="con distribución"
        />
      </div>

      {/* Three tables side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <AggTable title="Distribución por Área" icon="ri-layout-grid-line" color="emerald" rows={totalesPorArea} totalGeneral={totalGeneral} />
        <AggTable title="Distribución por Sección" icon="ri-organization-chart" color="sky" rows={totalesPorSec} totalGeneral={totalGeneral} />
        <AggTable title="Distribución por Tipo" icon="ri-user-settings-line" color="violet" rows={totalesPorTipo} totalGeneral={totalGeneral} />
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface SummaryCardProps {
  icon: string; iconColor: string; bg: string;
  label: string; value: string; sub: string;
}

function SummaryCard({ icon, iconColor, bg, label, value, sub }: SummaryCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center gap-4">
      <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${bg} flex-shrink-0`}>
        <i className={`${icon} text-xl ${iconColor}`} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-lg font-bold text-slate-800 leading-tight mt-0.5">{value}</p>
        <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
      </div>
    </div>
  );
}

const COLOR_MAP: Record<string, { header: string; bar: string; badge: string; text: string }> = {
  emerald: { header: 'bg-emerald-50 border-emerald-100', bar: 'bg-emerald-400', badge: 'bg-emerald-100 text-emerald-700', text: 'text-emerald-700' },
  sky:     { header: 'bg-sky-50 border-sky-100',         bar: 'bg-sky-400',     badge: 'bg-sky-100 text-sky-700',         text: 'text-sky-700'     },
  violet:  { header: 'bg-violet-50 border-violet-100',   bar: 'bg-violet-400',  badge: 'bg-violet-100 text-violet-700',   text: 'text-violet-700'  },
};

interface AggTableProps {
  title: string;
  icon: string;
  color: string;
  rows: DistribucionAgregada[];
  totalGeneral: number;
}

function AggTable({ title, icon, color, rows, totalGeneral }: AggTableProps) {
  const c = COLOR_MAP[color] ?? COLOR_MAP.emerald;
  const MAX_ROWS = 10;
  const shown = rows.slice(0, MAX_ROWS);
  const maxDist = rows[0]?.total_dist ?? 1;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className={`px-4 py-3 border-b flex items-center gap-2 ${c.header}`}>
        <div className="w-5 h-5 flex items-center justify-center">
          <i className={`${icon} text-sm ${c.text}`} />
        </div>
        <span className="text-xs font-semibold text-slate-700">{title}</span>
        <span className={`ml-auto text-xs px-1.5 py-0.5 rounded-full ${c.badge}`}>{rows.length}</span>
      </div>
      <div className="divide-y divide-slate-100">
        {shown.map(row => {
          const barPct = maxDist > 0 ? (row.total_dist / maxDist) * 100 : 0;
          return (
            <div key={row.key} className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-medium text-slate-700 truncate flex-1" title={row.key}>{row.key}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs tabular-nums text-slate-500">{fmtPct(row.total_dist, totalGeneral)}</span>
                  <span className={`text-xs tabular-nums font-semibold ${c.text}`}>{fmtDist(row.total_dist)}</span>
                </div>
              </div>
              <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${c.bar}`} style={{ width: `${barPct}%` }} />
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{row.count} empleado{row.count !== 1 ? 's' : ''}</p>
            </div>
          );
        })}
        {rows.length > MAX_ROWS && (
          <div className="px-4 py-2 text-xs text-slate-400 text-center">
            +{rows.length - MAX_ROWS} más...
          </div>
        )}
      </div>
      {/* Total row */}
      <div className={`px-4 py-2.5 border-t-2 border-slate-200 flex items-center justify-between ${c.header}`}>
        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Total</span>
        <span className={`text-xs font-bold tabular-nums ${c.text}`}>{fmtDist(totalGeneral)}</span>
      </div>
    </div>
  );
}
