import { useState, useCallback } from 'react';
import type { CostoFila, CostoColumna, FormulaConfig } from '@/types/costos';
import { formatCellValue } from '@/types/costos';
import type { CotizacionItem } from '@/types/cotizaciones';
import type { FormulaContext } from '@/lib/formulaEngine';
import { calcularFormula, EMPTY_FORMULA_CTX } from '@/lib/formulaEngine';
import CotizacionFormulaModal from './CotizacionFormulaModal';

const PROCESO_BORDER_COLOR: Record<string, string> = {
  'Inbound':           '#10b981',
  'Outbound':          '#3b82f6',
  'Almacenaje':        '#f59e0b',
  'No Nacionalizados': '#f43f5e',
  'Cross Docking':     '#8b5cf6',
  'Devoluciones':      '#f97316',
  'Administración':    '#14b8a6',
};
function getAccentColor(p: string) { return PROCESO_BORDER_COLOR[p] ?? '#94a3b8'; }

function getRowTotal(
  fila: CostoFila,
  columnas: CostoColumna[],
  ctx: FormulaContext,
  formulasOverride?: Record<string, FormulaConfig>,
): number {
  return columnas.reduce((sum, col) => {
    if (col.tipo === 'texto' || col.tipo === 'select') return sum;
    if (col.tipo === 'formula') {
      // Priority: override for this cotizacion > row formula > column formula
      const f = formulasOverride?.[col.id] ?? fila.formulas?.[col.id] ?? col.formula;
      if (!f) return sum;
      const mode = f.mode ?? 'terms';
      const has = (mode === 'expression' && !!f.expression?.trim()) ||
        (mode === 'terms' && (f.terminos?.length ?? 0) > 0);
      return has ? sum + calcularFormula(f, ctx, fila.subproceso) : sum;
    }
    const v = Number(fila.valores[col.id] ?? 0);
    return sum + (isNaN(v) ? 0 : v);
  }, 0);
}

export interface CotizacionTableItemRow {
  item: CotizacionItem;
  fila: CostoFila;
}

interface FormulaModalState {
  itemId: string;
  fila: CostoFila;
  columna: CostoColumna;
}

interface Props {
  items: CotizacionTableItemRow[];
  columnas: CostoColumna[];
  formulaCtx?: FormulaContext;
  onUpdateMultiplier: (itemId: string, value: number) => void;
  onUpdateNota: (itemId: string, value: string) => void;
  onRemoveItem: (itemId: string) => void;
  onUpdateFormulaOverride: (itemId: string, colId: string, formula: FormulaConfig) => void;
  onClearFormulaOverride: (itemId: string, colId: string) => void;
  globalMultiplier: number;
  /** Set de IDs de columnas fórmula ACTIVADAS para mostrar. Vacío = todas ocultas (solo base/mult/total) */
  columnasVisibles: Set<string>;
  onToggleColumna: (colId: string) => void;
}

