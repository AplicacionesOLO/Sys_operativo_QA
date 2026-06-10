import type { VolumenFila, ModuloColumna } from '@/types/volumenes';

interface VolumenesClientSummaryProps {
  meses: ModuloColumna[];
  recibidas: VolumenFila[];
  despachadas: VolumenFila[];
}

// ── Formatting helpers ───────────────────────────────────────────────────────

function fmtInt(n: number): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);
}

function fmtDec(n: number): string {
  // Show up to 2 decimals but drop trailing zeros
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

function sumRow(fila: VolumenFila, meses: ModuloColumna[]): number {
  return meses.reduce((s, m) => {
    const v = fila.valores[m.id];
    return s + (typeof v === 'number' ? v : 0);
  }, 0);
}

// ── % despacho calculation — safe, no division by zero ──────────────────────
function calcPctDespacho(des: number, rec: number): number | null {
  if (rec <= 0 && des <= 0) return 0;
  if (rec <= 0) return null; // N/A: despachadas sin recibidas
  return (des / rec) * 100;
}

function renderPct(pct: number | null): React.ReactNode {
  if (pct === null) return <span className="text-xs text-slate-400 italic">N/A</span>;
  const color = pct > 100 ? 'text-rose-600' : pct >= 80 ? 'text-emerald-600' : 'text-amber-600';
  return (
    <span className={`text-sm font-medium tabular-nums ${color}`}>
      {fmtDec(pct)}%
    </span>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function VolumenesClientSummary({
  meses,
  recibidas,
  despachadas,
}: VolumenesClientSummaryProps) {
  const clienteNames = [
    ...new Set([
      ...recibidas.map(f => f.subproceso),
      ...despachadas.map(f => f.subproceso),
    ]),
  ].filter(Boolean);

  if (clienteNames.length === 0) return null;

  const rows = clienteNames.map(nombre => {
    const recRow = recibidas.find(f => f.subproceso === nombre);
    const desRow = despachadas.find(f => f.subproceso === nombre);
    const rec = recRow ? sumRow(recRow, meses) : 0;
    const des = desRow ? sumRow(desRow, meses) : 0;
    const diff = rec - des;
    const pctDes = calcPctDespacho(des, rec);
    const promInOut = (rec + des) / 2;
    return { nombre, rec, des, diff, pctDes, promInOut };
  });

  const totalRec     = rows.reduce((s, r) => s + r.rec, 0);
  const totalDes     = rows.reduce((s, r) => s + r.des, 0);
  const totalDiff    = totalRec - totalDes;
  const totalPct     = calcPctDespacho(totalDes, totalRec);
  const totalProm    = (totalRec + totalDes) / 2;

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
        <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-100">
          <i className="ri-bar-chart-grouped-line text-base text-amber-600" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Resumen por cliente</h3>
          <p className="text-xs text-slate-400">
            Totales acumulados · % despacho = despachadas ÷ recibidas × 100
          </p>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <LegendDot color="bg-emerald-400" label="Recibidas" />
          <LegendDot color="bg-sky-400" label="Despachadas" />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table
          className="w-full text-sm"
          style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: 780 }}
        >
          <thead>
            <tr className="bg-slate-50">
              <Th align="left">Cliente</Th>
              <Th icon="ri-arrow-down-circle-line" iconColor="text-emerald-500">Recibidas</Th>
              <Th icon="ri-arrow-up-circle-line" iconColor="text-sky-500">Despachadas</Th>
              <Th>% Despacho</Th>
              <Th>Diferencia</Th>
              <Th icon="ri-swap-line" iconColor="text-violet-500">Prom. in/out</Th>
              <Th align="left" last>Distribución</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const bg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60';
              const barRec = totalRec > 0 ? Math.min(100, (row.rec / totalRec) * 100) : 0;
              const barDes = totalRec > 0 ? Math.min(100, (row.des / totalRec) * 100) : 0;
              return (
                <tr key={row.nombre} className={bg}>
                  {/* Cliente */}
                  <td className="px-5 py-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-100 flex-shrink-0">
                        <i className="ri-building-2-line text-xs text-slate-500" />
                      </div>
                      <span className="text-sm font-medium text-slate-700">{row.nombre}</span>
                    </div>
                  </td>
                  {/* Recibidas */}
                  <td className="px-5 py-3 text-right border-b border-l border-slate-100">
                    <span className="text-sm font-semibold text-emerald-700 tabular-nums">
                      {fmtInt(row.rec)}
                    </span>
                  </td>
                  {/* Despachadas */}
                  <td className="px-5 py-3 text-right border-b border-l border-slate-100">
                    <span className="text-sm font-semibold text-sky-700 tabular-nums">
                      {fmtInt(row.des)}
                    </span>
                  </td>
                  {/* % Despacho */}
                  <td className="px-5 py-3 text-right border-b border-l border-slate-100">
                    {renderPct(row.pctDes)}
                  </td>
                  {/* Diferencia */}
                  <td className="px-5 py-3 text-right border-b border-l border-slate-100">
                    <span
                      className={`text-sm font-medium tabular-nums ${row.diff >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}
                    >
                      {row.diff >= 0 ? '+' : ''}{fmtInt(row.diff)}
                    </span>
                  </td>
                  {/* Promedio in/out */}
                  <td className="px-5 py-3 text-right border-b border-l border-slate-100">
                    <span className="text-sm font-medium text-violet-700 tabular-nums">
                      {fmtDec(row.promInOut)}
                    </span>
                  </td>
                  {/* Barra distribución */}
                  <td className="px-5 py-3 border-b border-l border-slate-100" style={{ minWidth: 160 }}>
                    <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="absolute left-0 top-0 h-full bg-emerald-400 rounded-full"
                        style={{ width: `${barRec}%` }}
                      />
                      <div
                        className="absolute left-0 top-0 h-full bg-sky-400 rounded-full opacity-70"
                        style={{ width: `${barDes}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {totalRec > 0 ? `${fmtDec((row.rec / totalRec) * 100)}% del total` : '—'}
                    </p>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50">
              <td className="px-5 py-3 border-t-2 border-slate-200">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">TOTAL</span>
              </td>
              <td className="px-5 py-3 text-right border-t-2 border-l border-slate-200">
                <span className="text-sm font-bold text-emerald-700 tabular-nums">{fmtInt(totalRec)}</span>
              </td>
              <td className="px-5 py-3 text-right border-t-2 border-l border-slate-200">
                <span className="text-sm font-bold text-sky-700 tabular-nums">{fmtInt(totalDes)}</span>
              </td>
              <td className="px-5 py-3 text-right border-t-2 border-l border-slate-200">
                {renderPct(totalPct)}
              </td>
              <td className="px-5 py-3 text-right border-t-2 border-l border-slate-200">
                <span
                  className={`text-sm font-bold tabular-nums ${totalDiff >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}
                >
                  {totalDiff >= 0 ? '+' : ''}{fmtInt(totalDiff)}
                </span>
              </td>
              <td className="px-5 py-3 text-right border-t-2 border-l border-slate-200">
                <span className="text-sm font-bold text-violet-700 tabular-nums">{fmtDec(totalProm)}</span>
              </td>
              <td className="px-5 py-3 border-t-2 border-l border-slate-200" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface ThProps {
  children?: React.ReactNode;
  align?: 'left' | 'right';
  icon?: string;
  iconColor?: string;
  last?: boolean;
}

function Th({ children, align = 'right', icon, iconColor, last }: ThProps) {
  return (
    <th
      className={`px-5 py-3 border-b border-slate-200 ${last ? '' : 'border-l first:border-l-0'}`}
      style={{ textAlign: align }}
    >
      <div
        className={`flex items-center gap-1.5 ${align === 'right' ? 'justify-end' : 'justify-start'}`}
      >
        {icon && (
          <div className="w-4 h-4 flex items-center justify-center">
            <i className={`${icon} ${iconColor ?? 'text-slate-400'} text-sm`} />
          </div>
        )}
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
          {children}
        </span>
      </div>
    </th>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}
