/**
 * Motor de cálculo seguro para fórmulas de columnas dinámicas de cotizaciones.
 * NO usa eval() — implementa un parser/evaluador propio de expresiones matemáticas.
 *
 * Principios:
 * - Fuente única de verdad: las variables disponibles se derivan siempre de las columnas activas + campos base.
 * - Evaluación por fila (row-level scope): cada cálculo usa únicamente los datos de esa fila.
 * - Orden de cálculo: una columna solo puede usar variables de columnas con menor sort_order.
 * - Validación estricta: variables desconocidas, dependencias circulares y forward-references son rechazadas.
 * - Reemplazo seguro de tokens: al renombrar una key, se actualiza en todas las fórmulas sin afectar palabras similares.
 */
import type { CotizacionColumnaDinamica, DetalleConValores } from '@/types/cotizaciones_v2';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface FormulaVarContext {
  costo_base: number;
  multiplicador: number;
  cantidad_unidades: number;
  cantidad_lineas: number;
  subtotal_item: number;
  total_item: number;
  [key: string]: number;
}

export interface FormulaValidationResult {
  valid: boolean;
  error?: string;
  usedVars: string[];
}

export interface FormulaEvalResult {
  ok: boolean;
  value: number;
  error?: string;
}

export interface VarDef {
  key: string;
  label: string;
  description: string;
  isBase?: boolean;
}

// ─── Variables base del sistema ───────────────────────────────────────────────

export const BASE_VARS: VarDef[] = [
  { key: 'costo_base',       label: 'Costo base',          description: 'Costo base de la fila',                    isBase: true },
  { key: 'multiplicador',    label: 'Multiplicador',        description: 'Multiplicador de la fila',                 isBase: true },
  { key: 'cantidad_unidades',label: 'Cantidad de unidades', description: 'Alias de multiplicador (cantidad de unidades)', isBase: true },
  { key: 'cantidad_lineas',  label: 'Cantidad de líneas',   description: 'Número de líneas/ítems en la cotización',  isBase: true },
  { key: 'subtotal_item',    label: 'Subtotal ítem',        description: 'costo_base × multiplicador',               isBase: true },
  { key: 'total_item',       label: 'Costo Total',          description: 'Costo Total de la fila (suma de costo_base + todas las columnas dinámicas)', isBase: true },
];

export const BASE_VAR_KEYS = new Set(BASE_VARS.map(v => v.key));

// ─── Fuente única de verdad: getAvailableVariables ────────────────────────────

/**
 * Retorna las variables disponibles para una columna según su sort_order.
 * - Para columnas intermedias: variables base + columnas activas con sort_order < currentSortOrder.
 * - Para el Costo Total (currentSortOrder = Infinity): variables base + TODAS las columnas activas.
 * - Excluye la columna actual (currentKey) para evitar auto-referencia.
 * - Solo incluye columnas numéricas (no texto/display_only sin fórmula).
 */
export function getAvailableVariables(
  columnasDinamicas: CotizacionColumnaDinamica[],
  currentSortOrder: number,
  currentKey?: string,
): VarDef[] {
  const isForTotal = currentSortOrder === Infinity;

  // Keys de columnas dinámicas activas que colisionan con base vars
  // Estas columnas SOBREESCRIBEN la base var con su valor real de fila
  const dynKeySet = new Set(
    columnasDinamicas
      .filter(c => c.is_active && c.key !== currentKey)
      .map(c => c.key)
  );

  const dynVars: VarDef[] = columnasDinamicas
    .filter(c => {
      if (!c.is_active) return false;
      if (c.key === currentKey) return false;
      if (!isForTotal && c.sort_order >= currentSortOrder) return false;
      // Solo columnas numéricas (no texto puro sin efecto)
      if (c.effect_type === 'display_only' && c.data_type === 'text') return false;
      return true;
    })
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(c => ({
      key: c.key,
      label: c.name,
      description: `Columna: ${c.name}${
        c.effect_type === 'formula'      ? ' (fórmula)' :
        c.effect_type === 'add'          ? ' (suma)' :
        c.effect_type === 'subtract'     ? ' (resta)' :
        c.effect_type === 'multiply'     ? ' (multiplica)' :
        c.effect_type === 'display_only' ? ' (visualización)' : ''
      }`,
      isBase: false,
    }));

  // Las base vars que NO están siendo sobreescritas por una columna dinámica
  const filteredBase = BASE_VARS.filter(v => !dynKeySet.has(v.key));

  // Columnas dinámicas van primero (las que colisionan reemplazan la base var)
  return [...filteredBase, ...dynVars];
}

/**
 * Retorna SOLO las columnas dinámicas activas como variables disponibles.
 * Usado para la fórmula del Costo Total: el usuario solo debe poder usar
 * los valores de las columnas dinámicas que ya creó, no las variables base.
 */
