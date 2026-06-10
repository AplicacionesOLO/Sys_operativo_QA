import type { InversionCalculated, InversionRecord } from '../../../types/inversion';
import { fmtCurrency, esFinanciamiento } from '../../../types/inversion';
import InversionRow from './InversionRow';

interface InversionTableProps {
  data: InversionCalculated[];
  saving: Set<string>;
  onAdd: () => void;
  onUpdate: (id: string, changes: Partial<InversionRecord>) => void;
  onDelete: (id: string) => void;
}

const TH = ({
  children,
  align = 'right',
  hint,
  colorClass = 'text-slate-500',
  bgClass = '',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  hint?: string;
  colorClass?: string;
  bgClass?: string;
}) => (
  <th
    className={`px-3 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap border-r border-slate-200 text-${align} ${colorClass} ${bgClass}`}
  >
    {children}
    {hint && (
      <span className="block font-normal normal-case tracking-normal text-slate-400">
        {hint}
      </span>
    )}
  </th>
);

export default function InversionTable({
  data,
  saving,
  onAdd,
  onUpdate,
  onDelete,
}: InversionTableProps) {
  const inversionData = data.filter((d) => !esFinanciamiento(d.tipo));
  const financData = data.filter((d) => esFinanciamiento(d.tipo));

  const totalInicial = data.reduce((s, d) => s + d.valor_inicial, 0);
  const totalFuturoInv = inversionData.reduce((s, d) => s + d.valor_futuro, 0);
  const totalDepreciacion = inversionData.reduce((s, d) => s + d.depreciacion_acumulada, 0);
  const totalNetoInv = inversionData.reduce((s, d) => s + d.valor_neto, 0);
  const totalCuota = financData.reduce((s, d) => s + d.cuota_mensual, 0);
  const totalPagadoFinanc = financData.reduce((s, d) => s + d.total_pagado, 0);
  const totalInteresFinanc = financData.reduce((s, d) => s + d.interes_total, 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
        <div>
          <p className="text-sm font-semibold text-slate-800">Registros de Inversión</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Activos/Inversiones: interés compuesto + depreciación ·
            Préstamos/Alquileres: cuota mensual PMT
          </p>
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
        >
          <div className="w-4 h-4 flex items-center justify-center">
            <i className="ri-add-line text-base" />
          </div>
          Agregar registro
        </button>
      </div>

      {data.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-16 h-16 flex items-center justify-center rounded-full bg-slate-100 mb-4">
            <i className="ri-funds-line text-slate-400 text-3xl" />
          </div>
          <p className="text-sm font-semibold text-slate-600 mb-1">Sin registros aún</p>
          <p className="text-xs text-slate-400 mb-6 text-center max-w-xs">
            Agrega activos, inversiones, préstamos o alquileres para calcular proyecciones automáticas.
          </p>
          <button
            onClick={onAdd}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap"
          >
            <div className="w-4 h-4 flex items-center justify-center">
              <i className="ri-add-line" />
            </div>
            Agregar primer registro
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: 1300 }}>
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {/* Fixed cols */}
                <th className="px-3 py-3 w-10 border-r border-slate-200" />
                <TH align="left">Nombre</TH>
                {/* Tipo — más ancho para que nunca se corte */}
                <th className="px-3 py-3 w-48 text-xs font-semibold text-slate-500 uppercase tracking-wide border-r border-slate-200 text-left">
                  Tipo
                </th>
                <TH align="right">Valor inicial</TH>
                <TH align="right" hint="anual %">
                  Tasa interés
                </TH>
                <TH align="center">Deprec. / Método</TH>
                <TH align="center">Rango / Plazo</TH>

                {/* Calculated — Valor Futuro */}
                <th className="px-3 py-3 text-xs font-semibold text-emerald-700 uppercase tracking-wide whitespace-nowrap border-r border-slate-200 text-right bg-emerald-50/50">
                  Valor Futuro
                  <span className="block font-normal normal-case tracking-normal text-slate-400">
                    activos / inversiones
                  </span>
                </th>

                {/* Calculated — Depreciación (solo valor monetario) */}
                <th className="px-3 py-3 text-xs font-semibold text-rose-600 uppercase tracking-wide whitespace-nowrap border-r border-slate-200 text-right bg-rose-50/50">
                  Depreciación
                  <span className="block font-normal normal-case tracking-normal text-slate-400">
                    valor monetario
                  </span>
                </th>

                {/* NEW — Pago Mensual */}
                <th className="px-3 py-3 text-xs font-semibold text-teal-700 uppercase tracking-wide whitespace-nowrap border-r border-slate-200 text-right bg-teal-50/50">
                  Pago Mensual
                  <span className="block font-normal normal-case tracking-normal text-slate-400">
                    cuota PMT
                  </span>
                </th>

                {/* Calculated — Valor Neto / Total Pagado */}
                <th className="px-3 py-3 text-xs font-semibold text-slate-700 uppercase tracking-wide whitespace-nowrap border-r border-slate-200 text-right bg-slate-50">
                  Valor Neto
                  <span className="block font-normal normal-case tracking-normal text-slate-400">
                    / total pagado
                  </span>
                </th>
                <th className="w-10 border-r border-slate-200" />
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => (
                <InversionRow
                  key={row.id}
                  row={row}
                  index={idx}
                  isSaving={saving.has(row.id)}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                />
              ))}
            </tbody>
            <tfoot>
              {/* Totals — Activos/Inversiones */}
              {inversionData.length > 0 && (
                <tr className="bg-emerald-50/30 border-t border-slate-200">
                  <td colSpan={3} className="px-5 py-2.5 text-xs font-semibold text-emerald-700">
                    <div className="w-3.5 h-3.5 inline-flex items-center justify-center mr-1">
                      <i className="ri-line-chart-line text-xs" />
                    </div>
                    Activos/Inversiones · {inversionData.length} registro{inversionData.length !== 1 ? 's' : ''}
                  </td>
                  <td className="px-3 py-2.5 text-right border-r border-slate-200">
                    <span className="text-xs font-bold text-slate-700 tabular-nums">
                      ${fmtCurrency(inversionData.reduce((s, d) => s + d.valor_inicial, 0))}
                    </span>
                  </td>
                  <td colSpan={3} className="border-r border-slate-200" />
                  <td className="px-3 py-2.5 text-right border-r border-slate-200 bg-emerald-50/60">
                    <span className="text-xs font-bold text-emerald-700 tabular-nums">
                      ${fmtCurrency(totalFuturoInv)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right border-r border-slate-200 bg-rose-50/40">
                    <span className="text-xs font-bold text-rose-600 tabular-nums">
                      ${fmtCurrency(totalDepreciacion)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right border-r border-slate-200 text-slate-300 text-xs italic">
                    —
                  </td>
                  <td className="px-3 py-2.5 text-right border-r border-slate-200">
                    <span className="text-xs font-bold text-slate-800 tabular-nums">
                      ${fmtCurrency(totalNetoInv)}
                    </span>
                  </td>
                  <td />
                </tr>
              )}

              {/* Totals — Financiamiento */}
              {financData.length > 0 && (
                <tr className="bg-teal-50/30 border-t border-slate-200">
                  <td colSpan={3} className="px-5 py-2.5 text-xs font-semibold text-teal-700">
                    <div className="w-3.5 h-3.5 inline-flex items-center justify-center mr-1">
                      <i className="ri-bank-line text-xs" />
                    </div>
                    Financiamiento · {financData.length} registro{financData.length !== 1 ? 's' : ''}
                  </td>
                  <td className="px-3 py-2.5 text-right border-r border-slate-200">
                    <span className="text-xs font-bold text-slate-700 tabular-nums">
                      ${fmtCurrency(financData.reduce((s, d) => s + d.valor_inicial, 0))}
                    </span>
                  </td>
                  <td colSpan={3} className="border-r border-slate-200" />
                  <td className="px-3 py-2.5 text-right border-r border-slate-200 text-slate-300 text-xs italic">
                    —
                  </td>
                  <td className="px-3 py-2.5 text-right border-r border-slate-200 text-slate-300 text-xs italic">
                    $0.00
                  </td>
                  <td className="px-3 py-2.5 text-right border-r border-slate-200 bg-teal-50/60">
                    <span className="text-xs font-bold text-teal-700 tabular-nums">
                      ${fmtCurrency(totalCuota)}/mes
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right border-r border-slate-200">
                    <span className="text-xs font-bold text-slate-800 tabular-nums">
                      ${fmtCurrency(totalPagadoFinanc)}
                    </span>
                    <div className="text-xs text-amber-600 font-medium tabular-nums mt-0.5">
                      +${fmtCurrency(totalInteresFinanc)} interés
                    </div>
                  </td>
                  <td />
                </tr>
              )}

              {/* Grand total */}
              <tr className="bg-slate-50 border-t-2 border-slate-300">
                <td colSpan={3} className="px-5 py-3 text-xs font-semibold text-slate-600">
                  Total general · {data.length} registro{data.length !== 1 ? 's' : ''}
                </td>
                <td className="px-3 py-3 text-right border-r border-slate-200">
                  <span className="text-xs font-bold text-slate-800 tabular-nums">
                    ${fmtCurrency(totalInicial)}
                  </span>
                </td>
                <td colSpan={7} />
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
