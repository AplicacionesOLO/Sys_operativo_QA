/**
 * Formula Engine — supports both legacy "terms" mode and new "expression" mode.
 */
import type { FormulaConfig, FormulaTermino } from '@/types/costos';
import type { InversionRecord } from '@/types/inversion';
import { calcularInversion, esFinanciamiento } from '@/types/inversion';
import type { AllDataSources, AreaDistItem, AreaDataItem, VariableDef } from '@/lib/formulaVariables';
import type { EmpleadoImportado } from '@/types/mano_obra_empleados';
import { buildVariableDefs, buildVariableMap } from '@/lib/formulaVariables';
import { evalFormula } from '@/lib/mathEvaluator';

// ── Legacy context (kept for backward compat) ────────────────────────────────
export interface GastosVariosColumnaItem {
  id: string;
  nombre: string;
  tipo: string;
}

export interface GastosVariosFilaItem {
  id: string;
  area: string;
  valores: Record<string, string | number>;
}

export interface AreaDistribucionItem {
  area_name: string;
  global_distribution_percentage: number;
}

/**
 * Row-dependent variable tokens that need to be recomputed per subproceso.
 * These use the `rowSubproceso` parameter in their computeValue.
 */
const ROW_DEPENDENT_TOKENS = new Set([
  'DIST_FILA',
  'DIST_FILA_CAT',
  'DIST_CUBIC_FILA',
  'DIST_CUBIC_FILA_CAT',
  'M2_FILA',
  'M3_FILA',
  'RACKS_FILA',
  'COSTO_AREA_FILA',
  'COSTOS_TOTAL_FILA',
]);

/**
 * Extended FormulaContext — includes all data modules.
 * Backward-compatible with the old interface (old fields kept).
 */
export interface FormulaContext {
  // legacy fields
  inversiones: InversionRecord[];
  gastosColumnas: GastosVariosColumnaItem[];
  gastosFilas: GastosVariosFilaItem[];
  areaDistribucion: AreaDistribucionItem[];
  // ── Distribución por metros cúbicos ─────────────────────────────────────
  areaDistribucionCubic?: AreaDistribucionItem[];
  // extended fields (optional for backward compat)
  manoObraColumnas?: { id: string; nombre: string; tipo: string; is_sensitive?: boolean }[];
  manoObraFilas?: { id: string; valores: Record<string, string | number> }[];
  manoObraEmpleados?: EmpleadoImportado[];
  volumenesColumnas?: { id: string; nombre: string; tipo: string }[];
  volumenesFilas?: { id: string; valores: Record<string, string | number> }[];
  costosColumnas?: { id: string; nombre: string; tipo: string }[];
  costosFilas?: { id: string; valores: Record<string, string | number> }[];
  /** Areas with m² and rack data */
  areasData?: AreaDataItem[];
  /** Distribución de volumen personalizada */
  volDistribucion?: { id: string; nombre: string; porcentaje: number; porcentaje_inbound: number; porcentaje_outbound: number; categoria: string; is_active: boolean; unidades: number; es_zona_franca?: boolean }[];
  /** Factores registrados */
  factores?: { id: string; nombre: string; valor: number; descripcion?: string }[];
  /** Datos masivos de volúmenes (resumen por artículo) */
  masivoArticulos?: { articulo: string; descripcion: string; movimientos: number; unidades: number; meses_distintos: number; prom_movimientos_mes: number; prom_unidades_mes: number }[];
  /** Datos masivos de volúmenes (resumen por zona) */
  masivoZonas?: { zona: string; movimientos: number; unidades: number; articulos_distintos: number; meses_distintos: number; prom_movimientos_mes: number; prom_unidades_mes: number }[];
  /** Datos masivos: intersección zona × artículo (cada registro = un artículo en una zona específica) */
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
  // ── Formula cache — precomputed once, shared across all formula evaluations ──
  /** Precomputed variable definitions (expensive, computed once) */
  _cachedDefs?: VariableDef[];
  /** Precomputed base varMap without rowSubproceso */
  _cachedBaseVarMap?: Record<string, number>;
  /** AllDataSources snapshot used to build the cache */
  _cachedAllData?: AllDataSources;
}

