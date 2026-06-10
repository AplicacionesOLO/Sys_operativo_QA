import { useCallback } from 'react';
import type {
  InversionCalculated,
  InversionRecord,
  MetodoDepreciacion,
  UnidadRango,
} from '../../../types/inversion';
import { TIPOS_INVERSION, esFinanciamiento, fmtCurrency } from '../../../types/inversion';

interface InversionRowProps {
  row: InversionCalculated;
  index: number;
  isSaving: boolean;
  onUpdate: (id: string, changes: Partial<InversionRecord>) => void;
  onDelete: (id: string) => void;
}

const inputBase =
  'w-full bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded px-2 py-1 text-sm text-slate-800 text-right tabular-nums placeholder-slate-300';

const inputText =
  'w-full bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded px-2 py-1 text-sm text-slate-800 placeholder-slate-300';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function CalcCell({
  value,
  prefix = '$',
  colorClass = 'text-slate-700',
  bgClass = 'bg-slate-50',
  subNote,
}: {
  value: number;
  prefix?: string;
  colorClass?: string;
  bgClass?: string;
  subNote?: string;
}) {
  return (
    <td className="px-3 py-0 border-r border-slate-100">
      <div className={`${bgClass} rounded px-2 py-1 text-right`}>
        <span className={`text-xs font-semibold tabular-nums ${colorClass}`}>
          {prefix}{fmtCurrency(value)}
        </span>
        {subNote && (
          <div className="text-xs text-slate-400 font-normal mt-0.5">{subNote}</div>
        )}
      </div>
    </td>
  );
}

function NACell() {
  return (
    <td className="px-3 py-0 border-r border-slate-100">
      <div className="bg-slate-50/50 rounded px-2 py-1 text-right border border-dashed border-slate-200">
        <span className="text-xs text-slate-300 italic">N/A</span>
      </div>
    </td>
  );
}

function ZeroCell({ label }: { label?: string }) {
  return (
    <td className="px-3 py-0 border-r border-slate-100">
      <div className="bg-slate-50/50 rounded px-2 py-1 text-right">
        <span className="text-xs font-semibold tabular-nums text-slate-300">$0.00</span>
        {label && <div className="text-xs text-slate-300 font-normal mt-0.5 italic">{label}</div>}
      </div>
    </td>
  );
}

// ─── Tipo badge ───────────────────────────────────────────────────────────────
function TipoBadge({ tipo }: { tipo: string }) {
  if (tipo === 'Préstamo') {
    return (
      <div className="flex items-center gap-1 mt-0.5">
        <div className="w-3.5 h-3.5 flex items-center justify-center">
          <i className="ri-bank-line text-teal-600 text-xs" />
        </div>
        <span className="text-xs text-teal-600 font-medium">PMT</span>
      </div>
    );
  }
  if (tipo === 'Alquiler') {
    return (
      <div className="flex items-center gap-1 mt-0.5">
        <div className="w-3.5 h-3.5 flex items-center justify-center">
          <i className="ri-home-line text-teal-600 text-xs" />
        </div>
        <span className="text-xs text-teal-600 font-medium">PMT</span>
      </div>
    );
  }
  return null;
}

