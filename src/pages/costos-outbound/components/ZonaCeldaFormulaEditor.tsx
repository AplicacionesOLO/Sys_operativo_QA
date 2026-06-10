import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { evalFormula, validateExpression } from '@/lib/mathEvaluator';
import type { VariableDef, VarGroup } from '@/lib/formulaVariables';
import { GROUP_META } from '@/lib/formulaVariables';

interface ZonaCeldaFormulaEditorProps {
  formula: string;
  varMap: Record<string, number>;
  onSave: (formula: string) => void;
  onCancel: () => void;
  position: { top: number; left: number };
  /** Variables del sistema (todas las del motor de fórmulas, agrupadas) */
  systemVarMap?: Record<string, number>;
  /** Definiciones de variables del sistema (para mostrar tokens agrupados) */
  systemVarDefs?: VariableDef[];
}

// Article-level tokens (siempre visibles, sin agrupar)
const ARTICULO_TOKENS: { token: string; label: string; desc: string }[] = [
  { token: '{MOV}', label: 'Movimientos', desc: 'Movimientos del artículo en esta zona' },
  { token: '{UNID}', label: 'Unidades', desc: 'Unidades del artículo en esta zona' },
  { token: '{ZONA_MOV}', label: 'Total Mov. Zona', desc: 'Total de movimientos de toda la zona' },
  { token: '{ZONA_UNID}', label: 'Total Unid. Zona', desc: 'Total de unidades de toda la zona' },
  { token: '{PCT_MOV}', label: '% Mov. del artículo', desc: 'Porcentaje de mov. del artículo / zona * 100' },
  { token: '{PCT_UNID}', label: '% Unid. del artículo', desc: 'Porcentaje de unid. del artículo / zona * 100' },
  { token: '{PROM_MOV_MES}', label: 'Prom. Mov/Mes', desc: 'Promedio mensual de movimientos del artículo en esta zona' },
  { token: '{PROM_UNID_MES}', label: 'Prom. Unid/Mes', desc: 'Promedio mensual de unidades del artículo en esta zona' },
  { token: '{PCT_PROM_MOV_MES}', label: '% Prom. Mov/Mes', desc: '% del Prom. Mov/Mes del artículo sobre la suma total de promedios de la zona' },
  { token: '{PCT_PROM_UNID_MES}', label: '% Prom. Unid/Mes', desc: '% del Prom. Unid/Mes del artículo sobre la suma total de promedios de la zona' },
];

