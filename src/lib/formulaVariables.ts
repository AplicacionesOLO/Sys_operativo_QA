/**
 * Formula Variable Registry
 * Defines all variables available for formula construction across all data modules.
 * Variables use {TOKEN_KEY} syntax in expressions.
 */
import type { InversionRecord } from '@/types/inversion';
import { calcularInversion, esFinanciamiento } from '@/types/inversion';
import type { EmpleadoImportado } from '@/types/mano_obra_empleados';
import { readAllLastN } from '@/hooks/useVolumenesPromedioConfig';
import type { Factor } from '@/types/factores';
import { evalFormula } from './mathEvaluator';

// ── Data types for each module ──────────────────────────────────────────────
export interface DynamicColumnItem {
  id: string;
  nombre: string;
  tipo: string;
  is_sensitive?: boolean;
}

export interface DynamicRowItem {
  id: string;
  valores: Record<string, string | number>;
  area?: string;
  proceso?: string;
  subproceso?: string;
  concepto?: string;
  nombre?: string;
  // Gastos Varios nuevos campos jerárquicos
  parent_id?: string | null;
  es_total?: boolean;
  tipo_fila?: string;
}

export interface AreaDistItem {
  area_name: string;
  global_distribution_percentage: number;
  categoria?: string;
  category_distribution_percentage?: number;
  // ── Distribución cúbica (m³) ────────────────────────────────────────────
  global_distribution_cubic_percentage?: number;
  category_distribution_cubic_percentage?: number;
}

export interface AreaDataItem {
  nombre: string;
  metros_cuadrados: number;
  cantidad_racks: number;
  metros_cubicos: number;
  costo_area: number;
}

export interface VolDistribucionItem {
  id: string;
  nombre: string;
  porcentaje: number;
  porcentaje_inbound: number;
  porcentaje_outbound: number;
  categoria: string;   // 'Inbound' | 'Outbound'
  is_active: boolean;
  unidades?: number;
  es_zona_franca?: boolean;
}

export interface AllDataSources {
  inversiones: InversionRecord[];
  gastosColumnas: DynamicColumnItem[];
  gastosFilas: DynamicRowItem[];
  manoObraColumnas: DynamicColumnItem[];
  manoObraFilas: DynamicRowItem[];
  manoObraEmpleados: EmpleadoImportado[];
  volumenesColumnas: DynamicColumnItem[];
  volumenesFilas: DynamicRowItem[];
  costosColumnas: DynamicColumnItem[];
  costosFilas: DynamicRowItem[];
  areaDistribucion: AreaDistItem[];
  areasData: AreaDataItem[];
  volDistribucion?: VolDistribucionItem[];
  /** Factores registrados en el módulo de Factores */
  factores?: Factor[];
  /** Datos masivos de volúmenes (resumen por artículo) */
  masivoArticulos?: { articulo: string; descripcion: string; movimientos: number; unidades: number; meses_distintos: number; prom_movimientos_mes: number; prom_unidades_mes: number }[];
  /** Datos masivos de volúmenes (resumen por zona) */
  masivoZonas?: { zona: string; movimientos: number; unidades: number; articulos_distintos: number; meses_distintos: number; prom_movimientos_mes: number; prom_unidades_mes: number }[];
  /** Datos masivos: intersección zona × artículo */
  masivoZonaArticulos?: { zona: string; articulo: string; descripcion: string; movimientos: number; unidades: number }[];
  /** Totales globales masivos (calculados en SQL, no truncados) */
  masivoTotals?: {
    totalArticulos: number;
    totalMovArticulos: number;
    totalUnidArticulos: number;
    totalZonas: number;
    totalMovZonas: number;
    totalUnidZonas: number;
  };
}

export const EMPTY_DATA_SOURCES: AllDataSources = {
  inversiones: [],
  gastosColumnas: [],
  gastosFilas: [],
  manoObraColumnas: [],
  manoObraFilas: [],
  manoObraEmpleados: [],
  volumenesColumnas: [],
  volumenesFilas: [],
  costosColumnas: [],
  costosFilas: [],
  areaDistribucion: [],
  areasData: [],
  volDistribucion: [],
  factores: [],
  masivoArticulos: [],
  masivoZonas: [],
  masivoZonaArticulos: [],
  masivoTotals: undefined,
};

// ── Variable group definitions ───────────────────────────────────────────────
export type VarGroup = 'inversiones' | 'gastos_varios' | 'mano_obra' | 'volumenes' | 'costos' | 'distribucion' | 'distribucion_cubica' | 'areas' | 'vol_distribucion' | 'factores' | 'masivo';

export interface VariableDef {
  token: string;
  label: string;
  description: string;
  group: VarGroup;
  icon: string;
  tagColor: string;
  computeValue: (data: AllDataSources, rowSubproceso?: string) => number;
}

// ── Helper functions ──────────────────────────────────────────────────────────
function sumNumericColumn(rows: DynamicRowItem[], colId: string): number {
  return rows.reduce((acc, r) => {
    const v = Number(r.valores?.[colId] ?? 0);
    return acc + (isNaN(v) ? 0 : v);
  }, 0);
}

function getMonthlyDeprecSingle(inv: InversionRecord): number {
  if (esFinanciamiento(inv.tipo)) return 0;
  const n = Math.max(inv.rango ?? 0, 0);
  const valor = Math.max(inv.valor_inicial ?? 0, 0);
  if (inv.metodo_depreciacion === 'tiempo') {
    const meses = inv.unidad_rango === 'años' ? n * 12 : n;
    return meses > 0 ? valor / meses : 0;
  }
  return valor * ((inv.tasa_depreciacion ?? 0) / 100) / 12;
}

export function sanitizeAreaToken(areaName: string): string {
  return areaName.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
}

function findArea(data: AllDataSources, rowSubproceso?: string): AreaDataItem | undefined {
  if (!rowSubproceso?.trim()) return undefined;
  return data.areasData.find(
    a => a.nombre.toLowerCase().trim() === rowSubproceso.toLowerCase().trim()
  );
}

