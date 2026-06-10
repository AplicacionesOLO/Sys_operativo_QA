export type UnidadRango = 'meses' | 'años';
export type MetodoDepreciacion = 'tiempo' | 'porcentaje';

export const TIPOS_INVERSION = [
  'Activo Fijo',
  'Inversión Financiera',
  'Capital de Trabajo',
  'Equipo',
  'Bienes Raíces',
  'Préstamo',
  'Alquiler',
  'Otro',
] as const;

export type TipoInversion = typeof TIPOS_INVERSION[number];

/** Returns true when the record type uses PMT / amortization logic */
export function esFinanciamiento(tipo: string): boolean {
  return tipo === 'Préstamo' || tipo === 'Alquiler';
}

export interface InversionRecord {
  id: string;
  nombre: string;
  tipo: string;
  valor_inicial: number;
  tasa_interes: number;
  tasa_depreciacion: number;
  rango: number;
  unidad_rango: UnidadRango;
  metodo_depreciacion: MetodoDepreciacion;
  created_at?: string;
}

export interface InversionCalculated extends InversionRecord {
  // Shared
  valor_futuro: number;   // FV for activo/inversión | cuota_mensual for financiamiento
  valor_neto: number;     // FV-dep for activo/inversión | total_pagado for financiamiento
  ganancia_neta: number;  // valor_neto - valor_inicial

  // Activo / Inversión
  depreciacion_acumulada: number;
  depreciacion_por_periodo: number;

  // Financiamiento (Préstamo / Alquiler)
  cuota_mensual: number;   // PMT
  total_pagado: number;    // cuota * n
  interes_total: number;   // total_pagado - P
  periodos_meses: number;  // n in months for financing
}

// ─── PMT helper ───────────────────────────────────────────────────────────────
/**
 * PMT formula: cuota = P * [r(1+r)^n] / [(1+r)^n - 1]
 * P = principal, r = monthly rate, n = total months
 */
function calcPMT(P: number, r: number, n: number): number {
  if (P <= 0 || n <= 0) return 0;
  if (r === 0) return P / n;
  const pow = Math.pow(1 + r, n);
  return (P * r * pow) / (pow - 1);
}

// ─── Main calculator ──────────────────────────────────────────────────────────
export function calcularInversion(record: InversionRecord): InversionCalculated {
  const n = Math.max(record.rango ?? 0, 0);
  const valorInicial = Math.max(record.valor_inicial ?? 0, 0);
  const tasaInteres = Math.max(record.tasa_interes ?? 0, 0) / 100;
  const tasaDepreciacion = Math.max(record.tasa_depreciacion ?? 0, 0) / 100;
  const metodo = record.metodo_depreciacion ?? 'porcentaje';

  if (esFinanciamiento(record.tipo)) {
    // ── FINANCIAMIENTO: Préstamo / Alquiler ─────────────────────────────────
    // Convert to monthly periods
    const nMeses = record.unidad_rango === 'años' ? n * 12 : n;
    // Monthly rate from annual percentage
    const rMensual = tasaInteres / 12;

    const cuota = calcPMT(valorInicial, rMensual, nMeses);
    const totalPagado = cuota * nMeses;
    const interesTotal = Math.max(totalPagado - valorInicial, 0);

    return {
      ...record,
      // valor_futuro holds cuota_mensual so existing table column renders it
      valor_futuro: cuota,
      // valor_neto holds total_pagado
      valor_neto: totalPagado,
      ganancia_neta: interesTotal, // cost of financing = interest paid
      depreciacion_acumulada: 0,
      depreciacion_por_periodo: 0,
      cuota_mensual: cuota,
      total_pagado: totalPagado,
      interes_total: interesTotal,
      periodos_meses: nMeses,
    };
  }

  // ── ACTIVO / INVERSIÓN: interés compuesto + depreciación ───────────────────
  const valorFuturo =
    n > 0 && valorInicial > 0
      ? valorInicial * Math.pow(1 + tasaInteres, n)
      : valorInicial;

  let depreciacionAcumulada: number;
  let depreciacionPorPeriodo: number;

  if (metodo === 'tiempo') {
    depreciacionPorPeriodo = n > 0 ? valorInicial / n : 0;
    depreciacionAcumulada = n > 0 ? valorInicial : 0;
  } else {
    depreciacionPorPeriodo = valorInicial * tasaDepreciacion;
    depreciacionAcumulada = Math.min(valorInicial * tasaDepreciacion * n, valorInicial);
  }

  const valorNeto = Math.max(valorFuturo - depreciacionAcumulada, 0);
  const gananciaNeta = valorNeto - valorInicial;

  return {
    ...record,
    valor_futuro: valorFuturo,
    depreciacion_acumulada: depreciacionAcumulada,
    depreciacion_por_periodo: depreciacionPorPeriodo,
    valor_neto: valorNeto,
    ganancia_neta: gananciaNeta,
    cuota_mensual: 0,
    total_pagado: 0,
    interes_total: 0,
    periodos_meses: 0,
  };
}

// ─── Formatters ───────────────────────────────────────────────────────────────
export function fmtCurrency(value: number): string {
  return value.toLocaleString('es-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtPct(value: number): string {
  return `${value.toFixed(2)}%`;
}