export default function ZonaCeldaFormulaEditor({ formula, varMap, onSave, onCancel, position, systemVarDefs, systemVarMap }: ZonaCeldaFormulaEditorProps) {
  const [expr, setExpr] = useState(formula);
  const [search, setSearch] = useState('');
  const [adjustedPos, setAdjustedPos] = useState<{ top: number; left: number }>(position);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    // Everything except 'costos' starts collapsed to avoid rendering hundreds of variables
    const collapsed: Record<string, boolean> = {};
    if (systemVarDefs && systemVarDefs.length > 0) {
      systemVarDefs.forEach(d => {
        if (d.group !== 'costos') collapsed[d.group] = true;
      });
    }
    return collapsed;
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-adjust popup position to stay within viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Give browser a frame to render so we can measure
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const padding = 12;
      const winW = window.innerWidth;
      const winH = window.innerHeight;

      let top = position.top;
      let left = position.left;

      // Prefer opening below the click; if not enough room, open above
      const heightBelow = winH - top - padding;
      if (rect.height > heightBelow && top - rect.height - padding > padding) {
        top = Math.max(padding, top - rect.height - 8);
      }

      // Ensure left edge visible
      if (left + rect.width + padding > winW) {
        left = Math.max(padding, winW - rect.width - padding);
      }
      if (left < padding) left = padding;

      // Ensure top edge visible
      if (top < padding) top = padding;
      // Ensure bottom visible (fallback)
      if (top + rect.height + padding > winH) {
        top = Math.max(padding, winH - rect.height - padding);
      }

      setAdjustedPos({ top, left });
    });
  }, [position]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 50);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler); };
  }, [onCancel]);

  const insertToken = useCallback((token: string) => {
    const ta = textareaRef.current;
    if (!ta) { setExpr(prev => prev + token); return; }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newExpr = expr.slice(0, start) + token + expr.slice(end);
    setExpr(newExpr);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + token.length, start + token.length);
    });
  }, [expr]);

  const toggleGroup = useCallback((group: string) => {
    setCollapsedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  }, []);

  const validationError = expr.trim() ? validateExpression(expr) : null;
  const result = !validationError && expr.trim() ? evalFormula(expr, varMap) : null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      if (!validationError) handleSave();
    }
    if (e.key === 'Escape') onCancel();
  };

  const handleSave = () => {
    const finalExpr = expr.trim();
    if (finalExpr && validationError) return;
    onSave(finalExpr);
  };

  // Group system vars by category
  const groupedVars = useMemo(() => {
    if (!systemVarDefs || systemVarDefs.length === 0) return [];
    const groups: Record<string, { meta: typeof GROUP_META[VarGroup]; defs: VariableDef[] }> = {};
    systemVarDefs.forEach(def => {
      if (!groups[def.group]) {
        groups[def.group] = { meta: GROUP_META[def.group], defs: [] };
      }
      groups[def.group].defs.push(def);
    });
    // Orden: costos primero (es lo que pidió), luego el resto
    const order: VarGroup[] = ['costos', 'inversiones', 'gastos_varios', 'mano_obra', 'volumenes', 'distribucion', 'distribucion_cubica', 'areas', 'vol_distribucion', 'factores', 'masivo'];
    return order.filter(g => groups[g]).map(g => ({ group: g, ...groups[g] }));
  }, [systemVarDefs]);

  // ── Extract COSTOS_TOTAL_* tokens directly from varMap ───────────────────
  // Even if systemVarDefs doesn't include them (edge case), show them explicitly.
  const costosTotalFromVarMap = useMemo(() => {
    if (!systemVarMap) return [];
    return Object.keys(systemVarMap)
      .filter(k => k.startsWith('COSTOS_TOTAL_') && k !== 'COSTOS_TOTAL_FILA')
      .map(k => {
        // Derive a human label from the token
        const raw = k.replace('COSTOS_TOTAL_', '');
        const parts = raw.split('_');
        // Try to split into proceso/subproceso heuristically
        // Common patterns: INBOUND_NACIONALIZADO_RACKS → Proceso=INBOUND, Sub=NACIONALIZADO RACKS
        const knownProcesos = ['INBOUND', 'OUTBOUND', 'ALMACENAJE', 'CROSSDOCK'];
        let label = raw.replace(/_/g, ' ');
        for (const proc of knownProcesos) {
          if (raw.startsWith(proc)) {
            const sub = raw.slice(proc.length + 1).replace(/_/g, ' ');
            label = `${proc.charAt(0) + proc.slice(1).toLowerCase()} → ${sub.charAt(0) + sub.slice(1).toLowerCase()}`;
            break;
          }
        }
        return { token: k, label: `Costos Total: ${label}`, value: systemVarMap[k] };
      });
  }, [systemVarMap]);

  // Check if systemVarDefs already has costos tokens to avoid duplicates
  const costosTokensInDefs = useMemo(() => {
    if (!systemVarDefs) return new Set<string>();
    return new Set(systemVarDefs.filter(d => d.group === 'costos').map(d => d.token));
  }, [systemVarDefs]);

  // Filter out costos tokens that are already in systemVarDefs
  const extraCostosTokens = useMemo(() =>
    costosTotalFromVarMap.filter(t => !costosTokensInDefs.has(t.token)),
  [costosTotalFromVarMap, costosTokensInDefs]);

  const searchLower = search.toLowerCase().trim();

  // Apply search filter to extra costos tokens
  const filteredExtraCostosTokens = useMemo(() =>
    searchLower
      ? extraCostosTokens.filter(t =>
          t.label.toLowerCase().includes(searchLower) ||
          t.token.toLowerCase().includes(searchLower)
        )
      : extraCostosTokens,
  [extraCostosTokens, searchLower]);

  // Filter article tokens
  const filteredArticuloTokens = searchLower
    ? ARTICULO_TOKENS.filter(t =>
        t.label.toLowerCase().includes(searchLower) ||
        t.desc.toLowerCase().includes(searchLower) ||
        t.token.toLowerCase().includes(searchLower)
      )
    : ARTICULO_TOKENS;

  // Filter system groups
  const filteredGroups = searchLower
    ? groupedVars.map(g => ({
        ...g,
        defs: g.defs.filter(d =>
          d.label.toLowerCase().includes(searchLower) ||
          d.description.toLowerCase().includes(searchLower) ||
          d.token.toLowerCase().includes(searchLower)
        ),
      })).filter(g => g.defs.length > 0)
    : groupedVars;

  const hasSystemVars = systemVarDefs && systemVarDefs.length > 0;

  return (
    <div
      ref={containerRef}
      className="fixed z-50 w-[520px] max-w-[95vw] max-h-[85vh] bg-white rounded-xl border border-slate-300 shadow-lg flex flex-col"
      style={{ top: adjustedPos.top, left: adjustedPos.left }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 flex items-center justify-center rounded-md bg-amber-100">
            <i className="ri-functions text-xs text-amber-600" />
          </div>
          <span className="text-sm font-semibold text-slate-700">Fórmula de columna</span>
        </div>
        <button onClick={onCancel} className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors">
          <i className="ri-close-line" />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-slate-100 flex-shrink-0">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
            <div className="w-3.5 h-3.5 flex items-center justify-center"><i className="ri-search-line text-xs text-slate-400" /></div>
          </div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar variables..."
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-amber-300 focus:border-amber-300 outline-none bg-white text-slate-700 placeholder:text-slate-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute inset-y-0 right-0 pr-2 flex items-center cursor-pointer text-slate-400 hover:text-slate-600">
              <i className="ri-close-line text-xs" />
            </button>
          )}
        </div>
      </div>

      {/* Token panels - scrollable */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* Article-level tokens */}
        {filteredArticuloTokens.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Variables del artículo</p>
            <div className="flex flex-wrap gap-1.5">
              {filteredArticuloTokens.map(t => {
                const cleanToken = t.token.replace(/[{()}]/g, '');
                const val = varMap[cleanToken];
                return (
                  <button
                    key={t.token}
                    onClick={() => insertToken(t.token)}
                    className="px-2 py-1 text-xs rounded-md border border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-400 hover:bg-amber-100 cursor-pointer transition-colors whitespace-nowrap flex items-center gap-1"
                    title={t.desc}
                  >
                    <span className="font-mono font-medium">{t.token}</span>
                    {val !== undefined && val !== null && (
                      <span className="text-amber-600 text-[10px] font-semibold tabular-nums">
                        = {new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val)}
                      </span>
                    )}
                    <span className="text-amber-500">· {t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Costos de Operación — totales extraídos del varMap (si no están ya en systemVarDefs) */}
        {filteredExtraCostosTokens.length > 0 && (
          <div>
            <button
              onClick={() => toggleGroup('__costos_extra__')}
              className="flex items-center gap-1.5 w-full text-left cursor-pointer group mb-1.5"
            >
              <div className="w-3.5 h-3.5 flex items-center justify-center text-slate-400 transition-transform" style={{ transform: (collapsedGroups['__costos_extra__'] ?? false) ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                <i className="ri-arrow-down-s-line text-xs" />
              </div>
              <div className="w-3.5 h-3.5 flex items-center justify-center text-violet-600">
                <i className="ri-calculator-line text-[11px]" />
              </div>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Costos de Operación</span>
              <span className="text-[10px] text-slate-300 ml-0.5">({filteredExtraCostosTokens.length})</span>
            </button>
            {!(collapsedGroups['__costos_extra__'] ?? false) && (
              <div className="flex flex-wrap gap-1.5 pl-5 mb-1">
                {filteredExtraCostosTokens.map(t => (
                  <button
                    key={t.token}
                    onClick={() => insertToken(`{${t.token}}`)}
                    className="px-2 py-1 text-xs rounded-md border border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-400 hover:bg-violet-100 cursor-pointer transition-colors whitespace-nowrap flex items-center gap-1"
                    title={`{${t.token}}`}
                  >
                    <span className="font-mono font-medium text-[11px]">{`{${t.token}}`}</span>
                    {t.value !== undefined && t.value !== null && (
                      <span className="text-violet-600 text-[10px] font-semibold tabular-nums">
                        = {new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(t.value)}
                      </span>
                    )}
                    <span className="text-violet-500 text-[10px]">{t.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* System variables by group */}
        {filteredGroups.map(g => {
          const isCollapsed = collapsedGroups[g.group] ?? false;
          const meta = g.meta;
          return (
            <div key={g.group}>
              <button
                onClick={() => toggleGroup(g.group)}
                className="flex items-center gap-1.5 w-full text-left cursor-pointer group mb-1.5"
              >
                <div className="w-3.5 h-3.5 flex items-center justify-center text-slate-400 transition-transform" style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                  <i className="ri-arrow-down-s-line text-xs" />
                </div>
                <div className={`w-3.5 h-3.5 flex items-center justify-center ${meta.color}`}>
                  <i className={`${meta.icon} text-[11px]`} />
                </div>
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{meta.label}</span>
                <span className="text-[10px] text-slate-300 ml-0.5">({g.defs.length})</span>
              </button>
              {!isCollapsed && (
                <div className="flex flex-wrap gap-1 pl-5 mb-1">
                  {g.defs.map(d => {
                    const val = systemVarMap?.[d.token];
                    return (
                      <button
                        key={d.token}
                        onClick={() => insertToken(`{${d.token}}`)}
                        className="px-2 py-1 text-xs rounded-md border border-slate-200 bg-slate-50 text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 cursor-pointer transition-colors whitespace-nowrap flex items-center gap-1"
                        title={d.description}
                      >
                        <span className="font-mono font-medium text-[11px]">{`{${d.token}}`}</span>
                        {val !== undefined && val !== null && (
                          <span className="text-emerald-600 text-[10px] font-semibold tabular-nums">
                            = {new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {!hasSystemVars && !search && filteredExtraCostosTokens.length === 0 && (
          <p className="text-xs text-slate-400 italic">No hay variables del sistema disponibles. Carga datos en los otros módulos para verlas aquí.</p>
        )}
        {search && filteredArticuloTokens.length === 0 && filteredGroups.length === 0 && filteredExtraCostosTokens.length === 0 && (
          <p className="text-xs text-slate-400 italic">Sin resultados para "{search}"</p>
        )}
      </div>

      {/* Formula input area */}
      <div className="px-4 py-3 border-t border-slate-200 bg-slate-50/50 flex-shrink-0 space-y-2">
        <div className={`rounded-lg border-2 transition-colors ${validationError && expr.trim() ? 'border-rose-300' : 'border-slate-200 focus-within:border-amber-400'}`}>
          <textarea
            ref={textareaRef}
            value={expr}
            onChange={e => setExpr(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='Ej: {MOV} * {COSTOS_TOTAL_INBOUND_MEZZANINE}'
            rows={3}
            className="w-full px-3 py-2 text-sm font-mono text-slate-700 bg-white rounded-lg resize-none focus:outline-none placeholder-slate-300"
            spellCheck={false}
          />
        </div>
        {validationError && expr.trim() && (
          <p className="text-xs text-rose-500 flex items-center gap-1">
            <i className="ri-error-warning-line" /> {validationError}
          </p>
        )}

        {/* Preview */}
        {!validationError && expr.trim() && result && (
          <div className={`px-3 py-2 rounded-lg text-xs ${result.ok ? 'bg-emerald-50 border border-emerald-200' : 'bg-rose-50 border border-rose-200'}`}>
            {result.ok ? (
              <div className="flex items-center gap-2">
                <i className="ri-checkbox-circle-line text-emerald-500" />
                <span className="text-emerald-700 font-medium">Resultado:</span>
                <span className="text-emerald-800 font-bold tabular-nums">
                  {new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(result.value)}
                </span>
              </div>
            ) : (
              <span className="text-rose-600">{result.error || 'Error al evaluar'}</span>
            )}
            {result.unknowns?.length ? (
              <p className="text-amber-600 mt-1 text-[11px]">
                <i className="ri-alert-line mr-1" />
                Variables no encontradas: {result.unknowns.join(', ')}
              </p>
            ) : null}
          </div>
        )}

        <p className="text-[11px] text-slate-400">
          <i className="ri-lightbulb-line mr-1 text-amber-400" />
          Ctrl+Enter para guardar · Esc para cancelar
        </p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50 rounded-b-xl flex-shrink-0">
        <button
          onClick={() => { setExpr(''); onSave(''); }}
          className="px-3 py-1.5 text-xs text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors whitespace-nowrap"
        >
          Limpiar fórmula
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors whitespace-nowrap">
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={!!validationError && expr.trim() !== ''}
          className="px-4 py-1.5 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white rounded-lg cursor-pointer transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Guardar fórmula
        </button>
      </div>
    </div>
  );
}