// ── Build all variable definitions from current data sources ─────────────────
export function buildVariableDefs(data: AllDataSources): VariableDef[] {
  const defs: VariableDef[] = [];

  // ── INVERSIONES ──────────────────────────────────────────────────────────
  defs.push({
    token: 'TOTAL_INVERSIONES',
    label: 'Total Inversiones (valor inicial)',
    description: 'Suma del valor inicial de todas las inversiones',
    group: 'inversiones',
    icon: 'ri-building-2-line',
    tagColor: 'bg-rose-100 text-rose-700',
    computeValue: (d) => d.inversiones.reduce((s, i) => s + (i.valor_inicial ?? 0), 0),
  });

  defs.push({
    token: 'SUM_DEPREC_MENSUAL',
    label: 'Total Depreciación Mensual',
    description: 'Suma de la depreciación mensual de todos los activos (no financiamientos)',
    group: 'inversiones',
    icon: 'ri-arrow-down-line',
    tagColor: 'bg-rose-100 text-rose-700',
    computeValue: (d) => d.inversiones.reduce((s, i) => s + getMonthlyDeprecSingle(i), 0),
  });

  defs.push({
    token: 'SUM_PAGOS_MENSUALES',
    label: 'Total Pagos Mensuales (PMT)',
    description: 'Suma de cuotas mensuales de préstamos y alquileres',
    group: 'inversiones',
    icon: 'ri-bank-card-line',
    tagColor: 'bg-rose-100 text-rose-700',
    computeValue: (d) => d.inversiones.reduce((s, i) => s + calcularInversion(i).cuota_mensual, 0),
  });

  data.inversiones.forEach(inv => {
    const isFinanc = esFinanciamiento(inv.tipo);
    if (!isFinanc) {
      defs.push({
        token: `DEPREC_${inv.id}`,
        label: `Deprec. mensual: ${inv.nombre || inv.id}`,
        description: `Depreciación mensual de "${inv.nombre}"`,
        group: 'inversiones',
        icon: 'ri-arrow-down-line',
        tagColor: 'bg-rose-100 text-rose-700',
        computeValue: () => getMonthlyDeprecSingle(inv),
      });
    } else {
      defs.push({
        token: `PMT_${inv.id}`,
        label: `Pago mensual: ${inv.nombre || inv.id}`,
        description: `Cuota mensual de "${inv.nombre}"`,
        group: 'inversiones',
        icon: 'ri-bank-card-line',
        tagColor: 'bg-rose-100 text-rose-700',
        computeValue: () => calcularInversion(inv).cuota_mensual,
      });
    }
  });

  // ── GASTOS VARIOS (nuevo modelo jerárquico) ───────────────────────────────
  // Los gastos varios ahora usan un estado financiero con 6 campos fijos.
  // Sumamos solo las filas de detalle (tipo_fila === 'detalle') para evitar
  // doble conteo con totales/subtotales calculados jerárquicamente.
  function sumGvKey(d: AllDataSources, key: string): number {
    return d.gastosFilas
      .filter(r => r.tipo_fila === 'detalle' || (!r.es_total && r.tipo_fila !== 'subtotal'))
      .reduce((s, r) => {
        const v = Number(r.valores?.[key] ?? 0);
        return s + (isNaN(v) ? 0 : v);
      }, 0);
  }

  // También calculamos el total de raíces (filas de tipo total sin parent)
  // como alternativa más simple para el usuario
  function sumGvRootKey(d: AllDataSources, key: string): number {
    return d.gastosFilas
      .filter(r => !r.parent_id)
      .reduce((s, r) => {
        const v = Number(r.valores?.[key] ?? 0);
        return s + (isNaN(v) ? 0 : v);
      }, 0);
  }

  const GV_VARS: { token: string; label: string; key: string; description: string }[] = [
    { token: 'GV_MES',       label: 'Gastos Varios: Mes',           key: 'mes',       description: 'Total del período actual (columna Mes) en Gastos Varios' },
    { token: 'GV_PPTO_MES',  label: 'Gastos Varios: Presupuesto Mes',key: 'ppto_mes',  description: 'Total presupuestado del mes en Gastos Varios' },
    { token: 'GV_PSDO_MES',  label: 'Gastos Varios: Pasado Mes',    key: 'psdo_mes',  description: 'Total del mes anterior (Pasado Mes) en Gastos Varios' },
    { token: 'GV_ACUM',      label: 'Gastos Varios: Acumulado',     key: 'acum',      description: 'Total acumulado en Gastos Varios' },
    { token: 'GV_PPTO_ACUM', label: 'Gastos Varios: Ppto Acumulado',key: 'ppto_acum', description: 'Total presupuesto acumulado en Gastos Varios' },
    { token: 'GV_PSDO_ACUM', label: 'Gastos Varios: Psdo Acumulado',key: 'psdo_acum', description: 'Total pasado acumulado en Gastos Varios' },
  ];

  GV_VARS.forEach(({ token, label, key, description }) => {
    defs.push({
      token,
      label,
      description,
      group: 'gastos_varios',
      icon: 'ri-receipt-line',
      tagColor: 'bg-amber-100 text-amber-700',
      computeValue: (d) => {
        // Preferir suma de detalle; si no hay filas detalle usar raíces
        const detailSum = sumGvKey(d, key);
        return detailSum !== 0 ? detailSum : sumGvRootKey(d, key);
      },
    });
  });

  // Variables por concepto (filas raíz del estado financiero)
  const rootFilas = data.gastosFilas.filter(r => !r.parent_id);
  rootFilas.forEach(fila => {
    const conceptoLabel = (fila.concepto as string | undefined) || fila.id;
    const safeToken = conceptoLabel.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase().slice(0, 30);
    GV_VARS.forEach(({ key, label: kLabel }) => {
      const val = Number(fila.valores?.[key] ?? 0);
      if (val !== 0) {
        defs.push({
          token: `GV_${safeToken}_${key.toUpperCase()}`,
          label: `GV ${conceptoLabel}: ${kLabel.split(': ')[1]}`,
          description: `Valor "${kLabel.split(': ')[1]}" del concepto "${conceptoLabel}" en Gastos Varios`,
          group: 'gastos_varios',
          icon: 'ri-receipt-line',
          tagColor: 'bg-amber-100 text-amber-700',
          computeValue: () => val,
        });
      }
    });
  });

  // ── MANO DE OBRA ──────────────────────────────────────────────────────────
  const numericMoCols = data.manoObraColumnas.filter(c =>
    ['moneda', 'numero', 'porcentaje'].includes(c.tipo) && !c.is_sensitive
  );

  defs.push({
    token: 'TOTAL_MANO_OBRA',
    label: 'Total Mano de Obra',
    description: 'Gran total de columnas numéricas no sensibles de Mano de Obra',
    group: 'mano_obra',
    icon: 'ri-user-3-line',
    tagColor: 'bg-teal-100 text-teal-700',
    computeValue: (d) => numericMoCols.reduce((s, c) => s + sumNumericColumn(d.manoObraFilas, c.id), 0),
  });

  numericMoCols.forEach(col => {
    defs.push({
      token: `SUM_MO_${col.id}`,
      label: `MO: ${col.nombre}`,
      description: `Suma de la columna "${col.nombre}" en Mano de Obra`,
      group: 'mano_obra',
      icon: 'ri-user-3-line',
      tagColor: 'bg-teal-100 text-teal-700',
      computeValue: (d) => sumNumericColumn(d.manoObraFilas, col.id),
    });
  });

  // ── MANO DE OBRA: DISTRIBUCIÓN DE EMPLEADOS (importación masiva) ─────────
  // Estas variables usan los registros de mano_obra_empleados y su campo "dist".
  // MO_DIST_TOTAL → suma total de Dist de todos los empleados activos
  // MO_DIST_AREA_{TOKEN} → suma de Dist agrupada por Área
  // MO_DIST_SEC_{TOKEN}  → suma de Dist agrupada por Sección
  // MO_DIST_DEP_{TOKEN}  → suma de Dist agrupada por Departamento
  // MO_EMP_COUNT         → cantidad total de empleados importados

  const empleados = data.manoObraEmpleados ?? [];
  const totalDist = empleados.reduce((s, e) => s + (e.dist ?? 0), 0);

  defs.push({
    token: 'MO_DIST_TOTAL',
    label: 'MO Distribución Total (suma de Dist)',
    description: 'Suma total del campo "Dist" de todos los empleados importados en Mano de Obra',
    group: 'mano_obra',
    icon: 'ri-pie-chart-line',
    tagColor: 'bg-teal-100 text-teal-700',
    computeValue: () => totalDist,
  });

  defs.push({
    token: 'MO_EMP_COUNT',
    label: 'MO Cantidad de empleados',
    description: 'Número total de empleados importados en Mano de Obra',
    group: 'mano_obra',
    icon: 'ri-team-line',
    tagColor: 'bg-teal-100 text-teal-700',
    computeValue: () => empleados.length,
  });

  // Group by Area
  const distByArea: Record<string, number> = {};
  empleados.forEach(e => {
    const k = (e.area ?? '').trim();
    if (k) distByArea[k] = (distByArea[k] ?? 0) + (e.dist ?? 0);
  });
  Object.entries(distByArea).forEach(([area, dist]) => {
    const token = `MO_DIST_AREA_${sanitizeAreaToken(area)}`;
    defs.push({
      token,
      label: `MO Dist. Área: ${area}`,
      description: `Suma de distribución (Dist) de todos los empleados del área "${area}"`,
      group: 'mano_obra',
      icon: 'ri-layout-grid-line',
      tagColor: 'bg-teal-100 text-teal-700',
      computeValue: () => dist,
    });
  });

  // Group by Sección
  const distBySec: Record<string, number> = {};
  empleados.forEach(e => {
    const k = (e.seccion ?? '').trim();
    if (k) distBySec[k] = (distBySec[k] ?? 0) + (e.dist ?? 0);
  });
  Object.entries(distBySec).forEach(([sec, dist]) => {
    const token = `MO_DIST_SEC_${sanitizeAreaToken(sec)}`;
    defs.push({
      token,
      label: `MO Dist. Sección: ${sec}`,
      description: `Suma de distribución (Dist) de todos los empleados de la sección "${sec}"`,
      group: 'mano_obra',
      icon: 'ri-organization-chart',
      tagColor: 'bg-teal-100 text-teal-700',
      computeValue: () => dist,
    });
  });

  // Group by Tipo
  const distByTipo: Record<string, number> = {};
  empleados.forEach(e => {
    const k = (e.tipo ?? '').trim();
    if (k) distByTipo[k] = (distByTipo[k] ?? 0) + (e.dist ?? 0);
  });
  Object.entries(distByTipo).forEach(([tipo, dist]) => {
    const token = `MO_DIST_TIPO_${sanitizeAreaToken(tipo)}`;
    defs.push({
      token,
      label: `MO Dist. Tipo: ${tipo}`,
      description: `Suma de distribución (Dist) de todos los empleados del tipo "${tipo}"`,
      group: 'mano_obra',
      icon: 'ri-user-settings-line',
      tagColor: 'bg-teal-100 text-teal-700',
      computeValue: () => dist,
    });
  });

  // Group by Jefe Inmediato (distribución por empleado)
  const distByEmp: Record<string, number> = {};
  empleados.forEach(e => {
    const k = (e.jefe_inmediato ?? '').trim();
    if (k) distByEmp[k] = (distByEmp[k] ?? 0) + (e.dist ?? 0);
  });
  Object.entries(distByEmp).forEach(([emp, dist]) => {
    const token = `MO_DIST_EMP_${sanitizeAreaToken(emp)}`;
    defs.push({
      token,
      label: `MO Dist. Empleado: ${emp}`,
      description: `Suma de distribución (Dist) del empleado "${emp}" (todos sus registros)`,
      group: 'mano_obra',
      icon: 'ri-user-line',
      tagColor: 'bg-teal-100 text-teal-700',
      computeValue: () => dist,
    });
  });

  // ── VOLÚMENES ─────────────────────────────────────────────────────────────
  // Nueva estructura: volumenesColumnas = meses, volumenesFilas = clientes
  // proceso = 'recibido' | 'despachado' | 'total_in_out'
  // subproceso = nombre del cliente

  const volRecibidas = data.volumenesFilas.filter(r => r.proceso === 'recibido');
  const volDespachadas = data.volumenesFilas.filter(r => r.proceso === 'despachado');
  const volTotalInOut = data.volumenesFilas.filter(r => r.proceso === 'total_in_out');

  // Leer configuración de "últimos N meses" guardada por el usuario en la tabla de volúmenes
  const volLastN = readAllLastN();

  /**
   * Devuelve los meses a usar para el promedio según lastN.
   * Solo considera meses donde al menos una fila tiene valor > 0.
   * lastN = 0 → todos los meses con datos.
   */
  function getMesesParaPromedio(filas: DynamicRowItem[], lastN: number): typeof data.volumenesColumnas {
    const mesesConDatos = data.volumenesColumnas.filter(m =>
      filas.some(f => {
        const v = Number(f.valores?.[m.id] ?? 0);
        return !isNaN(v) && v > 0;
      })
    );
    if (lastN <= 0 || lastN >= mesesConDatos.length) return mesesConDatos;
    return mesesConDatos.slice(-lastN);
  }

  function sumVolFilas(filas: DynamicRowItem[]): number {
    return filas.reduce((s, f) => {
      return s + data.volumenesColumnas.reduce((cs, c) => {
        const v = Number(f.valores?.[c.id] ?? 0);
        return cs + (isNaN(v) ? 0 : v);
      }, 0);
    }, 0);
  }

  function sumVolFilasMes(filas: DynamicRowItem[], mesId: string): number {
    return filas.reduce((s, f) => {
      const v = Number(f.valores?.[mesId] ?? 0);
      return s + (isNaN(v) ? 0 : v);
    }, 0);
  }

  function sumVolFilasOverMeses(filas: DynamicRowItem[], meses: typeof data.volumenesColumnas): number {
    return filas.reduce((s, f) => {
      return s + meses.reduce((cs, m) => {
        const v = Number(f.valores?.[m.id] ?? 0);
        return cs + (isNaN(v) ? 0 : v);
      }, 0);
    }, 0);
  }

  const totalRecibidas = sumVolFilas(volRecibidas);
  const totalDespachadas = sumVolFilas(volDespachadas);

  // Meses efectivos para promedio según configuración del usuario
  const mesesPromRec = getMesesParaPromedio(volRecibidas, volLastN.recibido);
  const mesesPromDes = getMesesParaPromedio(volDespachadas, volLastN.despachado);

  // Totales sobre los meses seleccionados para promedio
  const totalRecParaProm = sumVolFilasOverMeses(volRecibidas, mesesPromRec);
  const totalDesParaProm = sumVolFilasOverMeses(volDespachadas, mesesPromDes);

  // Promedios globales usando los meses configurados
  const promInGlobal = mesesPromRec.length > 0 ? totalRecParaProm / mesesPromRec.length : 0;
  const promOutGlobal = mesesPromDes.length > 0 ? totalDesParaProm / mesesPromDes.length : 0;
  const promInOutGlobal = (promInGlobal + promOutGlobal) / 2;

  // Descripción dinámica para las variables de promedio
  const descPromRec = volLastN.recibido > 0
    ? `Promedio mensual de unidades recibidas usando los últimos ${volLastN.recibido} meses con datos (configurado en módulo Volúmenes)`
    : 'Promedio mensual de unidades recibidas de todos los clientes = total recibidas ÷ número de meses con datos';
  const descPromDes = volLastN.despachado > 0
    ? `Promedio mensual de unidades despachadas usando los últimos ${volLastN.despachado} meses con datos (configurado en módulo Volúmenes)`
    : 'Promedio mensual de unidades despachadas de todos los clientes = total despachadas ÷ número de meses con datos';

  defs.push({
    token: 'TOTAL_RECIBIDAS',
    label: 'Total Unidades Recibidas',
    description: 'Suma de todas las unidades recibidas de todos los clientes y meses',
    group: 'volumenes',
    icon: 'ri-arrow-down-circle-line',
    tagColor: 'bg-sky-100 text-sky-700',
    computeValue: () => totalRecibidas,
  });

  defs.push({
    token: 'TOTAL_DESPACHADAS',
    label: 'Total Unidades Despachadas',
    description: 'Suma de todas las unidades despachadas de todos los clientes y meses',
    group: 'volumenes',
    icon: 'ri-arrow-up-circle-line',
    tagColor: 'bg-sky-100 text-sky-700',
    computeValue: () => totalDespachadas,
  });

  // % despacho global
  const pctDesGlobal = totalRecibidas > 0 ? (totalDespachadas / totalRecibidas) * 100 : 0;
  defs.push({
    token: 'VOL_PORC_DES_TOTAL',
    label: '% Despacho Global',
    description: 'Porcentaje de despacho global = total despachadas ÷ total recibidas × 100.',
    group: 'volumenes',
    icon: 'ri-percent-line',
    tagColor: 'bg-sky-100 text-sky-700',
    computeValue: () => pctDesGlobal,
  });

  // Promedio in/out global (usa promedios configurados)
  defs.push({
    token: 'VOL_PROM_INOUT_TOTAL',
    label: 'Prom. in/out Global',
    description: 'Promedio entre prom. mensual IN y prom. mensual OUT, usando la configuración de meses del módulo Volúmenes.',
    group: 'volumenes',
    icon: 'ri-swap-line',
    tagColor: 'bg-violet-100 text-violet-700',
    computeValue: () => promInOutGlobal,
  });

  defs.push({
    token: 'VOL_PROM_IN_TOTAL',
    label: `Prom. Mensual IN (Global)${volLastN.recibido > 0 ? ` · últ. ${volLastN.recibido} meses` : ''}`,
    description: descPromRec,
    group: 'volumenes',
    icon: 'ri-arrow-down-circle-line',
    tagColor: 'bg-sky-100 text-sky-700',
    computeValue: () => promInGlobal,
  });

  defs.push({
    token: 'VOL_PROM_OUT_TOTAL',
    label: `Prom. Mensual OUT (Global)${volLastN.despachado > 0 ? ` · últ. ${volLastN.despachado} meses` : ''}`,
    description: descPromDes,
    group: 'volumenes',
    icon: 'ri-arrow-up-circle-line',
    tagColor: 'bg-sky-100 text-sky-700',
    computeValue: () => promOutGlobal,
  });

  // Legacy token — backward compat
  defs.push({
    token: 'TOTAL_VOLUMENES',
    label: 'Total Volúmenes (recibidas)',
    description: 'Igual que TOTAL_RECIBIDAS — total de unidades recibidas',
    group: 'volumenes',
    icon: 'ri-bar-chart-box-line',
    tagColor: 'bg-sky-100 text-sky-700',
    computeValue: () => totalRecibidas,
  });

  // Variables por mes
  data.volumenesColumnas.forEach(mes => {
    const mesToken = sanitizeAreaToken(mes.nombre);
    const recMes = sumVolFilasMes(volRecibidas, mes.id);
    const desMes = sumVolFilasMes(volDespachadas, mes.id);
    const inOutMes = sumVolFilasMes(volTotalInOut, mes.id);

    defs.push({
      token: `VOL_REC_MES_${mesToken}`,
      label: `Recibidas ${mes.nombre}`,
      description: `Total unidades recibidas de todos los clientes en ${mes.nombre}`,
      group: 'volumenes',
      icon: 'ri-arrow-down-circle-line',
      tagColor: 'bg-sky-100 text-sky-700',
      computeValue: () => recMes,
    });

    defs.push({
      token: `VOL_DES_MES_${mesToken}`,
      label: `Despachadas ${mes.nombre}`,
      description: `Total unidades despachadas de todos los clientes en ${mes.nombre}`,
      group: 'volumenes',
      icon: 'ri-arrow-up-circle-line',
      tagColor: 'bg-sky-100 text-sky-700',
      computeValue: () => desMes,
    });

    if (inOutMes !== 0) {
      defs.push({
        token: `VOL_INOUT_MES_${mesToken}`,
        label: `Total in/out ${mes.nombre}`,
        description: `Total in/out en ${mes.nombre}`,
        group: 'volumenes',
        icon: 'ri-swap-line',
        tagColor: 'bg-amber-100 text-amber-700',
        computeValue: () => inOutMes,
      });
    }

    // Legacy: SUM_VOL_{col.id}
    defs.push({
      token: `SUM_VOL_${mes.id}`,
      label: `Vol mes ${mes.nombre} (recibidas)`,
      description: `Total recibidas en ${mes.nombre} (alias de VOL_REC_MES_${mesToken})`,
      group: 'volumenes',
      icon: 'ri-bar-chart-box-line',
      tagColor: 'bg-sky-100 text-sky-700',
      computeValue: () => recMes,
    });
  });

  // Variables por cliente
  const allVolClients = [
    ...new Set([
      ...volRecibidas.map(r => r.subproceso).filter(Boolean),
      ...volDespachadas.map(r => r.subproceso).filter(Boolean),
    ]),
  ] as string[];

  allVolClients.forEach(cliente => {
    const clientToken = sanitizeAreaToken(cliente);
    const recRow = volRecibidas.find(r => r.subproceso === cliente);
    const desRow = volDespachadas.find(r => r.subproceso === cliente);

    const recTotal = data.volumenesColumnas.reduce((s, c) => {
      const v = Number(recRow?.valores?.[c.id] ?? 0);
      return s + (isNaN(v) ? 0 : v);
    }, 0);

    const desTotal = data.volumenesColumnas.reduce((s, c) => {
      const v = Number(desRow?.valores?.[c.id] ?? 0);
      return s + (isNaN(v) ? 0 : v);
    }, 0);

    defs.push({
      token: `VOL_REC_${clientToken}`,
      label: `Recibidas: ${cliente}`,
      description: `Total unidades recibidas del cliente "${cliente}" (suma de todos los meses)`,
      group: 'volumenes',
      icon: 'ri-arrow-down-circle-line',
      tagColor: 'bg-sky-100 text-sky-700',
      computeValue: () => recTotal,
    });

    defs.push({
      token: `VOL_DES_${clientToken}`,
      label: `Despachadas: ${cliente}`,
      description: `Total unidades despachadas del cliente "${cliente}" (suma de todos los meses)`,
      group: 'volumenes',
      icon: 'ri-arrow-up-circle-line',
      tagColor: 'bg-sky-100 text-sky-700',
      computeValue: () => desTotal,
    });

    // Variables por cliente × mes
    data.volumenesColumnas.forEach(mes => {
      const mesToken = sanitizeAreaToken(mes.nombre);
      const recVal = Number(recRow?.valores?.[mes.id] ?? 0);
      const desVal = Number(desRow?.valores?.[mes.id] ?? 0);

      if (recVal !== 0) {
        defs.push({
          token: `VOL_REC_${clientToken}_${mesToken}`,
          label: `Recibidas: ${cliente} / ${mes.nombre}`,
          description: `Unidades recibidas del cliente "${cliente}" en ${mes.nombre}`,
          group: 'volumenes',
          icon: 'ri-arrow-down-circle-line',
          tagColor: 'bg-sky-100 text-sky-700',
          computeValue: () => recVal,
        });
      }

      if (desVal !== 0) {
        defs.push({
          token: `VOL_DES_${clientToken}_${mesToken}`,
          label: `Despachadas: ${cliente} / ${mes.nombre}`,
          description: `Unidades despachadas del cliente "${cliente}" en ${mes.nombre}`,
          group: 'volumenes',
          icon: 'ri-arrow-up-circle-line',
          tagColor: 'bg-sky-100 text-sky-700',
          computeValue: () => desVal,
        });
      }
    });

    // % despacho por cliente: des / rec * 100 (0 si rec=0)
    const pctDes = recTotal > 0 ? (desTotal / recTotal) * 100 : 0;
    defs.push({
      token: `VOL_PORC_DES_${clientToken}`,
      label: `% Despacho: ${cliente}`,
      description: `Porcentaje de despacho del cliente "${cliente}" = despachadas ÷ recibidas × 100. Devuelve el valor numérico (ej: 87.45 para 87.45%).`,
      group: 'volumenes',
      icon: 'ri-percent-line',
      tagColor: 'bg-sky-100 text-sky-700',
      computeValue: () => pctDes,
    });

    // Promedio in/out por cliente: (rec + des) / 2
    const promInOut = (recTotal + desTotal) / 2;
    defs.push({
      token: `VOL_PROM_INOUT_${clientToken}`,
      label: `Prom. in/out: ${cliente}`,
      description: `Promedio entre unidades recibidas y despachadas del cliente "${cliente}" = (recibidas + despachadas) ÷ 2.`,
      group: 'volumenes',
      icon: 'ri-swap-line',
      tagColor: 'bg-violet-100 text-violet-700',
      computeValue: () => promInOut,
    });

    // Promedio mensual IN por cliente usando lastN configurado
    const recRowForProm = recRow;
    const desRowForProm = desRow;

    // Meses con datos para este cliente específico
    const mesesRecCliente = data.volumenesColumnas.filter(m => {
      const v = Number(recRowForProm?.valores?.[m.id] ?? 0);
      return !isNaN(v) && v > 0;
    });
    const mesesDesCliente = data.volumenesColumnas.filter(m => {
      const v = Number(desRowForProm?.valores?.[m.id] ?? 0);
      return !isNaN(v) && v > 0;
    });

    // Aplicar lastN
    const sliceRec = volLastN.recibido > 0 && volLastN.recibido < mesesRecCliente.length
      ? mesesRecCliente.slice(-volLastN.recibido)
      : mesesRecCliente;
    const sliceDes = volLastN.despachado > 0 && volLastN.despachado < mesesDesCliente.length
      ? mesesDesCliente.slice(-volLastN.despachado)
      : mesesDesCliente;

    const recParaProm = sliceRec.reduce((s, m) => {
      const v = Number(recRowForProm?.valores?.[m.id] ?? 0);
      return s + (isNaN(v) ? 0 : v);
    }, 0);
    const desParaProm = sliceDes.reduce((s, m) => {
      const v = Number(desRowForProm?.valores?.[m.id] ?? 0);
      return s + (isNaN(v) ? 0 : v);
    }, 0);

    const promIn = sliceRec.length > 0 ? recParaProm / sliceRec.length : 0;
    const promOut = sliceDes.length > 0 ? desParaProm / sliceDes.length : 0;

    const labelSufRec = volLastN.recibido > 0 ? ` · últ. ${volLastN.recibido} meses` : '';
    const labelSufDes = volLastN.despachado > 0 ? ` · últ. ${volLastN.despachado} meses` : '';

    defs.push({
      token: `VOL_PROM_IN_${clientToken}`,
      label: `Prom. IN: ${cliente}${labelSufRec}`,
      description: `Promedio mensual de unidades RECIBIDAS del cliente "${cliente}"${volLastN.recibido > 0 ? ` usando los últimos ${volLastN.recibido} meses con datos` : ' (todos los meses con datos)'}. Configurable en módulo Volúmenes.`,
      group: 'volumenes',
      icon: 'ri-arrow-down-circle-line',
      tagColor: 'bg-sky-100 text-sky-700',
      computeValue: () => promIn,
    });

    defs.push({
      token: `VOL_PROM_OUT_${clientToken}`,
      label: `Prom. OUT: ${cliente}${labelSufDes}`,
      description: `Promedio mensual de unidades DESPACHADAS del cliente "${cliente}"${volLastN.despachado > 0 ? ` usando los últimos ${volLastN.despachado} meses con datos` : ' (todos los meses con datos)'}. Configurable en módulo Volúmenes.`,
      group: 'volumenes',
      icon: 'ri-arrow-up-circle-line',
      tagColor: 'bg-sky-100 text-sky-700',
      computeValue: () => promOut,
    });
  });

  // ── COSTOS_TOTAL_* — totales por fila (proceso + subproceso) ─────────────
  // Solo los totales; sin desglose por columna ni gran total detallado.
  // Se computan usando un varMap parcial (solo variables NO costos) para
  // poder evaluar las columnas fórmula sin dependencia circular.
  if (data.costosFilas.length > 0) {
    // Construir varMap parcial con todas las variables excepto las de costos
    const partialVarMap: Record<string, number> = {};
    defs.filter(d => d.group !== 'costos').forEach(d => {
      try { partialVarMap[d.token] = d.computeValue(data); } catch { partialVarMap[d.token] = 0; }
    });

    // Tokens que dependen del subproceso de la fila (DIST_FILA, M2_FILA, etc.)
    // Se deben parchar con el subproceso correcto de cada fila para que los
    // totales de COSTOS_TOTAL_* coincidan con lo que muestra la tabla de Costos.
    const rowDependentTokens = new Set([
      'DIST_FILA','DIST_FILA_CAT','DIST_CUBIC_FILA','DIST_CUBIC_FILA_CAT',
      'M2_FILA','M3_FILA','RACKS_FILA','COSTO_AREA_FILA','COSTOS_TOTAL_FILA',
    ]);
    const rowDepDefs = defs.filter(d => rowDependentTokens.has(d.token));

    const seen = new Set<string>();
    data.costosFilas.forEach(row => {
      const proc = (row.proceso ?? '').trim();
      const sp = (row.subproceso ?? '').trim();
      if (!proc || !sp) return;
      const key = `${proc}|${sp}`;
      if (seen.has(key)) return;
      seen.add(key);

      // Sumar todas las filas que coinciden con este proceso+subproceso
      let total = 0;
      const matching = data.costosFilas.filter(r =>
        r.proceso === proc && r.subproceso === sp
      );

      matching.forEach(fila => {
        // Parchar tokens dependientes de fila con el subproceso correcto
        const rowVarMap = { ...partialVarMap };
        const filaSp = (fila as any).subproceso ?? sp;
        rowDepDefs.forEach(d => {
          try { rowVarMap[d.token] = d.computeValue(data, filaSp); } catch { rowVarMap[d.token] = 0; }
        });

        data.costosColumnas.forEach(col => {
          if (col.tipo === 'texto' || col.tipo === 'select') return;
          if (col.tipo === 'formula') {
            const f = (fila as any).formulas?.[col.id] ?? (col as any).formula;
            if (f?.mode === 'expression' && f.expression?.trim()) {
              const r = evalFormula(f.expression, rowVarMap);
              total += r.ok ? r.value : 0;
            }
          } else {
            const v = Number(fila.valores?.[col.id] ?? 0);
            total += isNaN(v) ? 0 : v;
          }
        });
      });

      const procToken = sanitizeAreaToken(proc);
      const spToken = sanitizeAreaToken(sp);
      const token = `COSTOS_TOTAL_${procToken}_${spToken}`;
      const label = `Costos Total: ${proc} → ${sp}`;
      const descTotal = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(total);

      defs.push({
        token,
        label,
        description: `Total de "${proc} / ${sp}" en Costos de Operación = ${descTotal} USD`,
        group: 'costos',
        icon: 'ri-calculator-line',
        tagColor: 'bg-violet-100 text-violet-700',
        computeValue: () => total,
      });

      // Legacy token sin proceso (solo subproceso)
      if (!seen.has(`|${sp}`)) {
        seen.add(`|${sp}`);
        // Verificar si ya existe un token solo con subproceso que sea diferente
        const alreadyHasSp = seen.has(`__sp__${spToken}`);
        if (!alreadyHasSp) {
          seen.add(`__sp__${spToken}`);
          defs.push({
            token: `COSTOS_TOTAL_${spToken}`,
            label: `Costos Total: ${sp}`,
            description: `Total de "${sp}" en Costos de Operación = ${descTotal} USD`,
            group: 'costos',
            icon: 'ri-calculator-line',
            tagColor: 'bg-violet-100 text-violet-700',
            computeValue: () => total,
          });
        }
      }
    });
  }

  // Los totales por fila (COSTOS_TOTAL_FILA, COSTOS_TOTAL_{proc}_{sub}) se
  // calculan en buildVariableMap mediante calcularCostosTotales para poder
  // evaluar correctamente las columnas tipo formula con expression mode.

  // ── DISTRIBUCIÓN ──────────────────────────────────────────────────────────
  defs.push({
    token: 'DIST_FILA',
    label: 'Distribución: % Global del área de la fila',
    description: 'Fracción decimal del % global de distribución del área de la fila (ej: 25% → 0.25). Listo para multiplicar directamente.',
    group: 'distribucion',
    icon: 'ri-pie-chart-line',
    tagColor: 'bg-emerald-100 text-emerald-700',
    computeValue: (d, rowSubproceso) => {
      if (!rowSubproceso) return 0;
      const found = d.areaDistribucion.find(
        a => a.area_name?.toLowerCase().trim() === rowSubproceso.toLowerCase().trim()
      );
      return (found?.global_distribution_percentage ?? 0) / 100;
    },
  });

  defs.push({
    token: 'DIST_FILA_CAT',
    label: 'Distribución: % de Categoría (Interior/Exterior) del área de la fila',
    description: 'Fracción decimal del % dentro de su categoría (Interior o Exterior) del área de la fila. Ej: si el área es 51.84% del Interior → 0.5184.',
    group: 'distribucion',
    icon: 'ri-pie-chart-2-line',
    tagColor: 'bg-emerald-100 text-emerald-700',
    computeValue: (d, rowSubproceso) => {
      if (!rowSubproceso) return 0;
      const found = d.areaDistribucion.find(
        a => a.area_name?.toLowerCase().trim() === rowSubproceso.toLowerCase().trim()
      );
      return (found?.category_distribution_percentage ?? 0) / 100;
    },
  });

  data.areaDistribucion.forEach(area => {
    const token = `DIST_${sanitizeAreaToken(area.area_name)}`;
    defs.push({
      token,
      label: `Dist. Global: ${area.area_name} (${area.global_distribution_percentage?.toFixed(1) ?? 0}% → fracción)`,
      description: `Fracción decimal del % global del área "${area.area_name}" (${area.global_distribution_percentage?.toFixed(1) ?? 0}% ÷ 100 = ${((area.global_distribution_percentage ?? 0) / 100).toFixed(4)})`,
      group: 'distribucion',
      icon: 'ri-pie-chart-line',
      tagColor: 'bg-emerald-100 text-emerald-700',
      computeValue: () => (area.global_distribution_percentage ?? 0) / 100,
    });

    // Variable por categoría (Interior / Exterior)
    if ((area.category_distribution_percentage ?? 0) > 0 && area.categoria) {
      const catToken = `DIST_${area.categoria === 'Interior' ? 'INT' : area.categoria === 'Exterior' ? 'EXT' : sanitizeAreaToken(area.categoria)}_${sanitizeAreaToken(area.area_name)}`;
      const catLabel = area.categoria === 'Interior' ? 'Interior' : area.categoria === 'Exterior' ? 'Exterior' : area.categoria;
      defs.push({
        token: catToken,
        label: `Dist. ${catLabel}: ${area.area_name} (${area.category_distribution_percentage?.toFixed(1) ?? 0}%)`,
        description: `Fracción decimal del % de "${area.area_name}" dentro de la categoría ${catLabel} (${area.category_distribution_percentage?.toFixed(1) ?? 0}% ÷ 100 = ${((area.category_distribution_percentage ?? 0) / 100).toFixed(4)})`,
        group: 'distribucion',
        icon: area.categoria === 'Interior' ? 'ri-home-4-line' : 'ri-sun-line',
        tagColor: area.categoria === 'Interior' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700',
        computeValue: () => (area.category_distribution_percentage ?? 0) / 100,
      });
    }
  });

  // ── DISTRIBUCIÓN CÚBICA (m³) ─────────────────────────────────────────────
  // Variables equivalentes a distribución pero usando metros cúbicos como base.
  // Los datos vienen desde areaDistribucion con campos *_cubic_percentage.

  defs.push({
    token: 'DIST_CUBIC_FILA',
    label: 'Distribución Cúbica: % Global del área de la fila',
    description: 'Fracción decimal del % global de distribución CÚBICA del área de la fila (ej: 25% → 0.25). Basado en m³.',
    group: 'distribucion_cubica',
    icon: 'ri-box-3-line',
    tagColor: 'bg-cyan-100 text-cyan-700',
    computeValue: (d, rowSubproceso) => {
      if (!rowSubproceso) return 0;
      const found = d.areaDistribucion.find(
        a => a.area_name?.toLowerCase().trim() === rowSubproceso.toLowerCase().trim()
      );
      return (found?.global_distribution_cubic_percentage ?? 0) / 100;
    },
  });

  defs.push({
    token: 'DIST_CUBIC_FILA_CAT',
    label: 'Distribución Cúbica: % de Categoría del área de la fila',
    description: 'Fracción decimal del % dentro de su categoría (Interior o Exterior) del área de la fila, usando m³.',
    group: 'distribucion_cubica',
    icon: 'ri-box-3-line',
    tagColor: 'bg-cyan-100 text-cyan-700',
    computeValue: (d, rowSubproceso) => {
      if (!rowSubproceso) return 0;
      const found = d.areaDistribucion.find(
        a => a.area_name?.toLowerCase().trim() === rowSubproceso.toLowerCase().trim()
      );
      return (found?.category_distribution_cubic_percentage ?? 0) / 100;
    },
  });

  data.areaDistribucion.forEach(area => {
    const token = `DIST_CUBIC_${sanitizeAreaToken(area.area_name)}`;
    const pct = area.global_distribution_cubic_percentage ?? 0;
    if (pct > 0) {
      defs.push({
        token,
        label: `Dist. Cúbica Global: ${area.area_name} (${pct.toFixed(1)}% → fracción)`,
        description: `Fracción decimal del % global CÚBICO del área "${area.area_name}" (${pct.toFixed(1)}% ÷ 100 = ${(pct / 100).toFixed(4)})`,
        group: 'distribucion_cubica',
        icon: 'ri-box-3-line',
        tagColor: 'bg-cyan-100 text-cyan-700',
        computeValue: () => pct / 100,
      });
    }

    const catPct = area.category_distribution_cubic_percentage ?? 0;
    if (catPct > 0 && area.categoria) {
      const catToken = `DIST_CUBIC_${area.categoria === 'Interior' ? 'INT' : area.categoria === 'Exterior' ? 'EXT' : sanitizeAreaToken(area.categoria)}_${sanitizeAreaToken(area.area_name)}`;
      const catLabel = area.categoria === 'Interior' ? 'Interior' : area.categoria === 'Exterior' ? 'Exterior' : area.categoria;
      defs.push({
        token: catToken,
        label: `Dist. Cúbica ${catLabel}: ${area.area_name} (${catPct.toFixed(1)}%)`,
        description: `Fracción decimal del % CÚBICO de "${area.area_name}" dentro de ${catLabel} (${catPct.toFixed(1)}% ÷ 100 = ${(catPct / 100).toFixed(4)})`,
        group: 'distribucion_cubica',
        icon: area.categoria === 'Interior' ? 'ri-home-4-line' : 'ri-sun-line',
        tagColor: area.categoria === 'Interior' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700',
        computeValue: () => catPct / 100,
      });
    }
  });

  // ── DISTRIBUCIÓN DE VOLUMEN ──────────────────────────────────────────────
  const volDistItems = (data.volDistribucion ?? []).filter(v => v.is_active);
  const volDistInbound  = volDistItems.filter(v => v.categoria === 'Inbound');
  const volDistOutbound = volDistItems.filter(v => v.categoria === 'Outbound');

  if (volDistItems.length > 0) {
    // ── Totales por categoría ──
    defs.push({
      token: 'VOLDIST_INBOUND_TOTAL',
      label: 'Dist. Volumen Inbound: Total (%)',
      description: 'Suma de todos los % de distribución Inbound activos (fracción decimal)',
      group: 'vol_distribucion',
      icon: 'ri-arrow-down-circle-line',
      tagColor: 'bg-emerald-100 text-emerald-700',
      computeValue: () => volDistInbound.reduce((s, v) => s + (v.porcentaje_inbound ?? 0), 0) / 100,
    });

    defs.push({
      token: 'VOLDIST_OUTBOUND_TOTAL',
      label: 'Dist. Volumen Outbound: Total (%)',
      description: 'Suma de todos los % de distribución Outbound activos (fracción decimal)',
      group: 'vol_distribucion',
      icon: 'ri-arrow-up-circle-line',
      tagColor: 'bg-sky-100 text-sky-700',
      computeValue: () => volDistOutbound.reduce((s, v) => s + (v.porcentaje_outbound ?? 0), 0) / 100,
    });

    // ── Variables por segmento Inbound ──
    volDistInbound.forEach(vd => {
      const baseToken = vd.nombre.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
      const pct = vd.porcentaje_inbound ?? 0;

      // Token con prefijo IN_ (legacy)
      defs.push({
        token: `VOLDIST_IN_${baseToken}`,
        label: `Inbound: ${vd.nombre} (${pct.toFixed(2)}%)`,
        description: `Fracción decimal del % Inbound de "${vd.nombre}" (${pct.toFixed(2)}% ÷ 100 = ${(pct / 100).toFixed(4)})`,
        group: 'vol_distribucion',
        icon: 'ri-arrow-down-circle-line',
        tagColor: 'bg-emerald-100 text-emerald-700',
        computeValue: () => pct / 100,
      });

      // Token directo sin prefijo IN_ (ej: VOLDIST_RECIBO_NACIONALIZADO)
      defs.push({
        token: `VOLDIST_${baseToken}`,
        label: `Inbound: ${vd.nombre} (${pct.toFixed(2)}%)`,
        description: `Fracción decimal del % Inbound de "${vd.nombre}" (${pct.toFixed(2)}% ÷ 100 = ${(pct / 100).toFixed(4)})`,
        group: 'vol_distribucion',
        icon: 'ri-arrow-down-circle-line',
        tagColor: 'bg-emerald-100 text-emerald-700',
        computeValue: () => pct / 100,
      });
    });

    // ── Variables TOTAL combinado IN+OUT ──────────────────────────────────
    // Calcula el % de cada segmento sobre el total de unidades combinadas (IN+OUT)
    const totalUnidadesCombinadas = volDistItems.reduce((s, v) => s + (v.unidades ?? 0), 0);

    // Siempre generar los tokens VOLDIST_TOTAL_* — si no hay unidades, valen 0
    volDistItems.forEach(vd => {
      const baseToken = vd.nombre.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
      const pctTotal = totalUnidadesCombinadas > 0 ? (vd.unidades / totalUnidadesCombinadas) * 100 : 0;

      defs.push({
        token: `VOLDIST_TOTAL_${baseToken}`,
        label: `Total IN+OUT: ${vd.nombre} (${pctTotal.toFixed(2)}%)`,
        description: `Fracción decimal del % de "${vd.nombre}" sobre el total combinado IN+OUT (${pctTotal.toFixed(2)}% ÷ 100 = ${(pctTotal / 100).toFixed(4)})`,
        group: 'vol_distribucion',
        icon: vd.categoria === 'Inbound' ? 'ri-arrow-down-circle-line' : 'ri-arrow-up-circle-line',
        tagColor: vd.categoria === 'Inbound' ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700',
        computeValue: () => pctTotal / 100,
      });
    });

    // Totales IN y OUT sobre el combinado
    const udsIn  = volDistInbound.reduce((s, v)  => s + (v.unidades ?? 0), 0);
    const udsOut = volDistOutbound.reduce((s, v) => s + (v.unidades ?? 0), 0);
    const pctInTotal  = totalUnidadesCombinadas > 0 ? (udsIn  / totalUnidadesCombinadas) * 100 : 0;
    const pctOutTotal = totalUnidadesCombinadas > 0 ? (udsOut / totalUnidadesCombinadas) * 100 : 0;

    defs.push({
      token: 'VOLDIST_TOTAL_INBOUND',
      label: `Total IN sobre combinado (${pctInTotal.toFixed(2)}%)`,
      description: `Fracción decimal del % Inbound sobre el total combinado IN+OUT`,
      group: 'vol_distribucion',
      icon: 'ri-arrow-down-circle-line',
      tagColor: 'bg-emerald-100 text-emerald-700',
      computeValue: () => pctInTotal / 100,
    });

    defs.push({
      token: 'VOLDIST_TOTAL_OUTBOUND',
      label: `Total OUT sobre combinado (${pctOutTotal.toFixed(2)}%)`,
      description: `Fracción decimal del % Outbound sobre el total combinado IN+OUT`,
      group: 'vol_distribucion',
      icon: 'ri-arrow-up-circle-line',
      tagColor: 'bg-sky-100 text-sky-700',
      computeValue: () => pctOutTotal / 100,
    });

    // ── Variables por segmento Outbound ──
    volDistOutbound.forEach(vd => {
      const baseToken = vd.nombre.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
      const pct = vd.porcentaje_outbound ?? 0;

      // Token con prefijo OUT_ (legacy)
      defs.push({
        token: `VOLDIST_OUT_${baseToken}`,
        label: `Outbound: ${vd.nombre} (${pct.toFixed(2)}%)`,
        description: `Fracción decimal del % Outbound de "${vd.nombre}" (${pct.toFixed(2)}% ÷ 100 = ${(pct / 100).toFixed(4)})`,
        group: 'vol_distribucion',
        icon: 'ri-arrow-up-circle-line',
        tagColor: 'bg-sky-100 text-sky-700',
        computeValue: () => pct / 100,
      });

      // Token directo sin prefijo OUT_ (ej: VOLDIST_DESPACHO_NACIONALIZADO)
      defs.push({
        token: `VOLDIST_${baseToken}`,
        label: `Outbound: ${vd.nombre} (${pct.toFixed(2)}%)`,
        description: `Fracción decimal del % Outbound de "${vd.nombre}" (${pct.toFixed(2)}% ÷ 100 = ${(pct / 100).toFixed(4)})`,
        group: 'vol_distribucion',
        icon: 'ri-arrow-up-circle-line',
        tagColor: 'bg-sky-100 text-sky-700',
        computeValue: () => pct / 100,
      });
    });
  }

  // ── DISTRIBUCIÓN DE VOLUMEN AJUSTADA (sin zona franca) ──────────────────
  const volDistAjustada = volDistItems.filter(v => v.is_active && !v.es_zona_franca);
  const volDistAjustadaInbound  = volDistAjustada.filter(v => v.categoria === 'Inbound');
  const volDistAjustadaOutbound = volDistAjustada.filter(v => v.categoria === 'Outbound');

  if (volDistAjustada.length > 0 && volDistAjustada.length < volDistItems.length) {
    // ── Totales por categoría (ajustados) ──
    const totalUdsInAj  = volDistAjustadaInbound.reduce((s, v)  => s + (v.unidades ?? 0), 0);
    const totalUdsOutAj = volDistAjustadaOutbound.reduce((s, v) => s + (v.unidades ?? 0), 0);
    const totalUdsAj    = totalUdsInAj + totalUdsOutAj;

    defs.push({
      token: 'VOLDIST_AJUSTADA_INBOUND_TOTAL_PCT',
      label: 'Dist. Ajustada Inbound: Total (%)',
      description: 'Suma de % Inbound de segmentos activos SIN zona franca (fracción decimal)',
      group: 'vol_distribucion',
      icon: 'ri-arrow-down-circle-line',
      tagColor: 'bg-emerald-100 text-emerald-700',
      computeValue: () => volDistAjustadaInbound.reduce((s, v) => s + (v.porcentaje_inbound ?? 0), 0) / 100,
    });

    defs.push({
      token: 'VOLDIST_AJUSTADA_OUTBOUND_TOTAL_PCT',
      label: 'Dist. Ajustada Outbound: Total (%)',
      description: 'Suma de % Outbound de segmentos activos SIN zona franca (fracción decimal)',
      group: 'vol_distribucion',
      icon: 'ri-arrow-up-circle-line',
      tagColor: 'bg-sky-100 text-sky-700',
      computeValue: () => volDistAjustadaOutbound.reduce((s, v) => s + (v.porcentaje_outbound ?? 0), 0) / 100,
    });

    // ── Variables por segmento Inbound (ajustado) ──
    volDistAjustadaInbound.forEach(vd => {
      const baseToken = vd.nombre.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
      const pctIn = vd.porcentaje_inbound ?? 0;
      const udsInTotal = volDistAjustadaInbound.reduce((s, v) => s + (v.unidades ?? 0), 0);
      const pctInAjustado = udsInTotal > 0 ? ((vd.unidades ?? 0) / udsInTotal) * 100 : 0;

      defs.push({
        token: `VOLDIST_AJUSTADA_IN_${baseToken}`,
        label: `Inbound Ajustado: ${vd.nombre} (${pctInAjustado.toFixed(2)}%)`,
        description: `Fracción decimal del % Inbound AJUSTADO (sin zona franca) de "${vd.nombre}" (${pctInAjustado.toFixed(2)}% ÷ 100 = ${(pctInAjustado / 100).toFixed(4)})`,
        group: 'vol_distribucion',
        icon: 'ri-arrow-down-circle-line',
        tagColor: 'bg-lime-100 text-lime-700',
        computeValue: () => pctInAjustado / 100,
      });

      defs.push({
        token: `VOLDIST_AJUSTADA_${baseToken}`,
        label: `Ajustado: ${vd.nombre} (${pctInAjustado.toFixed(2)}%)`,
        description: `Fracción decimal del % AJUSTADO (sin zona franca) de "${vd.nombre}" según su categoría`,
        group: 'vol_distribucion',
        icon: vd.categoria === 'Inbound' ? 'ri-arrow-down-circle-line' : 'ri-arrow-up-circle-line',
        tagColor: 'bg-lime-100 text-lime-700',
        computeValue: () => pctInAjustado / 100,
      });
    });

    // ── Variables por segmento Outbound (ajustado) ──
    volDistAjustadaOutbound.forEach(vd => {
      const baseToken = vd.nombre.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
      const pctOut = vd.porcentaje_outbound ?? 0;
      const udsOutTotal = volDistAjustadaOutbound.reduce((s, v) => s + (v.unidades ?? 0), 0);
      const pctOutAjustado = udsOutTotal > 0 ? ((vd.unidades ?? 0) / udsOutTotal) * 100 : 0;

      defs.push({
        token: `VOLDIST_AJUSTADA_OUT_${baseToken}`,
        label: `Outbound Ajustado: ${vd.nombre} (${pctOutAjustado.toFixed(2)}%)`,
        description: `Fracción decimal del % Outbound AJUSTADO (sin zona franca) de "${vd.nombre}" (${pctOutAjustado.toFixed(2)}% ÷ 100 = ${(pctOutAjustado / 100).toFixed(4)})`,
        group: 'vol_distribucion',
        icon: 'ri-arrow-up-circle-line',
        tagColor: 'bg-lime-100 text-lime-700',
        computeValue: () => pctOutAjustado / 100,
      });

      defs.push({
        token: `VOLDIST_AJUSTADA_${baseToken}`,
        label: `Ajustado: ${vd.nombre} (${pctOutAjustado.toFixed(2)}%)`,
        description: `Fracción decimal del % AJUSTADO (sin zona franca) de "${vd.nombre}" según su categoría`,
        group: 'vol_distribucion',
        icon: vd.categoria === 'Inbound' ? 'ri-arrow-down-circle-line' : 'ri-arrow-up-circle-line',
        tagColor: 'bg-lime-100 text-lime-700',
        computeValue: () => pctOutAjustado / 100,
      });
    });

    // ── Variables TOTAL combinado IN+OUT (ajustado, sin zona franca) ─────
    volDistAjustada.forEach(vd => {
      const baseToken = vd.nombre.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
      const pctTotalAj = totalUdsAj > 0 ? ((vd.unidades ?? 0) / totalUdsAj) * 100 : 0;

      defs.push({
        token: `VOLDIST_AJUSTADA_TOTAL_${baseToken}`,
        label: `Total Ajustado: ${vd.nombre} (${pctTotalAj.toFixed(2)}%)`,
        description: `Fracción decimal del % de "${vd.nombre}" sobre el total combinado IN+OUT SIN zona franca (${pctTotalAj.toFixed(2)}% ÷ 100 = ${(pctTotalAj / 100).toFixed(4)})`,
        group: 'vol_distribucion',
        icon: vd.categoria === 'Inbound' ? 'ri-arrow-down-circle-line' : 'ri-arrow-up-circle-line',
        tagColor: 'bg-lime-100 text-lime-700',
        computeValue: () => pctTotalAj / 100,
      });
    });

    // Totales IN y OUT sobre el combinado ajustado
    const pctInTotalAj  = totalUdsAj > 0 ? (totalUdsInAj  / totalUdsAj) * 100 : 0;
    const pctOutTotalAj = totalUdsAj > 0 ? (totalUdsOutAj / totalUdsAj) * 100 : 0;

    defs.push({
      token: 'VOLDIST_AJUSTADA_TOTAL_INBOUND',
      label: `Total Ajustado IN sobre combinado (${pctInTotalAj.toFixed(2)}%)`,
      description: 'Fracción decimal del % Inbound sobre el total combinado IN+OUT SIN zona franca',
      group: 'vol_distribucion',
      icon: 'ri-arrow-down-circle-line',
      tagColor: 'bg-lime-100 text-lime-700',
      computeValue: () => pctInTotalAj / 100,
    });

    defs.push({
      token: 'VOLDIST_AJUSTADA_TOTAL_OUTBOUND',
      label: `Total Ajustado OUT sobre combinado (${pctOutTotalAj.toFixed(2)}%)`,
      description: 'Fracción decimal del % Outbound sobre el total combinado IN+OUT SIN zona franca',
      group: 'vol_distribucion',
      icon: 'ri-arrow-up-circle-line',
      tagColor: 'bg-lime-100 text-lime-700',
      computeValue: () => pctOutTotalAj / 100,
    });

    defs.push({
      token: 'VOLDIST_AJUSTADA_COMBINADO_TOTAL_PCT',
      label: `Total Combinado Ajustado (${totalUdsAj > 0 ? '100%' : '0%'})`,
      description: 'Siempre 1.0 si hay unidades ajustadas — representa el 100% del combinado IN+OUT sin zona franca',
      group: 'vol_distribucion',
      icon: 'ri-pie-chart-2-line',
      tagColor: 'bg-lime-100 text-lime-700',
      computeValue: () => totalUdsAj > 0 ? 1 : 0,
    });
  }

  // ── ÁREAS: M² Y RACKS ────────────────────────────────────────────────────
  defs.push({
    token: 'TOTAL_M2',
    label: 'Total M² (todas las áreas)',
    description: 'Suma de metros cuadrados de todas las áreas registradas',
    group: 'areas',
    icon: 'ri-layout-grid-line',
    tagColor: 'bg-orange-100 text-orange-700',
    computeValue: (d) => d.areasData.reduce((s, a) => s + (a.metros_cuadrados ?? 0), 0),
  });

  defs.push({
    token: 'TOTAL_M3',
    label: 'Total M³ (todas las áreas)',
    description: 'Suma de metros cúbicos de todas las áreas registradas',
    group: 'areas',
    icon: 'ri-box-3-line',
    tagColor: 'bg-orange-100 text-orange-700',
    computeValue: (d) => d.areasData.reduce((s, a) => s + (a.metros_cubicos ?? 0), 0),
  });

  defs.push({
    token: 'TOTAL_RACKS',
    label: 'Total Racks (todas las áreas)',
    description: 'Suma de cantidad de racks de todas las áreas registradas',
    group: 'areas',
    icon: 'ri-server-line',
    tagColor: 'bg-orange-100 text-orange-700',
    computeValue: (d) => d.areasData.reduce((s, a) => s + (a.cantidad_racks ?? 0), 0),
  });

  defs.push({
    token: 'M2_FILA',
    label: 'M² del área de la fila',
    description: 'Metros cuadrados del área que corresponde al subproceso de cada fila',
    group: 'areas',
    icon: 'ri-layout-grid-line',
    tagColor: 'bg-orange-100 text-orange-700',
    computeValue: (d, rowSubproceso) => findArea(d, rowSubproceso)?.metros_cuadrados ?? 0,
  });

  defs.push({
    token: 'M3_FILA',
    label: 'M³ del área de la fila',
    description: 'Metros cúbicos del área que corresponde al subproceso de cada fila. Devuelve 0 si el área no tiene m³ definido.',
    group: 'areas',
    icon: 'ri-box-3-line',
    tagColor: 'bg-orange-100 text-orange-700',
    computeValue: (d, rowSubproceso) => findArea(d, rowSubproceso)?.metros_cubicos ?? 0,
  });

  defs.push({
    token: 'RACKS_FILA',
    label: 'Racks del área de la fila',
    description: 'Cantidad de racks del área que corresponde al subproceso de cada fila',
    group: 'areas',
    icon: 'ri-server-line',
    tagColor: 'bg-orange-100 text-orange-700',
    computeValue: (d, rowSubproceso) => findArea(d, rowSubproceso)?.cantidad_racks ?? 0,
  });

  // ── COSTO DE ÁREA ────────────────────────────────────────────────────────
  defs.push({
    token: 'TOTAL_COSTO_AREA',
    label: 'Total Costo de Áreas',
    description: 'Suma del costo de todas las áreas (por fórmula o por tipo×m²)',
    group: 'areas',
    icon: 'ri-money-dollar-circle-line',
    tagColor: 'bg-orange-100 text-orange-700',
    computeValue: (d) => d.areasData.reduce((s, a) => s + (a.costo_area ?? 0), 0),
  });

  defs.push({
    token: 'COSTO_AREA_FILA',
    label: 'Costo del Área de la fila',
    description: 'Costo calculado del área que corresponde al subproceso de cada fila. Devuelve 0 si no hay área o no tiene costo definido.',
    group: 'areas',
    icon: 'ri-money-dollar-circle-line',
    tagColor: 'bg-orange-100 text-orange-700',
    computeValue: (d, rowSubproceso) => findArea(d, rowSubproceso)?.costo_area ?? 0,
  });

  // Per-area variables
  data.areasData.forEach(area => {
    const sanitized = sanitizeAreaToken(area.nombre);
    defs.push({
      token: `M2_${sanitized}`,
      label: `M²: ${area.nombre}`,
      description: `Metros cuadrados del área "${area.nombre}" (${area.metros_cuadrados ?? 0} m²)`,
      group: 'areas',
      icon: 'ri-layout-grid-line',
      tagColor: 'bg-orange-100 text-orange-700',
      computeValue: () => area.metros_cuadrados ?? 0,
    });

    if ((area.metros_cubicos ?? 0) > 0) {
      defs.push({
        token: `M3_${sanitized}`,
        label: `M³: ${area.nombre}`,
        description: `Metros cúbicos del área "${area.nombre}" (${area.metros_cubicos} m³)`,
        group: 'areas',
        icon: 'ri-box-3-line',
        tagColor: 'bg-orange-100 text-orange-700',
        computeValue: () => area.metros_cubicos ?? 0,
      });
    }

    if ((area.cantidad_racks ?? 0) > 0) {
      defs.push({
        token: `RACKS_${sanitized}`,
        label: `Racks: ${area.nombre}`,
        description: `Cantidad de racks del área "${area.nombre}" (${area.cantidad_racks})`,
        group: 'areas',
        icon: 'ri-server-line',
        tagColor: 'bg-orange-100 text-orange-700',
        computeValue: () => area.cantidad_racks ?? 0,
      });
    }

    if ((area.costo_area ?? 0) > 0) {
      defs.push({
        token: `COSTO_AREA_${sanitized}`,
        label: `Costo: ${area.nombre}`,
        description: `Costo calculado del área "${area.nombre}" (${(area.costo_area ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD)`,
        group: 'areas',
        icon: 'ri-money-dollar-circle-line',
        tagColor: 'bg-orange-100 text-orange-700',
        computeValue: () => area.costo_area ?? 0,
      });
    }
  });

  // ── FACTORES ───────────────────────────────────────────────────────────────
  const factores = data.factores ?? [];
  if (factores.length > 0) {
    factores.forEach(factor => {
      const token = `FACTOR_${factor.nombre.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`;
      defs.push({
        token,
        label: `Factor: ${factor.nombre}`,
        description: factor.descripcion || `Valor del factor "${factor.nombre}" (${factor.valor})`,
        group: 'factores',
        icon: 'ri-equalizer-line',
        tagColor: 'bg-amber-100 text-amber-700',
        computeValue: () => factor.valor ?? 0,
      });
    });
  }

  // ── VOLÚMENES MASIVOS (RAW) ───────────────────────────────────────────────
  const masivoArts = data.masivoArticulos ?? [];
  const masivoZons = data.masivoZonas ?? [];

  if (masivoArts.length > 0 || masivoZons.length > 0) {
    // ── Totales globales (desde SQL, no truncados) ──
    const totalMovMasivo = data.masivoTotals?.totalMovArticulos ?? masivoArts.reduce((s, r) => s + Number(r.movimientos), 0);
    const totalUnidMasivo = data.masivoTotals?.totalUnidArticulos ?? masivoArts.reduce((s, r) => s + Number(r.unidades), 0);
    const totalArts = data.masivoTotals?.totalArticulos ?? masivoArts.length;
    const totalMovZonas = data.masivoTotals?.totalMovZonas ?? masivoZons.reduce((s, r) => s + Number(r.movimientos), 0);
    const totalUnidZonas = data.masivoTotals?.totalUnidZonas ?? masivoZons.reduce((s, r) => s + Number(r.unidades), 0);
    const totalZonas = data.masivoTotals?.totalZonas ?? masivoZons.length;

    // Meses globales: usar el máximo de meses_distintos de artículos o zonas como mejor aproximación.
    // Si no hay datos de masivo, intentar inferir desde volúmenesColumnas (módulo Volúmenes regular).
    const mesesFromArts = masivoArts.length > 0 ? Math.max(...masivoArts.map(r => Number(r.meses_distintos) || 1)) : 0;
    const mesesFromZons = masivoZons.length > 0 ? Math.max(...masivoZons.map(r => Number(r.meses_distintos) || 1)) : 0;
    const mesesFromVolCols = data.volumenesColumnas?.length ?? 0;
    const mesesGlobal = Math.max(mesesFromArts, mesesFromZons, mesesFromVolCols, 1);

    // ── Variables globales ──
    defs.push({
      token: 'MASIVO_TOTAL_MOVIMIENTOS',
      label: 'Masivo: Total Movimientos',
      description: `Total de movimientos del archivo masivo cargado (${totalMovMasivo.toLocaleString('es-CO')})`,
      group: 'masivo',
      icon: 'ri-swap-line',
      tagColor: 'bg-slate-100 text-slate-700',
      computeValue: () => totalMovMasivo,
    });

    defs.push({
      token: 'MASIVO_TOTAL_UNIDADES',
      label: 'Masivo: Total Unidades',
      description: `Total de unidades del archivo masivo cargado (${totalUnidMasivo.toLocaleString('es-CO')})`,
      group: 'masivo',
      icon: 'ri-stack-line',
      tagColor: 'bg-slate-100 text-slate-700',
      computeValue: () => totalUnidMasivo,
    });

    defs.push({
      token: 'MASIVO_TOTAL_ARTICULOS',
      label: 'Masivo: Total Artículos Distintos',
      description: `Cantidad de artículos únicos en el archivo masivo (${totalArts.toLocaleString('es-CO')})`,
      group: 'masivo',
      icon: 'ri-price-tag-3-line',
      tagColor: 'bg-slate-100 text-slate-700',
      computeValue: () => totalArts,
    });

    defs.push({
      token: 'MASIVO_PROM_MOVIMIENTOS_MES',
      label: 'Masivo: Promedio Mov/Mes Global',
      description: `Promedio global de movimientos por mes = ${totalMovMasivo.toLocaleString('es-CO')} ÷ ${mesesGlobal} meses`,
      group: 'masivo',
      icon: 'ri-line-chart-line',
      tagColor: 'bg-slate-100 text-slate-700',
      computeValue: () => Math.round((totalMovMasivo / mesesGlobal) * 100) / 100,
    });

    defs.push({
      token: 'MASIVO_PROM_UNIDADES_MES',
      label: 'Masivo: Promedio Unid/Mes Global',
      description: `Promedio global de unidades por mes = ${totalUnidMasivo.toLocaleString('es-CO')} ÷ ${mesesGlobal} meses`,
      group: 'masivo',
      icon: 'ri-bar-chart-line',
      tagColor: 'bg-slate-100 text-slate-700',
      computeValue: () => Math.round((totalUnidMasivo / mesesGlobal) * 100) / 100,
    });

    // ── Totales globales de zonas (duplicados como alias útiles) ──
    defs.push({
      token: 'MASIVO_TOTAL_ZONAS',
      label: 'Masivo: Total Zonas',
      description: `Cantidad de zonas distintas (${totalZonas})`,
      group: 'masivo',
      icon: 'ri-map-pin-line',
      tagColor: 'bg-slate-100 text-slate-700',
      computeValue: () => totalZonas,
    });

    defs.push({
      token: 'MASIVO_TOTAL_MOV_ZONAS',
      label: 'Masivo: Total Movimientos (Zonas)',
      description: `Total movimientos sumado por zonas (${totalMovZonas.toLocaleString('es-CO')})`,
      group: 'masivo',
      icon: 'ri-swap-line',
      tagColor: 'bg-slate-100 text-slate-700',
      computeValue: () => totalMovZonas,
    });

    defs.push({
      token: 'MASIVO_TOTAL_UNID_ZONAS',
      label: 'Masivo: Total Unidades (Zonas)',
      description: `Total unidades sumado por zonas (${totalUnidZonas.toLocaleString('es-CO')})`,
      group: 'masivo',
      icon: 'ri-stack-line',
      tagColor: 'bg-slate-100 text-slate-700',
      computeValue: () => totalUnidZonas,
    });

    // ── Las variables por zona individual, por artículo y la matriz zona×artículo se omiten.
    // Solo se exponen los totales globales (MASIVO_TOTAL_*).
  }

  return defs;
}

