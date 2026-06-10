import type { InversionCalculated } from '../../../types/inversion';
import { fmtCurrency, esFinanciamiento } from '../../../types/inversion';

interface InversionSummaryProps {
  data: InversionCalculated[];
}

interface SummaryCardProps {
  icon: string;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  sub?: string;
  subColor?: string;
}

function SummaryCard({ icon, iconBg, iconColor, label, value, sub, subColor }: SummaryCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide leading-tight">{label}</p>
        <div className={`w-9 h-9 flex items-center justify-center rounded-lg flex-shrink-0 ml-2 ${iconBg}`}>
          <i className={`${icon} text-base ${iconColor}`} />
        </div>
      </div>
      <p className="text-xl font-bold text-slate-800 leading-tight">{value}</p>
      {sub && <p className={`text-xs mt-1 font-medium ${subColor ?? 'text-slate-400'}`}>{sub}</p>}
    </div>
  );
}

function SectionLabel({ icon, label, count }: { icon: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-5 h-5 flex items-center justify-center">
        <i className={`${icon} text-slate-400 text-sm`} />
      </div>
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
      <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-2 py-0.5 font-medium">{count}</span>
    </div>
  );
}

export default function InversionSummary({ data }: InversionSummaryProps) {
  const inversionData = data.filter((d) => !esFinanciamiento(d.tipo));
  const financData = data.filter((d) => esFinanciamiento(d.tipo));

  const hasInversion = inversionData.length > 0;
  const hasFinanc = financData.length > 0;

  // Activos / Inversión stats
  const totalInicial = data.reduce((s, d) => s + d.valor_inicial, 0);
  const totalFuturo = inversionData.reduce((s, d) => s + d.valor_futuro, 0);
  const totalDepreciacion = inversionData.reduce((s, d) => s + d.depreciacion_acumulada, 0);
  const totalNetoInv = inversionData.reduce((s, d) => s + d.valor_neto, 0);
  const gananciaNeta = totalNetoInv - inversionData.reduce((s, d) => s + d.valor_inicial, 0);

  // Financiamiento stats
  const principalFinanc = financData.reduce((s, d) => s + d.valor_inicial, 0);
  const totalCuotaMensual = financData.reduce((s, d) => s + d.cuota_mensual, 0);
  const totalPagado = financData.reduce((s, d) => s + d.total_pagado, 0);
  const totalInteres = financData.reduce((s, d) => s + d.interes_total, 0);

  if (data.length === 0) {
    return (
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { icon: 'ri-funds-line', label: 'Capital inicial', value: '$0.00', iconBg: 'bg-slate-100', iconColor: 'text-slate-400' },
          { icon: 'ri-line-chart-line', label: 'Valor futuro', value: '$0.00', iconBg: 'bg-emerald-50', iconColor: 'text-emerald-400' },
          { icon: 'ri-arrow-down-line', label: 'Depreciación', value: '$0.00', iconBg: 'bg-rose-50', iconColor: 'text-rose-400' },
          { icon: 'ri-bank-line', label: 'Cuotas mensuales', value: '$0.00', iconBg: 'bg-teal-50', iconColor: 'text-teal-400' },
        ].map((c) => (
          <SummaryCard
            key={c.label}
            icon={c.icon}
            iconBg={c.iconBg}
            iconColor={c.iconColor}
            label={c.label}
            value={c.value}
          />
        ))}
      </div>
    );
  }

  // Only financing records
  if (!hasInversion && hasFinanc) {
    return (
      <div className="mb-6">
        <SectionLabel icon="ri-bank-line" label="Financiamiento" count={financData.length} />
        <div className="grid grid-cols-4 gap-4">
          <SummaryCard
            icon="ri-funds-line"
            iconBg="bg-slate-100"
            iconColor="text-slate-600"
            label="Capital financiado"
            value={`$${fmtCurrency(principalFinanc)}`}
            sub={`${financData.length} préstamo${financData.length !== 1 ? 's' : ''} / alquiler${financData.length !== 1 ? 'es' : ''}`}
          />
          <SummaryCard
            icon="ri-calendar-line"
            iconBg="bg-teal-50"
            iconColor="text-teal-600"
            label="Cuota mensual total"
            value={`$${fmtCurrency(totalCuotaMensual)}`}
            sub="suma de cuotas PMT"
            subColor="text-teal-600"
          />
          <SummaryCard
            icon="ri-money-dollar-circle-line"
            iconBg="bg-amber-50"
            iconColor="text-amber-600"
            label="Interés total pagado"
            value={`$${fmtCurrency(totalInteres)}`}
            sub={principalFinanc > 0 ? `${((totalInteres / principalFinanc) * 100).toFixed(2)}% del principal` : undefined}
            subColor="text-amber-600"
          />
          <SummaryCard
            icon="ri-receipt-line"
            iconBg="bg-slate-100"
            iconColor="text-slate-600"
            label="Total pagado (plazo)"
            value={`$${fmtCurrency(totalPagado)}`}
            sub={principalFinanc > 0 ? `×${(totalPagado / principalFinanc).toFixed(2)} del principal` : undefined}
            subColor="text-slate-500"
          />
        </div>
      </div>
    );
  }

  // Only activos/inversiones
  if (hasInversion && !hasFinanc) {
    return (
      <div className="mb-6">
        <SectionLabel icon="ri-line-chart-line" label="Activos e Inversiones" count={inversionData.length} />
        <div className="grid grid-cols-4 gap-4">
          <SummaryCard
            icon="ri-funds-line"
            iconBg="bg-slate-100"
            iconColor="text-slate-600"
            label="Capital inicial total"
            value={`$${fmtCurrency(totalInicial)}`}
            sub={`${data.length} registro${data.length !== 1 ? 's' : ''}`}
          />
          <SummaryCard
            icon="ri-line-chart-line"
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
            label="Valor futuro proyectado"
            value={`$${fmtCurrency(totalFuturo)}`}
            sub={totalInicial > 0 ? `×${(totalFuturo / totalInicial).toFixed(2)} del capital` : undefined}
            subColor="text-emerald-600"
          />
          <SummaryCard
            icon="ri-arrow-down-line"
            iconBg="bg-rose-50"
            iconColor="text-rose-500"
            label="Depreciación acumulada"
            value={`$${fmtCurrency(totalDepreciacion)}`}
            sub={totalInicial > 0 ? `${((totalDepreciacion / totalInicial) * 100).toFixed(2)}% del capital` : undefined}
            subColor="text-rose-500"
          />
          <SummaryCard
            icon={gananciaNeta >= 0 ? 'ri-trophy-line' : 'ri-arrow-down-circle-line'}
            iconBg={gananciaNeta >= 0 ? 'bg-emerald-50' : 'bg-amber-50'}
            iconColor={gananciaNeta >= 0 ? 'text-emerald-600' : 'text-amber-500'}
            label="Valor neto total"
            value={`$${fmtCurrency(totalNetoInv)}`}
            sub={`${gananciaNeta >= 0 ? '+' : ''}$${fmtCurrency(gananciaNeta)} vs capital`}
            subColor={gananciaNeta >= 0 ? 'text-emerald-600' : 'text-rose-500'}
          />
        </div>
      </div>
    );
  }

  // Mixed — show both sections
  return (
    <div className="mb-6 space-y-4">
      {/* Activos / Inversiones */}
      <div>
        <SectionLabel icon="ri-line-chart-line" label="Activos e Inversiones" count={inversionData.length} />
        <div className="grid grid-cols-4 gap-4">
          <SummaryCard
            icon="ri-funds-line"
            iconBg="bg-slate-100"
            iconColor="text-slate-600"
            label="Capital invertido"
            value={`$${fmtCurrency(inversionData.reduce((s, d) => s + d.valor_inicial, 0))}`}
            sub={`${inversionData.length} registro${inversionData.length !== 1 ? 's' : ''}`}
          />
          <SummaryCard
            icon="ri-line-chart-line"
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
            label="Valor futuro proyectado"
            value={`$${fmtCurrency(totalFuturo)}`}
            sub={inversionData.reduce((s, d) => s + d.valor_inicial, 0) > 0
              ? `×${(totalFuturo / inversionData.reduce((s, d) => s + d.valor_inicial, 0)).toFixed(2)} del capital`
              : undefined}
            subColor="text-emerald-600"
          />
          <SummaryCard
            icon="ri-arrow-down-line"
            iconBg="bg-rose-50"
            iconColor="text-rose-500"
            label="Depreciación acumulada"
            value={`$${fmtCurrency(totalDepreciacion)}`}
            sub={inversionData.reduce((s, d) => s + d.valor_inicial, 0) > 0
              ? `${((totalDepreciacion / inversionData.reduce((s, d) => s + d.valor_inicial, 0)) * 100).toFixed(2)}% del capital`
              : undefined}
            subColor="text-rose-500"
          />
          <SummaryCard
            icon={gananciaNeta >= 0 ? 'ri-trophy-line' : 'ri-arrow-down-circle-line'}
            iconBg={gananciaNeta >= 0 ? 'bg-emerald-50' : 'bg-amber-50'}
            iconColor={gananciaNeta >= 0 ? 'text-emerald-600' : 'text-amber-500'}
            label="Valor neto total"
            value={`$${fmtCurrency(totalNetoInv)}`}
            sub={`${gananciaNeta >= 0 ? '+' : ''}$${fmtCurrency(gananciaNeta)} vs capital`}
            subColor={gananciaNeta >= 0 ? 'text-emerald-600' : 'text-rose-500'}
          />
        </div>
      </div>

      {/* Financiamiento */}
      <div>
        <SectionLabel icon="ri-bank-line" label="Préstamos y Alquileres" count={financData.length} />
        <div className="grid grid-cols-4 gap-4">
          <SummaryCard
            icon="ri-funds-line"
            iconBg="bg-slate-100"
            iconColor="text-slate-600"
            label="Capital financiado"
            value={`$${fmtCurrency(principalFinanc)}`}
            sub={`${financData.length} registro${financData.length !== 1 ? 's' : ''}`}
          />
          <SummaryCard
            icon="ri-calendar-line"
            iconBg="bg-teal-50"
            iconColor="text-teal-600"
            label="Cuota mensual total"
            value={`$${fmtCurrency(totalCuotaMensual)}`}
            sub="suma de cuotas PMT"
            subColor="text-teal-600"
          />
          <SummaryCard
            icon="ri-money-dollar-circle-line"
            iconBg="bg-amber-50"
            iconColor="text-amber-600"
            label="Interés total pagado"
            value={`$${fmtCurrency(totalInteres)}`}
            sub={principalFinanc > 0 ? `${((totalInteres / principalFinanc) * 100).toFixed(2)}% del principal` : undefined}
            subColor="text-amber-600"
          />
          <SummaryCard
            icon="ri-receipt-line"
            iconBg="bg-slate-100"
            iconColor="text-slate-600"
            label="Total pagado (plazo)"
            value={`$${fmtCurrency(totalPagado)}`}
            sub={principalFinanc > 0 ? `×${(totalPagado / principalFinanc).toFixed(2)} del principal` : undefined}
            subColor="text-slate-500"
          />
        </div>
      </div>
    </div>
  );
}
