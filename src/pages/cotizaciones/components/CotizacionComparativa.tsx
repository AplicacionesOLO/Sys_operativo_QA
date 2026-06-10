import type { CotizacionCabecera, CotizacionDetalle } from '@/types/cotizaciones_v2';
import { MESES } from '@/types/cotizaciones_v2';

interface Props {
  current: CotizacionCabecera;
  previous: CotizacionCabecera | null;
  currentDetalles: CotizacionDetalle[];
  previousDetalles: CotizacionDetalle[];
  onClose: () => void;
}

const fmt = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);

function pctChange(prev: number, curr: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

export default function CotizacionComparativa({ current, previous, currentDetalles, previousDetalles, onClose }: Props) {
  const currency = current.moneda;

  // Group by subproceso
  const allSubprocesos = new Set([
    ...currentDetalles.map(d => `${d.proceso}||${d.subproceso}`),
    ...previousDetalles.map(d => `${d.proceso}||${d.subproceso}`),
  ]);

  const rows = Array.from(allSubprocesos).map(key => {
    const [proceso, subproceso] = key.split('||');
    const curr = currentDetalles.find(d => d.proceso === proceso && d.subproceso === subproceso);
    const prev = previousDetalles.find(d => d.proceso === proceso && d.subproceso === subproceso);
    const currTotal = curr ? curr.total_final : 0;
    const prevTotal = prev ? prev.total_final : 0;
    const diff = currTotal - prevTotal;
    const pct = pctChange(prevTotal, currTotal);
    return { proceso, subproceso, currTotal, prevTotal, diff, pct };
  }).sort((a, b) => a.proceso.localeCompare(b.proceso) || a.subproceso.localeCompare(b.subproceso));

  const totalCurr = current.total_general;
  const totalPrev = previous?.total_general ?? 0;
  const totalDiff = totalCurr - totalPrev;
  const totalPct = pctChange(totalPrev, totalCurr);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-xl flex flex-col" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-800">Vista comparativa</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {MESES[current.mes - 1]} {current.anio} v{current.version}
              {previous ? ` vs ${MESES[previous.mes - 1]} ${previous.anio} v${previous.version}` : ' (sin período anterior)'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <i className="ri-close-line" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                {previous ? `${MESES[previous.mes - 1]} ${previous.anio}` : 'Período anterior'}
              </p>
              <p className="text-xl font-black text-slate-700">{fmt(totalPrev, currency)}</p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-1">
                {MESES[current.mes - 1]} {current.anio}
              </p>
              <p className="text-xl font-black text-emerald-700">{fmt(totalCurr, currency)}</p>
            </div>
            <div className={`rounded-xl p-4 border ${totalDiff >= 0 ? 'bg-rose-50 border-rose-200' : 'bg-teal-50 border-teal-200'}`}>
              <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${totalDiff >= 0 ? 'text-rose-600' : 'text-teal-600'}`}>
                Variación
              </p>
              <div className="flex items-end gap-2">
                <p className={`text-xl font-black ${totalDiff >= 0 ? 'text-rose-700' : 'text-teal-700'}`}>
                  {totalDiff >= 0 ? '+' : ''}{fmt(totalDiff, currency)}
                </p>
                <span className={`text-sm font-bold mb-0.5 ${totalDiff >= 0 ? 'text-rose-500' : 'text-teal-500'}`}>
                  {totalDiff >= 0 ? '+' : ''}{totalPct.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          {/* Detail table */}
          {previous ? (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Subproceso</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Anterior</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Actual</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Diferencia</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">%</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <span className="text-xs text-slate-400">{row.proceso}</span>
                          <p className="text-sm font-medium text-slate-700">{row.subproceso || '—'}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-slate-500 tabular-nums">
                        {row.prevTotal > 0 ? fmt(row.prevTotal, currency) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-slate-700 tabular-nums">
                        {row.currTotal > 0 ? fmt(row.currTotal, currency) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className={`px-4 py-3 text-right text-sm font-semibold tabular-nums ${row.diff > 0 ? 'text-rose-600' : row.diff < 0 ? 'text-teal-600' : 'text-slate-400'}`}>
                        {row.diff !== 0 ? `${row.diff > 0 ? '+' : ''}${fmt(row.diff, currency)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.prevTotal > 0 || row.currTotal > 0 ? (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            row.pct > 5 ? 'bg-rose-100 text-rose-700' :
                            row.pct < -5 ? 'bg-teal-100 text-teal-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {row.pct > 0 ? '+' : ''}{row.pct.toFixed(2)}%
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center bg-slate-50 rounded-xl border border-slate-200 border-dashed">
              <div className="w-12 h-12 flex items-center justify-center rounded-full bg-slate-100">
                <i className="ri-bar-chart-2-line text-xl text-slate-400" />
              </div>
              <p className="text-sm text-slate-500">Sin período anterior para comparar</p>
              <p className="text-xs text-slate-400">Crea cotizaciones de meses anteriores para ver la comparativa</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