export function getDynamicColumnVariables(
  columnasDinamicas: CotizacionColumnaDinamica[],
): VarDef[] {
  return columnasDinamicas
    .filter(c => {
      if (!c.is_active) return false;
      // Solo columnas numéricas (no texto puro sin efecto)
      if (c.effect_type === 'display_only' && c.data_type === 'text') return false;
      // Excluir columnas que colisionan con variables base del sistema
      if (BASE_VAR_KEYS.has(c.key)) return false;
      return true;
    })
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(c => ({
      key: c.key,
      label: c.name,
      description: `Columna: ${c.name}${
        c.effect_type === 'formula'      ? ' (fórmula)' :
        c.effect_type === 'add'          ? ' (suma)' :
        c.effect_type === 'subtract'     ? ' (resta)' :
        c.effect_type === 'multiply'     ? ' (multiplica)' :
        c.effect_type === 'display_only' ? ' (visualización)' : ''
      }`,
      isBase: false,
    }));
}

/** @deprecated use getAvailableVariables */
export const getAvailableVarsForColumn = getAvailableVariables;

// ─── Tokenizer ────────────────────────────────────────────────────────────────

type TokenType = 'NUMBER' | 'IDENT' | 'OP' | 'LPAREN' | 'RPAREN' | 'EOF';

interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(expr[i + 1] ?? ''))) {
      let num = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) num += expr[i++];
      tokens.push({ type: 'NUMBER', value: num, pos: i - num.length });
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let ident = '';
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) ident += expr[i++];
      tokens.push({ type: 'IDENT', value: ident, pos: i - ident.length });
      continue;
    }
    if (['+', '-', '*', '/'].includes(ch)) {
      tokens.push({ type: 'OP', value: ch, pos: i++ });
      continue;
    }
    if (ch === '(') { tokens.push({ type: 'LPAREN', value: '(', pos: i++ }); continue; }
    if (ch === ')') { tokens.push({ type: 'RPAREN', value: ')', pos: i++ }); continue; }
    throw new Error(`Carácter no permitido: "${ch}" en posición ${i}`);
  }
  tokens.push({ type: 'EOF', value: '', pos: i });
  return tokens;
}

// ─── Parser recursivo descendente ────────────────────────────────────────────