export const EMPTY_FORMULA_CTX: FormulaContext = {
  inversiones: [],
  gastosColumnas: [],
  gastosFilas: [],
  areaDistribucion: [],
  areaDistribucionCubic: [],
  manoObraColumnas: [],
  manoObraFilas: [],
  volumenesColumnas: [],
  volumenesFilas: [],
  costosColumnas: [],
  costosFilas: [],
  areasData: [],
  volDistribucion: [],
  factores: [],
  masivoArticulos: [],
  masivoZonas: [],
  masivoZonaArticulos: [],
  masivoTotals: undefined,
};

// ── Convert FormulaContext to AllDataSources ──────────────────────────────────
export function toAllDataSources(ctx: FormulaContext): AllDataSources {
  // Use cached snapshot if available
  if (ctx._cachedAllData) return ctx._cachedAllData;

  return {
    inversiones: ctx.inversiones,
    gastosColumnas: ctx.gastosColumnas,
    gastosFilas: ctx.gastosFilas as AllDataSources['gastosFilas'],
    manoObraColumnas: ctx.manoObraColumnas ?? [],
    manoObraFilas: (ctx.manoObraFilas ?? []) as AllDataSources['manoObraFilas'],
    manoObraEmpleados: ctx.manoObraEmpleados ?? [],
    volumenesColumnas: ctx.volumenesColumnas ?? [],
    volumenesFilas: (ctx.volumenesFilas ?? []) as AllDataSources['volumenesFilas'],
    costosColumnas: ctx.costosColumnas ?? [],
    costosFilas: (ctx.costosFilas ?? []) as AllDataSources['costosFilas'],
    areaDistribucion: ctx.areaDistribucion as AreaDistItem[],
    areasData: (ctx.areasData ?? []) as AreaDataItem[],
    volDistribucion: ctx.volDistribucion ?? [],
    factores: ctx.factores ?? [],
    masivoArticulos: ctx.masivoArticulos ?? [],
    masivoZonas: ctx.masivoZonas ?? [],
    masivoZonaArticulos: ctx.masivoZonaArticulos ?? [],
    masivoTotals: ctx.masivoTotals,
  };
}

// ── Monthly depreciation helper (exported for FormulaBuilder) ────────────────
export function getMonthlyDepreciacion(inv: InversionRecord): number {
  if (esFinanciamiento(inv.tipo)) return 0;
  const n = Math.max(inv.rango ?? 0, 0);
  const valor = Math.max(inv.valor_inicial ?? 0, 0);
  if (inv.metodo_depreciacion === 'tiempo') {
    const meses = inv.unidad_rango === 'años' ? n * 12 : n;
    return meses > 0 ? valor / meses : 0;
  }
  return valor * ((inv.tasa_depreciacion ?? 0) / 100) / 12;
}

// ── Distribution factor helper ────────────────────────────────────────────────
export function getDistribucionFactor(areaName: string, ctx: FormulaContext): number {
  if (!areaName?.trim()) return 0;
  const dist = ctx.areaDistribucion.find(
    d => d.area_name?.toLowerCase().trim() === areaName.toLowerCase().trim()
  );
  return dist ? (dist.global_distribution_percentage ?? 0) / 100 : 0;
}

// ── LEGACY: Term-based formula computation ───────────────────────────────────
function computeBaseValue(
  termino: FormulaTermino,
  ctx: FormulaContext,
  rowSubproceso: string,
): number {
  switch (termino.tipo) {
    case 'inversion_depreciacion': {
      const inv = ctx.inversiones.find(i => i.id === termino.referenciaId);
      return inv ? getMonthlyDepreciacion(inv) : 0;
    }
    case 'inversion_pago_mensual': {
      const inv = ctx.inversiones.find(i => i.id === termino.referenciaId);
      return inv ? calcularInversion(inv).cuota_mensual : 0;
    }
    case 'gastos_varios_columna': {
      let rows = ctx.gastosFilas;
      if (termino.filtrarPorArea && rowSubproceso) {
        rows = rows.filter(
          r => (r as GastosVariosFilaItem).area?.toLowerCase().trim() === rowSubproceso.toLowerCase().trim()
        );
      }
      return rows.reduce((sum, r) => {
        const v = Number((r as GastosVariosFilaItem).valores?.[termino.referenciaId] ?? 0);
        return sum + (isNaN(v) ? 0 : v);
      }, 0);
    }
    default:
      return 0;
  }
}

