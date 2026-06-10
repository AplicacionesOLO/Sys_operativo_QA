import { useState } from 'react';
import type { VolumenFila, ModuloColumna } from '@/types/volumenes';
import { monthIdToLabel } from '@/lib/volumenesExcelParser';
import { useVolumenesPromedioConfig } from '@/hooks/useVolumenesPromedioConfig';

interface VolumenesBlockTableProps {
  tipo: 'recibido' | 'despachado';
  filas: VolumenFila[];
  meses: ModuloColumna[];
  totalInOut?: VolumenFila | null;
}

const TIPO_CONFIG = {
  recibido: {
    label: 'UNIDADES RECIBIDAS',
    icon: 'ri-arrow-down-circle-line',
    headerBg: 'bg-emerald-700',
    totalText: 'text-emerald-700',
    footerBg: '#f0fdf4',
  },
  despachado: {
    label: 'UNIDADES DESPACHADAS',
    icon: 'ri-arrow-up-circle-line',
    headerBg: 'bg-sky-700',
    totalText: 'text-sky-700',
    footerBg: '#f0f9ff',
  },
};

function fmt(n: number | undefined | null): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);
}

function fmtProm(n: number | undefined | null): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(n);
}

function getVal(fila: VolumenFila, mesId: string): number {
  const v = fila.valores[mesId];
  return typeof v === 'number' ? v : 0;
}

function hasVal(fila: VolumenFila, mesId: string): boolean {
  if (!(mesId in fila.valores)) return false;
  const v = fila.valores[mesId];
  return typeof v === 'number' && v > 0;
}

/**
 * Calcula el promedio de una fila usando solo los últimos `lastN` meses con valor > 0.
 * Si lastN = 0 → usa todos los meses con datos.
 */
function rowAverage(fila: VolumenFila, meses: ModuloColumna[], lastN: number): number | null {
  const withData = meses.filter(m => hasVal(fila, m.id));
  if (withData.length === 0) return null;
  const slice = lastN > 0 ? withData.slice(-lastN) : withData;
  if (slice.length === 0) return null;
  const sum = slice.reduce((s, m) => s + getVal(fila, m.id), 0);
  return sum / slice.length;
}

const COL_CLIENT_W = 160;
const COL_MES_W = 110;