// ── Calcula totales por fila de Costos de Operación (después de que el varMap base ya tenga todas las variables de otros módulos) ──
function calcularCostosTotales(
  data: AllDataSources,
  rowSubproceso: string | undefined,
  varMap: Record<string, number>,
): void {
  if (!data.costosColumnas?.length || !data.costosFilas?.length) return;

  const rowTotalCols = data.costosColumnas.filter(c =>
    c.tipo !== 'texto' && c.tipo !== 'select'
  );

  // Para cada fila de costos, calcular total evaluando fórmulas
  const filaTotals = new Map<string, { proceso: string; subproceso: string; total: number }>();

  data.costosFilas.forEach(row => {
    let total = 0;
    rowTotalCols.forEach(col => {
      if (col.tipo === 'formula') {
        // La fórmula puede estar en la fila (row.formulas[col.id]) o en la columna (col.formula)
        const f = (row as any).formulas?.[col.id] ?? (col as any).formula;
        if (f?.mode === 'expression' && f.expression?.trim()) {
          const result = evalFormula(f.expression, varMap);
          total += result.ok ? result.value : 0;
        }
      } else {
        const v = Number(row.valores?.[col.id] ?? 0);
        total += isNaN(v) ? 0 : v;
      }
    });

    const key = `${(row as any).proceso ?? ''}|${(row as any).subproceso ?? ''}`;
    if (!filaTotals.has(key)) {
      filaTotals.set(key, {
        proceso: (row as any).proceso ?? '',
        subproceso: (row as any).subproceso ?? '',
        total: 0,
      });
    }
    const entry = filaTotals.get(key)!;
    entry.total += total;
  });

  // Agregar tokens al varMap
  filaTotals.forEach(({ proceso, subproceso, total }) => {
    const procPart = sanitizeAreaToken(proceso);
    const spPart = sanitizeAreaToken(subproceso);
    const token = proceso ? `COSTOS_TOTAL_${procPart}_${spPart}` : `COSTOS_TOTAL_${spPart}`;
    varMap[token] = total;

    // Legacy token (solo subproceso)
    if (proceso) {
      const legacyToken = `COSTOS_TOTAL_${spPart}`;
      varMap[legacyToken] = total;
    }
  });

  // COSTOS_TOTAL_FILA: total de la fila cuyo subproceso coincide con rowSubproceso
  if (rowSubproceso) {
    const matchKey = [...filaTotals.keys()].find(k => {
      const [, sp] = k.split('|');
      return sp?.toLowerCase().trim() === rowSubproceso.toLowerCase().trim();
    });
    if (matchKey) {
      varMap['COSTOS_TOTAL_FILA'] = filaTotals.get(matchKey)!.total;
    } else {
      varMap['COSTOS_TOTAL_FILA'] = 0;
    }
  }
}