class Parser {
  private tokens: Token[];
  private pos = 0;
  public usedVars: string[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token { return this.tokens[this.pos]; }
  private consume(): Token { return this.tokens[this.pos++]; }

  parse(vars: Record<string, number>): number {
    const result = this.parseExpr(vars);
    if (this.peek().type !== 'EOF') {
      throw new Error(`Token inesperado: "${this.peek().value}"`);
    }
    return result;
  }

  private parseExpr(vars: Record<string, number>): number {
    let left = this.parseTerm(vars);
    while (this.peek().type === 'OP' && ['+', '-'].includes(this.peek().value)) {
      const op = this.consume().value;
      const right = this.parseTerm(vars);
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  private parseTerm(vars: Record<string, number>): number {
    let left = this.parseUnary(vars);
    while (this.peek().type === 'OP' && ['*', '/'].includes(this.peek().value)) {
      const op = this.consume().value;
      const right = this.parseUnary(vars);
      if (op === '/' && right === 0) throw new Error('División por cero');
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }

  private parseUnary(vars: Record<string, number>): number {
    if (this.peek().type === 'OP' && this.peek().value === '-') {
      this.consume();
      return -this.parsePrimary(vars);
    }
    if (this.peek().type === 'OP' && this.peek().value === '+') {
      this.consume();
    }
    return this.parsePrimary(vars);
  }

  private parsePrimary(vars: Record<string, number>): number {
    const tok = this.peek();
    if (tok.type === 'NUMBER') {
      this.consume();
      return parseFloat(tok.value);
    }
    if (tok.type === 'IDENT') {
      this.consume();
      if (!(tok.value in vars)) {
        throw new Error(`Variable no válida: "${tok.value}"`);
      }
      if (!this.usedVars.includes(tok.value)) this.usedVars.push(tok.value);
      return vars[tok.value];
    }
    if (tok.type === 'LPAREN') {
      this.consume();
      const val = this.parseExpr(vars);
      if (this.peek().type !== 'RPAREN') throw new Error('Falta paréntesis de cierre ")"');
      this.consume();
      return val;
    }
    throw new Error(`Token inesperado: "${tok.value}"`);
  }
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Evalúa una expresión de fórmula de forma segura.
 * Retorna { ok: true, value } o { ok: false, error }.
 */
export function evalCotizacionFormula(
  expression: string,
  vars: Record<string, number>,
): FormulaEvalResult {
  if (!expression?.trim()) return { ok: false, value: 0, error: 'Expresión vacía' };
  try {
    const tokens = tokenize(expression.trim());
    const parser = new Parser(tokens);
    const value = parser.parse(vars);
    if (!isFinite(value)) return { ok: false, value: 0, error: 'Resultado no finito' };
    return { ok: true, value };
  } catch (e) {
    return { ok: false, value: 0, error: (e as Error).message };
  }
}

/**
 * Valida una expresión de fórmula contra un conjunto de variables permitidas.
 * Detecta variables inexistentes, auto-referencias y dependencias no permitidas.
 */
export function validateFormulaExpression(
  expression: string,
  allowedVars: string[],
  currentColKey?: string,
): FormulaValidationResult {
  if (!expression?.trim()) return { valid: false, error: 'La expresión está vacía', usedVars: [] };
  try {
    const mockVars: Record<string, number> = {};
    allowedVars.forEach(v => { mockVars[v] = 1; });
    const tokens = tokenize(expression.trim());
    const parser = new Parser(tokens);
    parser.parse(mockVars);
    const usedVars = parser.usedVars;

    // Detectar referencia a sí misma
    if (currentColKey && usedVars.includes(currentColKey)) {
      return { valid: false, error: `La columna no puede referenciarse a sí misma ("${currentColKey}")`, usedVars };
    }

    // Detectar variables no permitidas
    const unknown = usedVars.filter(v => !allowedVars.includes(v));
    if (unknown.length > 0) {
      return { valid: false, error: `Variable no válida: ${unknown.map(v => `"${v}"`).join(', ')}`, usedVars };
    }

    return { valid: true, usedVars };
  } catch (e) {
    return { valid: false, error: (e as Error).message, usedVars: [] };
  }
}

/**
 * Extrae todas las variables (identificadores) usadas en una expresión.
 * No valida — solo extrae tokens IDENT.
 */
export function extractVarsFromExpression(expression: string): string[] {
  if (!expression?.trim()) return [];
  try {
    const tokens = tokenize(expression.trim());
    return tokens.filter(t => t.type === 'IDENT').map(t => t.value);
  } catch {
    return [];
  }
}

/**
 * Reemplaza de forma segura un token (variable) en una expresión de fórmula.
 * El reemplazo es exacto: solo reemplaza el token completo, no substrings.
 * Ejemplo: renombrar "costo_linea" → "costo_unitario" no afecta "costo_linea_extra".
 */
export function replaceVarInExpression(
  expression: string,
  oldKey: string,
  newKey: string,
): string {
  if (!expression?.trim() || !oldKey || !newKey || oldKey === newKey) return expression;
  // Reemplaza solo tokens completos: precedido y seguido por no-identificador
  const escaped = oldKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(?<![a-zA-Z0-9_])${escaped}(?![a-zA-Z0-9_])`, 'g');
  return expression.replace(regex, newKey);
}

/**
 * Verifica si una expresión usa una variable específica (token exacto).
 */
export function expressionUsesVar(expression: string, varKey: string): boolean {
  if (!expression?.trim()) return false;
  const vars = extractVarsFromExpression(expression);
  return vars.includes(varKey);
}

/**
 * Detecta dependencias circulares entre columnas dinámicas.
 * Retorna true si hay ciclo.
 */
export function detectCircularDependency(
  columnas: CotizacionColumnaDinamica[],
  targetId: string,
  newExpression: string,
): boolean {
  // Build dependency graph
  const deps = new Map<string, string[]>();
  columnas.forEach(c => {
    if (c.formula_expression) {
      deps.set(c.key, extractVarsFromExpression(c.formula_expression).filter(v => !BASE_VAR_KEYS.has(v)));
    }
  });

  const targetCol = columnas.find(c => c.id === targetId);
  if (!targetCol) return false;

  // Temporarily set the new expression
  const newDeps = extractVarsFromExpression(newExpression).filter(v => !BASE_VAR_KEYS.has(v));
  deps.set(targetCol.key, newDeps);

  // DFS cycle detection
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function hasCycle(key: string): boolean {
    if (inStack.has(key)) return true;
    if (visited.has(key)) return false;
    visited.add(key);
    inStack.add(key);
    for (const dep of deps.get(key) ?? []) {
      if (hasCycle(dep)) return true;
    }
    inStack.delete(key);
    return false;
  }

  return hasCycle(targetCol.key);
}

/**
 * Construye el contexto de variables para una fila de cotización.
 * Evaluación por fila (row-level scope): solo datos de esa fila.
 *
 * @param detalle - La fila de cotización
 * @param columnasDinamicas - Todas las columnas dinámicas
 * @param currentColSortOrder - sort_order de la columna actual (Infinity para el total)
 * @param globalMultiplier - Multiplicador global (default 1)
 * @param totalLineas - Número total de líneas en la cotización (para cantidad_lineas)
 */
export function buildRowVarContext(
  detalle: DetalleConValores,
  columnasDinamicas: CotizacionColumnaDinamica[],
  currentColSortOrder: number,
  globalMultiplier = 1,
  totalLineas = 1,
): FormulaVarContext {
  const subtotal = detalle.costo_base * detalle.multiplicador_base;
  const ctx: FormulaVarContext = {
    costo_base:        detalle.costo_base,
    multiplicador:     detalle.multiplicador_base,
    cantidad_unidades: detalle.multiplicador_base,
    cantidad_lineas:   totalLineas,
    subtotal_item:     subtotal,
    total_item:        subtotal,
  };

  const isForTotal = currentColSortOrder === Infinity;

  const cols = columnasDinamicas
    .filter(c => c.is_active && (isForTotal ? true : c.sort_order < currentColSortOrder))
    .sort((a, b) => a.sort_order - b.sort_order);

  let runningTotal = subtotal;

  cols.forEach(col => {
    const val = detalle.valores[col.id];
    const raw = parseFloat(val?.raw_value ?? '0') || 0;

    if (col.effect_type === 'formula' && col.formula_expression) {
      const result = evalCotizacionFormula(col.formula_expression, { ...ctx });
      const computed = result.ok ? result.value : 0;
      // La columna dinámica siempre sobreescribe (incluso si colisiona con base var)
      // porque es un dato real ingresado por el usuario para esa fila
      ctx[col.key] = computed;
      runningTotal += computed;
    } else {
      // El raw_value de la columna dinámica sobreescribe la base var
      // Ej: si hay una columna "Cantidad Lineas" con key="cantidad_lineas",
      // su valor real (17361) reemplaza el count de filas del sistema
      ctx[col.key] = raw;
      if (col.effect_type === 'add')           runningTotal += raw;
      else if (col.effect_type === 'subtract') runningTotal -= raw;
      else if (col.effect_type === 'multiply') runningTotal *= raw || 1;
      // display_only: no afecta el total pero sí está disponible como variable
    }
    ctx.total_item = runningTotal;
  });

  ctx.total_item = runningTotal * globalMultiplier;
  return ctx;
}

/**
 * Calcula el total final de una fila procesando todas las columnas dinámicas.
 * Si se provee totalFormula, la usa en lugar del cálculo estándar.
 */
export function computeRowTotal(
  detalle: DetalleConValores,
  columnasDinamicas: CotizacionColumnaDinamica[],
  globalMultiplier = 1,
  totalFormula?: string,
  totalLineas = 1,
): number {
  if (totalFormula?.trim()) {
    const varCtx = buildRowVarContext(detalle, columnasDinamicas, Infinity, globalMultiplier, totalLineas);
    const result = evalCotizacionFormula(totalFormula, varCtx);
    if (result.ok) return result.value;
  }

  const activeCols = columnasDinamicas
    .filter(c => c.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);

  let total = detalle.costo_base * detalle.multiplicador_base;

  activeCols.forEach(col => {
    if (col.effect_type === 'formula' && col.formula_expression) {
      const varCtx = buildRowVarContext(detalle, columnasDinamicas, col.sort_order, 1, totalLineas);
      const result = evalCotizacionFormula(col.formula_expression, varCtx);
      if (result.ok) total += result.value;
    } else {
      const val = detalle.valores[col.id];
      const raw = parseFloat(val?.raw_value ?? '0') || 0;
      if (col.effect_type === 'add')           total += raw;
      else if (col.effect_type === 'subtract') total -= raw;
      else if (col.effect_type === 'multiply') total *= raw || 1;
    }
  });

  return total * globalMultiplier;
}

/**
 * Detecta qué columnas dinámicas usan una variable específica en sus fórmulas.
 * Útil para advertir antes de eliminar o renombrar una columna.
 */
export function findColumnsUsingVar(
  columnas: CotizacionColumnaDinamica[],
  varKey: string,
): CotizacionColumnaDinamica[] {
  return columnas.filter(c =>
    c.formula_expression && expressionUsesVar(c.formula_expression, varKey)
  );
}

/**
 * Actualiza todas las fórmulas de columnas dinámicas cuando una key cambia.
 * Retorna un mapa de { columnaId → nuevaExpresión } para las columnas afectadas.
 */
export function syncKeyRenameInFormulas(
  columnas: CotizacionColumnaDinamica[],
  oldKey: string,
  newKey: string,
): Map<string, string> {
  const updates = new Map<string, string>();
  columnas.forEach(c => {
    if (!c.formula_expression) return;
    const updated = replaceVarInExpression(c.formula_expression, oldKey, newKey);
    if (updated !== c.formula_expression) {
      updates.set(c.id, updated);
    }
  });
  return updates;
}