export default function VolumenesBlockTable({ tipo, filas, meses, totalInOut }: VolumenesBlockTableProps) {
  const cfg = TIPO_CONFIG[tipo];

  // lastN persiste en localStorage para que formulaVariables.ts lo lea
  const { lastN, setLastN } = useVolumenesPromedioConfig(tipo);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  if (filas.length === 0) return null;

  // Totals per month
  const mesTotals: Record<string, number> = {};
  meses.forEach(m => {
    mesTotals[m.id] = filas.reduce((s, f) => s + getVal(f, m.id), 0);
  });

  // Footer average: only over months where at least one client has value > 0
  const mesesConDatos = meses.filter(m => filas.some(f => hasVal(f, m.id)));
  const slicedMeses = lastN > 0 ? mesesConDatos.slice(-lastN) : mesesConDatos;
  const grandTotal = slicedMeses.reduce((s, m) => s + mesTotals[m.id], 0);
  const grandAvg = slicedMeses.length > 0 ? grandTotal / slicedMeses.length : null;

  const minWidth = COL_CLIENT_W + meses.length * COL_MES_W + COL_MES_W + 40;

  // Opciones del selector: todos + 1..N meses disponibles
  const maxMeses = mesesConDatos.length;
  const options: { value: number; label: string }[] = [
    { value: 0, label: 'Todos los meses' },
    ...Array.from({ length: maxMeses }, (_, i) => ({
      value: i + 1,
      label: `Últimos ${i + 1} ${i + 1 === 1 ? 'mes' : 'meses'}`,
    })),
  ];

  const selectedLabel = lastN === 0
    ? 'Todos'
    : `Últ. ${lastN} ${lastN === 1 ? 'mes' : 'meses'}`;

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      {/* Section header */}
      <div className={`px-5 py-3.5 flex items-center gap-3 rounded-t-xl ${cfg.headerBg}`}>
        <div className="w-6 h-6 flex items-center justify-center">
          <i className={`${cfg.icon} text-base text-white`} />
        </div>
        <span className="text-xs font-bold text-white tracking-wider">{cfg.label}</span>
        <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white">
          {filas.length} {filas.length === 1 ? 'cliente' : 'clientes'} · {meses.length} meses
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table
          className="w-full text-sm"
          style={{ minWidth: `${minWidth}px`, borderCollapse: 'separate', borderSpacing: 0 }}
        >
          <thead>
            <tr className="bg-slate-50">
              {/* Cliente — sticky */}
              <th
                className="text-left px-4 py-3 border-b border-r border-slate-200"
                style={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 4,
                  backgroundColor: '#f8fafc',
                  width: COL_CLIENT_W,
                  minWidth: COL_CLIENT_W,
                  boxShadow: '2px 0 4px -1px rgba(0,0,0,0.08)',
                }}
              >
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cliente</span>
              </th>
              {/* Month columns */}
              {meses.map(m => (
                <th
                  key={m.id}
                  className="text-right px-3 py-3 border-b border-r border-slate-200"
                  style={{ width: COL_MES_W, minWidth: COL_MES_W }}
                >
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {monthIdToLabel(m.nombre)}
                  </span>
                </th>
              ))}
              {/* Promedio column header with selector */}
              <th
                className="text-right px-4 py-3 border-b border-slate-200"
                style={{ width: COL_MES_W + 60, minWidth: COL_MES_W + 60 }}
              >
                <div className="flex items-center justify-end gap-1.5">
                  <div className="w-4 h-4 flex items-center justify-center">
                    <i className="ri-line-chart-line text-violet-400 text-xs" />
                  </div>
                  <span className="text-xs font-semibold text-violet-500 uppercase tracking-wider">Promedio</span>
                  {/* Dropdown selector */}
                  <div className="relative ml-1">
                    <button
                      onClick={() => setDropdownOpen(v => !v)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-100 hover:bg-violet-200 text-violet-600 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {selectedLabel}
                      <div className="w-3 h-3 flex items-center justify-center">
                        <i className={dropdownOpen ? 'ri-arrow-up-s-line text-xs' : 'ri-arrow-down-s-line text-xs'} />
                      </div>
                    </button>
                    {dropdownOpen && (
                      <div
                        className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg overflow-hidden z-50"
                        style={{ minWidth: 160, boxShadow: '0 4px 16px rgba(0,0,0,0.10)' }}
                      >
                        <div className="px-3 py-2 border-b border-slate-100">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Calcular promedio con</p>
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          {options.map(opt => (
                            <button
                              key={opt.value}
                              onClick={() => { setLastN(opt.value); setDropdownOpen(false); }}
                              className={`w-full text-left px-3 py-2 text-xs transition-colors cursor-pointer whitespace-nowrap ${
                                lastN === opt.value
                                  ? 'bg-violet-50 text-violet-700 font-semibold'
                                  : 'text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {opt.value === lastN && (
                                <i className="ri-check-line mr-1.5 text-violet-500" />
                              )}
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila, idx) => {
              const isEven = idx % 2 === 0;
              const rowBg = isEven ? '#ffffff' : '#f8fafc';
              const avg = rowAverage(fila, meses, lastN);
              return (
                <tr key={fila.id}>
                  {/* Cliente — sticky */}
                  <td
                    className="px-4 py-2.5 border-b border-r border-slate-100"
                    style={{
                      position: 'sticky',
                      left: 0,
                      zIndex: 3,
                      backgroundColor: rowBg,
                      boxShadow: '2px 0 4px -1px rgba(0,0,0,0.06)',
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 flex-shrink-0">
                        <i className="ri-building-2-line text-xs text-slate-500" />
                      </div>
                      <span className="text-sm font-medium text-slate-700">{fila.subproceso}</span>
                    </div>
                  </td>
                  {/* Month values */}
                  {meses.map(m => (
                    <td
                      key={m.id}
                      className="px-3 py-2.5 text-right border-b border-r border-slate-100"
                      style={{ backgroundColor: rowBg }}
                    >
                      {hasVal(fila, m.id)
                        ? <span className="text-sm text-slate-600 tabular-nums">{fmt(getVal(fila, m.id))}</span>
                        : <span className="text-sm text-slate-300">—</span>
                      }
                    </td>
                  ))}
                  {/* Row promedio */}
                  <td
                    className="px-4 py-2.5 text-right border-b border-slate-100"
                    style={{ backgroundColor: rowBg }}
                  >
                    {avg !== null
                      ? <span className="text-sm font-semibold text-violet-600 tabular-nums">{fmtProm(avg)}</span>
                      : <span className="text-sm text-slate-300">—</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            {/* Block footer row */}
            <tr>
              <td
                className="px-4 py-3 border-t-2 border-r border-slate-200"
                style={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 3,
                  backgroundColor: cfg.footerBg,
                  boxShadow: '2px 0 4px -1px rgba(0,0,0,0.06)',
                }}
              >
                <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Total mes</span>
              </td>
              {meses.map(m => (
                <td
                  key={m.id}
                  className="px-3 py-3 text-right border-t-2 border-r border-slate-200"
                  style={{ backgroundColor: cfg.footerBg }}
                >
                  <span className={`text-sm font-bold ${cfg.totalText} tabular-nums`}>{fmt(mesTotals[m.id])}</span>
                </td>
              ))}
              {/* Promedio global en footer */}
              <td
                className="px-4 py-3 text-right border-t-2 border-slate-200"
                style={{ backgroundColor: cfg.footerBg }}
              >
                {grandAvg !== null
                  ? (
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-sm font-bold text-violet-600 tabular-nums">{fmtProm(grandAvg)}</span>
                      {lastN > 0 && (
                        <span className="text-xs text-violet-400">últ. {lastN} {lastN === 1 ? 'mes' : 'meses'}</span>
                      )}
                    </div>
                  )
                  : <span className="text-sm text-slate-300">—</span>
                }
              </td>
            </tr>

            {/* Total in/out row */}
            {totalInOut && tipo === 'despachado' && (
              <tr>
                <td
                  className="px-4 py-3 border-t border-r border-slate-300"
                  style={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 3,
                    backgroundColor: '#fef9c3',
                    boxShadow: '2px 0 4px -1px rgba(0,0,0,0.06)',
                  }}
                >
                  <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Total in/out</span>
                </td>
                {meses.map(m => (
                  <td
                    key={m.id}
                    className="px-3 py-3 text-right border-t border-r border-slate-300"
                    style={{ backgroundColor: '#fef9c3' }}
                  >
                    <span className="text-sm font-bold text-amber-700 tabular-nums">{fmt(getVal(totalInOut, m.id))}</span>
                  </td>
                ))}
                <td
                  className="px-4 py-3 text-right border-t border-slate-300"
                  style={{ backgroundColor: '#fef9c3' }}
                >
                  {(() => {
                    const tiAvg = rowAverage(totalInOut, meses, lastN);
                    return tiAvg !== null
                      ? <span className="text-sm font-bold text-amber-700 tabular-nums">{fmtProm(tiAvg)}</span>
                      : <span className="text-sm text-slate-300">—</span>;
                  })()}
                </td>
              </tr>
            )}
          </tfoot>
        </table>
      </div>
    </div>
  );
}