function calcularFormulaTerminos(
  formula: FormulaConfig,
  ctx: FormulaContext,
  rowSubproceso: string,
): number {
  if (!formula.terminos?.length) return 0;
  return formula.terminos.reduce((total, termino) => {
    const base = computeBaseValue(termino, ctx, rowSubproceso);
    let distribFactor = 1;
    if (termino.aplicarDistribucion) {
      const areaName =
        termino.areaFuente === 'subproceso_fila'
          ? rowSubproceso
          : (termino.areaFuente ?? '');
      distribFactor = getDistribucionFactor(areaName, ctx);
    }
    return total + base * (termino.factor ?? 1) * distribFactor;
  }, 0);
}

// ── EXPRESSION: new mode ──────────────────────────────────────────────────────
function calcularFormulaExpression(
  formula: FormulaConfig,
  ctx: FormulaContext,
  rowSubproceso: string,
): number {
  if (!formula.expression?.trim()) return 0;

  // ── Use precomputed cache if available (massive performance boost) ──
  if (ctx._cachedDefs && ctx._cachedBaseVarMap && ctx._cachedAllData) {
    // Start from the cached base varMap (without rowSubproceso)
    const varMap = { ...ctx._cachedBaseVarMap };

    // Patch only row-dependent tokens that are actually used in the expression
    const usedTokens = extractTokensFromExpression(formula.expression);
    for (const token of usedTokens) {
      if (ROW_DEPENDENT_TOKENS.has(token)) {
        const def = ctx._cachedDefs.find(d => d.token === token);
        if (def) {
          try {
            varMap[token] = def.computeValue(ctx._cachedAllData, rowSubproceso);
          } catch {
            varMap[token] = 0;
          }
        }
      }
    }

    const result = evalFormula(formula.expression, varMap);
    return result.ok ? result.value : 0;
  }

  // ── Fallback: full recompute (legacy path, no cache available) ──
  const data = toAllDataSources(ctx);
  const defs = buildVariableDefs(data);
  const varMap = buildVariableMap(defs, data, rowSubproceso);
  const result = evalFormula(formula.expression, varMap);
  return result.ok ? result.value : 0;
}

/** Extract all {TOKEN} references from a formula expression */
function extractTokensFromExpression(expression: string): string[] {
  const tokens: string[] = [];
  const regex = /\{([^}]+)\}/g;
  let match;
  while ((match = regex.exec(expression)) !== null) {
    tokens.push(match[1]);
  }
  return tokens;
}

// ── Main dispatcher ───────────────────────────────────────────────────────────
export function calcularFormula(
  formula: FormulaConfig | undefined,
  ctx: FormulaContext,
  rowSubproceso: string,
): number {
  if (!formula) return 0;
  const mode = formula.mode ?? 'terms';
  if (mode === 'expression') return calcularFormulaExpression(formula, ctx, rowSubproceso);
  return calcularFormulaTerminos(formula, ctx, rowSubproceso);
}

// ── Build variable map for UI preview ─────────────────────────────────────────
export function buildFormulaVarMap(
  ctx: FormulaContext,
  rowSubproceso?: string,
): Record<string, number> {
  const data = toAllDataSources(ctx);
  const defs = buildVariableDefs(data);
  return buildVariableMap(defs, data, rowSubproceso);
}

// ── Human readable description ────────────────────────────────────────────────
const TIPO_LABELS: Record<FormulaTermino['tipo'], string> = {
  inversion_depreciacion: 'Deprec.',
  inversion_pago_mensual: 'Pago',
  gastos_varios_columna:  'Gastos',
};

export function getFormulaDescription(formula: FormulaConfig | undefined): string {
  if (!formula) return 'Sin fórmula';
  if (formula.mode === 'expression') {
    return formula.expression?.trim() ? formula.expression : 'Sin expresión';
  }
  if (!formula.terminos?.length) return 'Sin términos definidos';
  return formula.terminos
    .map(t => {
      const label = TIPO_LABELS[t.tipo];
      const dist = t.aplicarDistribucion
        ? ` × Dist.${t.areaFuente === 'subproceso_fila' ? 'Área' : t.areaFuente}`
        : t.filtrarPorArea
          ? ' (filtrado por área)'
          : '';
      const factor = t.factor !== 1 ? ` × ${t.factor}` : '';
      return `${label}: ${t.referenciaNombre}${factor}${dist}`;
    })
    .join(' + ');
}