// ── Build flat token -> number map ───────────────────────────────────────────
export function buildVariableMap(
  defs: VariableDef[],
  data: AllDataSources,
  rowSubproceso?: string,
): Record<string, number> {
  const map: Record<string, number> = {};
  defs.forEach(def => {
    try {
      map[def.token] = def.computeValue(data, rowSubproceso);
    } catch {
      map[def.token] = 0;
    }
  });

  // Calcular totales de Costos de Operación después de que el varMap base esté poblado
  calcularCostosTotales(data, rowSubproceso, map);

  return map;
}

export const GROUP_META: Record<VarGroup, { label: string; icon: string; color: string }> = {
  inversiones:       { label: 'Inversiones',            icon: 'ri-building-2-line',          color: 'text-rose-600'    },
  gastos_varios:     { label: 'Gastos Varios',           icon: 'ri-receipt-line',             color: 'text-amber-600'   },
  mano_obra:         { label: 'Mano de Obra',            icon: 'ri-user-3-line',              color: 'text-teal-600'    },
  volumenes:         { label: 'Volúmenes',               icon: 'ri-bar-chart-box-line',       color: 'text-sky-600'     },
  costos:            { label: 'Costos de Operación',     icon: 'ri-money-dollar-circle-line', color: 'text-violet-600'  },
  distribucion:      { label: 'Distribución de Áreas (m²)',icon: 'ri-pie-chart-line',           color: 'text-emerald-600' },
  distribucion_cubica: { label: 'Distribución Cubica (m³)', icon: 'ri-box-3-line',              color: 'text-cyan-600'    },
  areas:             { label: 'Áreas (M² y Racks)',       icon: 'ri-layout-grid-line',        color: 'text-orange-600'  },
  vol_distribucion:  { label: 'Dist. de Volumen (Inbound / Outbound)', icon: 'ri-pie-chart-2-line', color: 'text-teal-600' },
  factores:          { label: 'Factores',                 icon: 'ri-equalizer-line',           color: 'text-amber-600'   },
  masivo:            { label: 'Vol. Masivos (Raw)',        icon: 'ri-database-2-line',           color: 'text-slate-600'   },
};