export default function CotizacionTable({
  items, columnas, formulaCtx,
  onUpdateMultiplier, onUpdateNota, onRemoveItem,
  onUpdateFormulaOverride, onClearFormulaOverride,
  globalMultiplier, columnasVisibles, onToggleColumna,
}: Props) {
  const ctx = formulaCtx ?? EMPTY_FORMULA_CTX;
  const [editingMult, setEditingMult] = useState<string | null>(null);
  const [editingNota, setEditingNota] = useState<string | null>(null);
  const [tempMult, setTempMult] = useState('');
  const [tempNota, setTempNota] = useState('');
  const [formulaModal, setFormulaModal] = useState<FormulaModalState | null>(null);
  const [showColToggler, setShowColToggler] = useState(false);

  const handleStartEditMult = useCallback((itemId: string, currentVal: number) => {
    setEditingMult(itemId);
    setTempMult(String(currentVal));
  }, []);

  const handleCommitMult = useCallback((itemId: string) => {
    const v = parseFloat(tempMult);
    if (!isNaN(v) && v > 0) onUpdateMultiplier(itemId, v);
    setEditingMult(null);
  }, [tempMult, onUpdateMultiplier]);

  const handleStartEditNota = useCallback((itemId: string, currentVal: string) => {
    setEditingNota(itemId);
    setTempNota(currentVal ?? '');
  }, []);

  const handleCommitNota = useCallback((itemId: string) => {
    onUpdateNota(itemId, tempNota);
    setEditingNota(null);
  }, [tempNota, onUpdateNota]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 bg-white rounded-xl border border-slate-200 border-dashed">
        <div className="w-14 h-14 flex items-center justify-center rounded-full bg-slate-100">
          <i className="ri-file-list-3-line text-2xl text-slate-400" />
        </div>
        <div className="text-center">
          <p className="text-slate-600 font-medium text-sm">Sin ítems en la cotización</p>
          <p className="text-slate-400 text-xs mt-1">Agrega subprocesos desde el panel izquierdo</p>
        </div>
      </div>
    );
  }

  // Group by proceso
  const grupos = new Map<string, CotizacionTableItemRow[]>();
  items.forEach(item => {
    const k = item.fila.proceso;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(item);
  });

  // Formula columns only — these are the toggleable ones
  const formulaCols = columnas.filter(c => c.tipo === 'formula');
  // Visible formula cols — only those in the Set (empty Set = none visible)
  const visibleFormulaCols = formulaCols.filter(col => columnasVisibles.has(col.id));

  const grandTotal = items.reduce((sum, { item, fila }) => {
    const override = item.formulas_override ?? {};
    const base = getRowTotal(fila, columnas, ctx, override);
    return sum + base * item.multiplicador * globalMultiplier;
  }, 0);

  const hiddenCount = formulaCols.filter(c => !columnasVisibles.has(c.id)).length;

  return (
    <>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">

        {/* Column visibility toolbar — only formula columns are toggleable */}
        {formulaCols.length > 0 && (
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 flex-wrap">
            <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
              <i className="ri-functions text-violet-400 text-sm" />
            </div>
            <span className="text-xs font-semibold text-slate-600">Desglose de fórmulas:</span>
            <div className="flex items-center gap-1.5 flex-wrap flex-1">
              {formulaCols.map(col => {
                const isVisible = columnasVisibles.has(col.id);
                return (
                  <button
                    key={col.id}
                    onClick={() => onToggleColumna(col.id)}
                    title={isVisible ? `Ocultar "${col.nombre}"` : `Mostrar "${col.nombre}"`}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer whitespace-nowrap border ${
                      isVisible
                        ? 'bg-violet-100 text-violet-700 border-violet-300 hover:bg-violet-200'
                        : 'bg-white text-slate-400 border-slate-200 hover:border-violet-300 hover:text-violet-500'
                    }`}
                  >
                    <div className="w-3 h-3 flex items-center justify-center">
                      <i className={`text-xs ${isVisible ? 'ri-eye-line' : 'ri-eye-off-line'}`} />
                    </div>
                    {col.nombre}
                    <span className="font-mono font-bold opacity-60">fx</span>
                  </button>
                );
              })}
            </div>
            {hiddenCount > 0 && (
              <span className="text-xs text-slate-400 italic flex-shrink-0">
                {hiddenCount} oculta{hiddenCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate" style={{ borderSpacing: 0 }}>
            <thead>
              <tr style={{ backgroundColor: 'rgb(30,41,59)' }}>
                <th className="px-4 py-3.5 text-left" style={{ borderBottom: '1px solid rgb(51,65,85)' }}>
                  <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Proceso / Subproceso</span>
                </th>
                {/* Visible formula columns breakdown */}
                {visibleFormulaCols.map(col => (
                  <th
                    key={col.id}
                    className="px-4 py-3.5 text-right"
                    style={{ borderBottom: '1px solid rgb(51,65,85)', minWidth: 140, backgroundColor: 'rgb(46,16,101)' }}
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="w-4 h-4 flex items-center justify-center">
                        <i className="ri-functions text-xs text-violet-400" />
                      </div>
                      <span className="text-xs font-semibold text-violet-300 uppercase tracking-wider">{col.nombre}</span>
                      <span className="text-xs px-1 py-0.5 rounded bg-violet-700/60 text-violet-300 font-mono font-bold">fx</span>
                    </div>
                  </th>
                ))}
                <th className="px-4 py-3.5 text-right" style={{ borderBottom: '1px solid rgb(51,65,85)', minWidth: 130 }}>
                  <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Costo base</span>
                </th>
                <th className="px-4 py-3.5 text-center" style={{ borderBottom: '1px solid rgb(51,65,85)', minWidth: 120 }}>
                  <div className="flex items-center justify-center gap-1">
                    <i className="ri-close-line text-xs text-orange-400" />
                    <span className="text-xs font-semibold text-orange-300 uppercase tracking-wider">Multiplicador</span>
                  </div>
                </th>
                <th className="px-4 py-3.5 text-right" style={{ borderBottom: '1px solid rgb(51,65,85)', minWidth: 140, backgroundColor: 'rgb(7,47,40)' }}>
                  <div className="flex items-center justify-end gap-1">
                    <i className="ri-calculator-line text-xs text-teal-400" />
                    <span className="text-xs font-semibold text-teal-300 uppercase tracking-wider">Total ítem</span>
                  </div>
                </th>
                <th className="px-3 py-3.5 text-center" style={{ borderBottom: '1px solid rgb(51,65,85)', width: 40 }}>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from(grupos.entries()).map(([proceso, groupItems]) => (
                <>
                  {/* Process separator */}
                  <tr key={`grupo-${proceso}`}>
                    <td
                      colSpan={4 + visibleFormulaCols.length}
                      style={{
                        borderLeft: `3px solid ${getAccentColor(proceso)}`,
                        borderBottom: '1px solid rgb(241,245,249)',
                        padding: '8px 16px',
                        backgroundColor: 'rgb(248,250,252)',
                      }}
                    >
                      <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">{proceso}</span>
                    </td>
                  </tr>

                  {/* Item rows */}
                  {groupItems.map(({ item, fila }) => {
                    const override = item.formulas_override ?? {};
                    const baseTotal = getRowTotal(fila, columnas, ctx, override);
                    const itemTotal = baseTotal * item.multiplicador * globalMultiplier;
                    const isEditMult = editingMult === item.id;
                    const isEditNota = editingNota === item.id;

                    return (
                      <tr key={item.id} className="group hover:bg-slate-50/80 transition-colors">
                        {/* Subproceso */}
                        <td style={{ borderLeft: `2px solid ${getAccentColor(proceso)}`, borderBottom: '1px solid rgb(241,245,249)', padding: '12px 16px' }}>
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                                <i className="ri-map-pin-2-line text-xs text-slate-400" />
                              </div>
                              <span className="text-sm font-medium text-slate-700">
                                {fila.subproceso || <span className="italic text-slate-400 text-xs">Sin subproceso</span>}
                              </span>
                            </div>
                            {isEditNota ? (
                              <input
                                type="text"
                                value={tempNota}
                                onChange={e => setTempNota(e.target.value)}
                                onBlur={() => handleCommitNota(item.id)}
                                onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') handleCommitNota(item.id); }}
                                autoFocus
                                placeholder="Añadir nota..."
                                className="ml-6 text-xs border border-emerald-300 rounded px-2 py-1 focus:outline-none text-slate-600 bg-white w-64"
                              />
                            ) : (
                              <div
                                onClick={() => handleStartEditNota(item.id, item.notas_item)}
                                className="ml-6 text-xs text-slate-400 cursor-pointer hover:text-emerald-600 transition-colors"
                              >
                                {item.notas_item || <span className="opacity-0 group-hover:opacity-100 italic">+ añadir nota</span>}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Visible formula columns breakdown */}
                        {visibleFormulaCols.map(col => {
                          const hasOverride = !!override[col.id];
                          const activeFormula = override[col.id] ?? fila.formulas?.[col.id] ?? col.formula;
                          const mode = activeFormula?.mode ?? 'terms';
                          const hasFormula = activeFormula && (
                            (mode === 'expression' && !!activeFormula.expression?.trim()) ||
                            (mode === 'terms' && (activeFormula.terminos?.length ?? 0) > 0)
                          );
                          const colValue = hasFormula
                            ? calcularFormula(activeFormula!, ctx, fila.subproceso)
                            : 0;

                          return (
                            <td
                              key={col.id}
                              style={{
                                borderBottom: '1px solid rgb(241,245,249)',
                                padding: '10px 14px',
                                textAlign: 'right',
                                backgroundColor: hasOverride ? 'rgb(237,233,254)' : 'rgb(245,243,255)',
                              }}
                            >
                              <div className="flex items-center justify-end gap-2">
                                {/* Formula value */}
                                <div className="flex flex-col items-end gap-0.5 min-w-0">
                                  {hasFormula ? (
                                    <span className="text-sm font-bold text-violet-700 tabular-nums">
                                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(colValue)}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-slate-300 italic">sin fórmula</span>
                                  )}
                                  {hasOverride && (
                                    <span className="text-xs text-emerald-600 font-medium bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                      cotización
                                    </span>
                                  )}
                                </div>
                                {/* Edit formula button */}
                                <button
                                  onClick={() => setFormulaModal({ itemId: item.id, fila, columna: col })}
                                  title={hasOverride ? 'Editar fórmula de cotización' : 'Crear fórmula exclusiva para esta cotización'}
                                  className="w-6 h-6 flex items-center justify-center rounded text-violet-400 hover:text-violet-700 hover:bg-violet-200 transition-colors cursor-pointer flex-shrink-0 opacity-0 group-hover:opacity-100"
                                >
                                  <i className="ri-pencil-line text-xs" />
                                </button>
                              </div>
                            </td>
                          );
                        })}

                        {/* Base cost */}
                        <td style={{ borderBottom: '1px solid rgb(241,245,249)', padding: '12px 16px', textAlign: 'right' }}>
                          <span className="text-sm font-medium text-slate-600 tabular-nums">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(baseTotal)}
                          </span>
                        </td>

                        {/* Multiplier */}
                        <td style={{ borderBottom: '1px solid rgb(241,245,249)', padding: '10px 16px', textAlign: 'center' }}>
                          {isEditMult ? (
                            <div className="flex flex-col items-center gap-1">
                              <input
                                type="number"
                                value={tempMult}
                                onChange={e => setTempMult(e.target.value)}
                                onBlur={() => handleCommitMult(item.id)}
                                onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') handleCommitMult(item.id); }}
                                autoFocus
                                step="any"
                                min="0"
                                className="w-20 text-center border border-orange-300 rounded px-2 py-1 text-sm focus:outline-none text-slate-700 bg-white"
                              />
                              <span className="text-xs text-slate-400">valor de este ítem</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-0.5">
                              {/* Effective multiplier (item × global) */}
                              {globalMultiplier !== 1 ? (
                                <>
                                  <span className="text-xs font-bold text-orange-700 bg-orange-100 border border-orange-300 px-2.5 py-0.5 rounded-full whitespace-nowrap">
                                    ×{+(item.multiplicador * globalMultiplier).toFixed(4)}
                                  </span>
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <button
                                      onClick={() => handleStartEditMult(item.id, item.multiplicador)}
                                      title="Editar multiplicador de este ítem"
                                      className="text-xs text-orange-400 hover:text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded cursor-pointer whitespace-nowrap transition-colors"
                                    >
                                      ítem ×{item.multiplicador}
                                    </button>
                                    <span className="text-xs text-slate-300">×</span>
                                    <span className="text-xs text-amber-500 font-medium whitespace-nowrap">global ×{globalMultiplier}</span>
                                  </div>
                                </>
                              ) : (
                                <button
                                  onClick={() => handleStartEditMult(item.id, item.multiplicador)}
                                  className="px-3 py-1 rounded-full bg-orange-50 border border-orange-200 text-xs font-bold text-orange-600 hover:bg-orange-100 transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  ×{item.multiplicador}
                                </button>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Item total */}
                        <td style={{ borderBottom: '1px solid rgb(241,245,249)', padding: '12px 16px', textAlign: 'right', backgroundColor: 'rgb(240,253,250)' }}>
                          <span className="text-sm font-bold text-teal-700 tabular-nums">
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(itemTotal)}
                          </span>
                        </td>

                        {/* Remove */}
                        <td style={{ borderBottom: '1px solid rgb(241,245,249)', padding: '12px 8px', textAlign: 'center' }}>
                          <button
                            onClick={() => onRemoveItem(item.id)}
                            className="w-7 h-7 flex items-center justify-center rounded text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer mx-auto opacity-0 group-hover:opacity-100"
                            title="Quitar de cotización"
                          >
                            <i className="ri-close-line text-sm" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: 'rgb(7,47,40)' }}>
                <td colSpan={2 + visibleFormulaCols.length} style={{ padding: '14px 16px', borderTop: '2px solid rgb(16,185,129)' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 flex items-center justify-center">
                      <i className="ri-price-tag-3-line text-xs text-teal-400" />
                    </div>
                    <span className="text-xs font-bold text-teal-300 uppercase tracking-wider">Total general de la cotización</span>
                    {globalMultiplier !== 1 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-orange-900/60 text-orange-300 font-medium">
                        ×{globalMultiplier} global
                      </span>
                    )}
                  </div>
                </td>
                <td colSpan={3} style={{ padding: '14px 16px', textAlign: 'right', borderTop: '2px solid rgb(16,185,129)' }}>
                  <span className="text-lg font-black text-teal-300 tabular-nums">
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(grandTotal)}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Formula modal */}
      {formulaModal && (
        <CotizacionFormulaModal
          fila={formulaModal.fila}
          columna={formulaModal.columna}
          formulaCtx={ctx}
          existingOverride={(items.find(i => i.item.id === formulaModal.itemId)?.item.formulas_override ?? {})[formulaModal.columna.id]}
          onClose={() => setFormulaModal(null)}
          onSave={(colId, formula) => {
            onUpdateFormulaOverride(formulaModal.itemId, colId, formula);
            setFormulaModal(null);
          }}
          onClear={(colId) => {
            onClearFormulaOverride(formulaModal.itemId, colId);
            setFormulaModal(null);
          }}
        />
      )}
    </>
  );
}
