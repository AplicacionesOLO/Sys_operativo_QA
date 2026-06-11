/**
 * Formula Token Rename Cascade
 *
 * When a record is renamed (area, factor, costos row, etc.) its token changes.
 * This utility finds every formula expression that references the old token
 * and replaces it with the new token — silently, in the background.
 *
 * Tables scanned:
 *   - costos_columnas.formula          (JSONB → expression)
 *   - costos_operacion.formulas        (JSONB map of FormulaConfig per column)
 *   - cotizacion_columnas_dinamicas.formula_expression  (TEXT)
 *   - cotizacion_cabecera.total_formula (TEXT)
 */
import { supabase } from './supabase';
import { sanitizeAreaToken } from './formulaVariables';

export { sanitizeAreaToken };

// ── Core replacer ─────────────────────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replace exact token references in a single expression string. */
function replaceTokens(expression: string, pairs: { oldToken: string; newToken: string }[]): string {
  let result = expression;
  for (const { oldToken, newToken } of pairs) {
    if (oldToken === newToken) continue;
    result = result.replace(new RegExp(`\\{${escapeRegex(oldToken)}\\}`, 'g'), `{${newToken}}`);
  }
  return result;
}

// ── Table updaters ────────────────────────────────────────────────────────────

async function patchCostosColumnas(pairs: { oldToken: string; newToken: string }[]): Promise<void> {
  const { data } = await supabase.from('costos_columnas').select('id, formula');
  for (const row of data ?? []) {
    const expr = row.formula?.expression;
    if (!expr) continue;
    const newExpr = replaceTokens(expr, pairs);
    if (newExpr !== expr) {
      await supabase
        .from('costos_columnas')
        .update({ formula: { ...row.formula, expression: newExpr } })
        .eq('id', row.id);
    }
  }
}

async function patchCostosOperacion(pairs: { oldToken: string; newToken: string }[]): Promise<void> {
  const { data } = await supabase.from('costos_operacion').select('id, formulas');
  for (const row of data ?? []) {
    if (!row.formulas) continue;
    let changed = false;
    const newFormulas: Record<string, unknown> = {};
    for (const [colId, formula] of Object.entries(row.formulas as Record<string, { expression?: string; [k: string]: unknown }>)) {
      if (!formula?.expression) { newFormulas[colId] = formula; continue; }
      const newExpr = replaceTokens(formula.expression, pairs);
      if (newExpr !== formula.expression) { changed = true; newFormulas[colId] = { ...formula, expression: newExpr }; }
      else { newFormulas[colId] = formula; }
    }
    if (changed) {
      await supabase.from('costos_operacion').update({ formulas: newFormulas }).eq('id', row.id);
    }
  }
}

async function patchCotizacionColumnas(pairs: { oldToken: string; newToken: string }[]): Promise<void> {
  const { data } = await supabase.from('cotizacion_columnas_dinamicas').select('id, formula_expression');
  for (const row of data ?? []) {
    if (!row.formula_expression) continue;
    const newExpr = replaceTokens(row.formula_expression, pairs);
    if (newExpr !== row.formula_expression) {
      await supabase.from('cotizacion_columnas_dinamicas').update({ formula_expression: newExpr }).eq('id', row.id);
    }
  }
}

async function patchCotizacionCabecera(pairs: { oldToken: string; newToken: string }[]): Promise<void> {
  const { data } = await supabase.from('cotizacion_cabecera').select('id, total_formula');
  for (const row of data ?? []) {
    if (!row.total_formula) continue;
    const newExpr = replaceTokens(row.total_formula, pairs);
    if (newExpr !== row.total_formula) {
      await supabase.from('cotizacion_cabecera').update({ total_formula: newExpr }).eq('id', row.id);
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget rename cascade.
 * Scans all formula tables and replaces old tokens with new tokens.
 * Never throws — errors are silently swallowed.
 */
export function cascadeRenameTokens(pairs: { oldToken: string; newToken: string }[]): void {
  const activePairs = pairs.filter(p => p.oldToken !== p.newToken);
  if (activePairs.length === 0) return;

  (async () => {
    try {
      await Promise.all([
        patchCostosColumnas(activePairs),
        patchCostosOperacion(activePairs),
        patchCotizacionColumnas(activePairs),
        patchCotizacionCabecera(activePairs),
      ]);
    } catch {
      // silent — rename cascade must never break the app
    }
  })();
}

// ── Token pair builders per entity type ──────────────────────────────────────

/** Area renamed → all area-derived token pairs. */
export function areaRenamePairs(
  oldName: string,
  newName: string,
): { oldToken: string; newToken: string }[] {
  if (!oldName || !newName || oldName === newName) return [];
  const o = sanitizeAreaToken(oldName);
  const n = sanitizeAreaToken(newName);
  if (o === n) return [];
  const prefixes = ['DIST', 'DIST_INT', 'DIST_EXT', 'DIST_CUBIC', 'DIST_CUBIC_INT', 'DIST_CUBIC_EXT', 'M2', 'M3', 'RACKS', 'COSTO_AREA'];
  return prefixes.map(p => ({ oldToken: `${p}_${o}`, newToken: `${p}_${n}` }));
}

/** Factor renamed → token pair. */
export function factorRenamePairs(
  oldName: string,
  newName: string,
): { oldToken: string; newToken: string }[] {
  if (!oldName || !newName || oldName === newName) return [];
  const o = sanitizeAreaToken(oldName);
  const n = sanitizeAreaToken(newName);
  if (o === n) return [];
  return [{ oldToken: `FACTOR_${o}`, newToken: `FACTOR_${n}` }];
}

/** Costos row proceso or subproceso renamed → COSTOS_TOTAL_* token pairs. */
export function costosRowRenamePairs(
  oldProceso: string,
  oldSubproceso: string,
  newProceso: string,
  newSubproceso: string,
): { oldToken: string; newToken: string }[] {
  const pairs: { oldToken: string; newToken: string }[] = [];
  const oP = sanitizeAreaToken(oldProceso);
  const nP = sanitizeAreaToken(newProceso);
  const oS = sanitizeAreaToken(oldSubproceso);
  const nS = sanitizeAreaToken(newSubproceso);

  // Full token: COSTOS_TOTAL_{proceso}_{subproceso}
  if (oldProceso || oldSubproceso) {
    pairs.push({
      oldToken: `COSTOS_TOTAL_${oP}_${oS}`,
      newToken: `COSTOS_TOTAL_${nP}_${nS}`,
    });
  }
  // Legacy token: COSTOS_TOTAL_{subproceso}
  if (oS !== nS) {
    pairs.push({ oldToken: `COSTOS_TOTAL_${oS}`, newToken: `COSTOS_TOTAL_${nS}` });
  }

  return pairs.filter(p => p.oldToken !== p.newToken);
}