// ─── Main Row ─────────────────────────────────────────────────────────────────
export default function InversionRow({
  row,
  index,
  isSaving,
  onUpdate,
  onDelete,
}: InversionRowProps) {
  const handleChange = useCallback(
    (field: keyof InversionRecord, value: string | number) => {
      onUpdate(row.id, { [field]: value } as Partial<InversionRecord>);
    },
    [row.id, onUpdate],
  );

  const handleNumberChange = useCallback(
    (field: keyof InversionRecord, raw: string) => {
      const parsed = parseFloat(raw);
      onUpdate(row.id, { [field]: isNaN(parsed) ? 0 : parsed } as Partial<InversionRecord>);
    },
    [row.id, onUpdate],
  );

  const isFinanc = esFinanciamiento(row.tipo);
  const esTiempo = row.metodo_depreciacion === 'tiempo';
  const unidadLabel = row.unidad_rango === 'meses' ? 'mes' : 'año';

  return (
    <tr
      className={`border-b border-slate-100 transition-colors group ${
        isFinanc ? 'hover:bg-teal-50/20' : 'hover:bg-emerald-50/20'
      }`}
    >
      {/* # */}
      <td className="px-3 py-2 text-center border-r border-slate-100 w-10">
        {isSaving ? (
          <div className="w-4 h-4 flex items-center justify-center mx-auto">
            <div className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <span className="text-xs text-slate-400 font-medium">{index + 1}</span>
        )}
      </td>

      {/* Nombre */}
      <td className="px-1 py-1 border-r border-slate-100 min-w-[150px]">
        <input
          type="text"
          value={row.nombre}
          onChange={(e) => handleChange('nombre', e.target.value)}
          placeholder="Nombre del activo"
          className={inputText}
        />
        <TipoBadge tipo={row.tipo} />
      </td>

      {/* Tipo — ancho fijo para que no se corte */}
      <td className="px-1 py-1 border-r border-slate-100 w-48">
        <select
          value={row.tipo}
          onChange={(e) => handleChange('tipo', e.target.value)}
          className={`w-full bg-transparent border border-slate-200 hover:border-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded-md px-2 py-1.5 text-xs cursor-pointer transition-colors
            ${isFinanc ? 'text-teal-700 font-semibold bg-teal-50/40' : 'text-slate-700'}`}
        >
          {TIPOS_INVERSION.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </td>

      {/* Valor Inicial / Principal */}
      <td className="px-1 py-1 border-r border-slate-100 w-28">
        <div className="flex items-center">
          <span className="text-xs text-slate-400 pl-1">$</span>
          <input
            type="number"
            value={row.valor_inicial || ''}
            min={0}
            step={1000}
            onChange={(e) => handleNumberChange('valor_inicial', e.target.value)}
            placeholder="0"
            className={inputBase}
          />
        </div>
      </td>

      {/* Tasa Interés */}
      <td className="px-1 py-1 border-r border-slate-100 w-24">
        <div className="flex items-center">
          <input
            type="number"
            value={row.tasa_interes || ''}
            min={0}
            max={999}
            step={0.01}
            onChange={(e) => handleNumberChange('tasa_interes', e.target.value)}
            placeholder="0"
            className={inputBase}
          />
          <span className="text-xs text-slate-400 pr-1">%</span>
        </div>
        {isFinanc && (
          <div className="text-xs text-teal-500 text-center mt-0.5">anual</div>
        )}
      </td>

      {/* Deprec. / Método — N/A para financiamiento */}
      {isFinanc ? (
        <td className="px-2 py-1 border-r border-slate-100 w-44">
          <div className="flex items-center justify-center h-full">
            <span className="text-xs text-slate-300 italic bg-slate-50 rounded px-3 py-1.5 border border-dashed border-slate-200">
              N/A
            </span>
          </div>
        </td>
      ) : (
        <td className="px-2 py-1 border-r border-slate-100 w-44">
          <div className="flex flex-col gap-1">
            <div className="flex rounded-md overflow-hidden border border-slate-200 text-xs h-6 w-full">
              <button
                onClick={() =>
                  handleChange('metodo_depreciacion', 'tiempo' as MetodoDepreciacion)
                }
                className={`flex-1 flex items-center justify-center gap-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap
                  ${esTiempo ? 'bg-amber-500 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                <div className="w-3 h-3 flex items-center justify-center">
                  <i className="ri-time-line text-xs" />
                </div>
                Tiempo
              </button>
              <button
                onClick={() =>
                  handleChange('metodo_depreciacion', 'porcentaje' as MetodoDepreciacion)
                }
                className={`flex-1 flex items-center justify-center gap-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap border-l border-slate-200
                  ${!esTiempo ? 'bg-rose-500 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
              >
                <div className="w-3 h-3 flex items-center justify-center">
                  <i className="ri-percent-line text-xs" />
                </div>
                Tasa %
              </button>
            </div>
            {esTiempo ? (
              <div className="flex items-center justify-center py-0.5">
                <span className="text-xs text-slate-400 italic">
                  {row.rango > 0 && row.valor_inicial > 0
                    ? `$${fmtCurrency(row.valor_inicial / row.rango)}/${unidadLabel}`
                    : 'VI ÷ rango'}
                </span>
              </div>
            ) : (
              <div className="flex items-center">
                <input
                  type="number"
                  value={row.tasa_depreciacion || ''}
                  min={0}
                  max={100}
                  step={0.01}
                  onChange={(e) => handleNumberChange('tasa_depreciacion', e.target.value)}
                  placeholder="0"
                  className={inputBase}
                />
                <span className="text-xs text-slate-400 pr-1">%</span>
              </div>
            )}
          </div>
        </td>
      )}

      {/* Rango / Plazo */}
      <td className="px-1 py-1 border-r border-slate-100 w-32">
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={row.rango || ''}
            min={0}
            step={1}
            onChange={(e) => handleNumberChange('rango', e.target.value)}
            placeholder="1"
            className="w-12 bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded px-1 py-1 text-sm text-slate-800 text-right tabular-nums"
          />
          <select
            value={row.unidad_rango}
            onChange={(e) => handleChange('unidad_rango', e.target.value as UnidadRango)}
            className="flex-1 bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-emerald-400 rounded px-1 py-1 text-xs text-slate-600 cursor-pointer"
          >
            <option value="meses">meses</option>
            <option value="años">años</option>
          </select>
        </div>
      </td>

      {/* Col: Valor Futuro (activos) / N/A (financiamiento) */}
      {isFinanc ? (
        <NACell />
      ) : (
        <CalcCell
          value={row.valor_futuro}
          colorClass="text-emerald-700"
          bgClass="bg-emerald-50/60"
        />
      )}

      {/* Col: Depreciación — valor monetario siempre; 0 para financiamiento */}
      {isFinanc ? (
        <ZeroCell label="no aplica" />
      ) : (
        <CalcCell
          value={row.depreciacion_por_periodo}
          colorClass="text-rose-600"
          bgClass="bg-rose-50/60"
          subNote={
            row.rango > 0 && row.valor_inicial > 0
              ? `Acum: $${fmtCurrency(row.depreciacion_acumulada)}`
              : undefined
          }
        />
      )}

      {/* Col: Pago Mensual — cuota PMT para financiamiento; 0 para activos */}
      {isFinanc ? (
        <td className="px-3 py-0 border-r border-slate-100">
          <div className="bg-teal-50 rounded px-2 py-1 text-right">
            <span className="text-xs font-semibold tabular-nums text-teal-700">
              ${fmtCurrency(row.cuota_mensual)}
            </span>
            <div className="text-xs text-teal-500 font-normal mt-0.5">
              /mes · {row.periodos_meses} meses
            </div>
          </div>
        </td>
      ) : (
        <ZeroCell label="no aplica" />
      )}

      {/* Col: Valor Neto (activos) / Total pagado (financiamiento) */}
      {isFinanc ? (
        <td className="px-3 py-0 border-r border-slate-100 w-32">
          <div className="bg-slate-50 rounded px-2 py-1 text-right">
            <span className="text-xs font-bold tabular-nums text-slate-700">
              ${fmtCurrency(row.total_pagado)}
            </span>
            <div className="text-xs text-amber-600 font-medium tabular-nums mt-0.5">
              +${fmtCurrency(row.interes_total)} interés
            </div>
          </div>
        </td>
      ) : (
        <td className="px-3 py-0 border-r border-slate-100 w-32">
          <div
            className={`rounded px-2 py-1 text-right ${
              row.ganancia_neta >= 0 ? 'bg-emerald-50' : 'bg-rose-50'
            }`}
          >
            <span
              className={`text-xs font-bold tabular-nums ${
                row.ganancia_neta >= 0 ? 'text-emerald-700' : 'text-rose-600'
              }`}
            >
              ${fmtCurrency(row.valor_neto)}
            </span>
            <div
              className={`text-xs font-medium tabular-nums ${
                row.ganancia_neta >= 0 ? 'text-emerald-500' : 'text-rose-400'
              }`}
            >
              {row.ganancia_neta >= 0 ? '+' : ''}${fmtCurrency(row.ganancia_neta)}
            </div>
          </div>
        </td>
      )}

      {/* Delete */}
      <td className="px-2 py-2 text-center w-10">
        <button
          onClick={() => onDelete(row.id)}
          className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-all cursor-pointer"
        >
          <i className="ri-delete-bin-line text-sm" />
        </button>
      </td>
    </tr>
  );
}
