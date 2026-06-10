import { useState, useCallback, useRef } from 'react';
import type { CotizacionDetalle, CotizacionColumnaDinamica, CotizacionValorDinamico, DetalleConValores, ColDisplayFormat } from '@/types/cotizaciones_v2';
import { computeRowTotal, buildRowVarContext, evalCotizacionFormula } from '@/lib/cotizacionFormulaEngine';
import TotalFormulaModal from './TotalFormulaModal';

const PROCESO_COLORS: Record<string, string> = {
  'Inbound': '#10b981', 'Outbound': '#0ea5e9', 'Almacenaje': '#f59e0b',
  'No Nacionalizados': '#f43f5e', 'Cross Docking': '#8b5cf6',
  'Devoluciones': '#f97316', 'Administración': '#14b8a6',
};
function getColor(p: string) { return PROCESO_COLORS[p] ?? '#64748b'; }

const fmt = (n: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);

const fmtNum = (n: number) =>
  new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtPct = (n: number) => `${(n * 100).toFixed(2)}%`;

function formatColValue(raw: string, col: CotizacionColumnaDinamica, moneda: string): string {
  const n = parseFloat(raw);
  if (isNaN(n)) return raw;
  const fmt2 = (col.display_format ?? col.data_type) as ColDisplayFormat;
  if (fmt2 === 'currency') return fmt(n, moneda);
  if (fmt2 === 'percent') return fmtPct(n);
  return fmtNum(n);
}

export interface FixedColumnHeaders {
  costoUnidad: string;
  totalItem: string;
}

interface Props {
  detalles: DetalleConValores[];
  columnasDinamicas: CotizacionColumnaDinamica[];
  moneda: string;
  globalMultiplier: number;
  /** Número total de líneas activas en la cotización (para variable cantidad_lineas) */
  totalLineas?: number;
  onUpdateDetalle: (id: string, field: keyof CotizacionDetalle, value: number | string) => Promise<void>;
  onUpdateValorDinamico: (detalleId: string, columnaId: string, rawValue: string) => Promise<void>;
  onRemoveDetalle: (id: string) => Promise<void>;
  onUpdateColumnaHeader?: (columnaId: string, newName: string) => Promise<void>;
  onReorderColumnas?: (orderedIds: string[]) => Promise<void>;
  fixedHeaders?: FixedColumnHeaders;
  onUpdateFixedHeader?: (key: keyof FixedColumnHeaders, newName: string) => void;
  /** Fórmula personalizada para el total de cada fila */
  totalFormula?: string;
  onUpdateTotalFormula?: (expression: string) => void;
}

export default function CotizacionDetalleTable({
  detalles, columnasDinamicas, moneda, globalMultiplier, totalLineas: totalLineasProp,
  onUpdateDetalle, onUpdateValorDinamico, onRemoveDetalle,
  onUpdateColumnaHeader, onReorderColumnas, fixedHeaders, onUpdateFixedHeader,
  totalFormula, onUpdateTotalFormula,
}: Props) {
  // totalLineas: usar prop si viene del padre, sino usar detalles.length como fallback
  const totalLineas = totalLineasProp ?? detalles.length;
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [tempValue, setTempValue] = useState('');
  const [editingHeader, setEditingHeader] = useState<string | null>(null);
  const [headerTempValue, setHeaderTempValue] = useState('');
  const [showTotalFormulaModal, setShowTotalFormulaModal] = useState(false);

  // ── Drag & drop state ──────────────────────────────────────────────────────
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragColId = useRef<string | null>(null);

  const handleDragStart = (colId: string) => {
    dragColId.current = colId;
  };

  const handleDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    if (dragColId.current !== colId) setDragOverId(colId);
  };

  const handleDrop = (targetId: string) => {
    const srcId = dragColId.current;
    if (!srcId || srcId === targetId || !onReorderColumnas) {
      setDragOverId(null);
      return;
    }
    const ordered = activeCols.map(c => c.id);
    const srcIdx = ordered.indexOf(srcId);
    const tgtIdx = ordered.indexOf(targetId);
    if (srcIdx === -1 || tgtIdx === -1) { setDragOverId(null); return; }
    ordered.splice(srcIdx, 1);
    ordered.splice(tgtIdx, 0, srcId);
    onReorderColumnas(ordered);
    dragColId.current = null;
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    dragColId.current = null;
    setDragOverId(null);
  };

  const defaultFixed: FixedColumnHeaders = {
    costoUnidad: 'Costo por unidad',
    totalItem: 'Costo Total',
  };
  const fh = fixedHeaders ?? defaultFixed;

  const startEditFixedHeader = (key: keyof FixedColumnHeaders) => {
    if (!onUpdateFixedHeader) return;
    setEditingHeader(`fixed_${key}`);
    setHeaderTempValue(fh[key]);
  };

  const commitFixedHeader = (key: keyof FixedColumnHeaders) => {
    if (headerTempValue.trim() && onUpdateFixedHeader) {
      onUpdateFixedHeader(key, headerTempValue.trim());
    }
    setEditingHeader(null);
  };

  const activeCols = columnasDinamicas
    .filter(c => c.is_active && c.is_visible)
    .sort((a, b) => a.sort_order - b.sort_order);

  const startEdit = useCallback((id: string, field: string, current: string) => {
    setEditingCell({ id, field });
    setTempValue(current);
  }, []);

  // Robust number parser: handles both 1,000.50 and 1.000,50 formats
  function parseNumberInput(raw: string): number {
    const trimmed = raw.trim();
    if (!trimmed) return NaN;

    const lastComma = trimmed.lastIndexOf(',');
    const lastDot = trimmed.lastIndexOf('.');

    let cleaned: string;
    if (lastComma > lastDot && lastDot !== -1) {
      // Format like 1.000,50 → remove dots, replace comma with dot
      cleaned = trimmed.replace(/\./g, '').replace(',', '.');
    } else if (lastDot > lastComma && lastComma !== -1) {
      // Format like 1,000.50 → remove commas
      cleaned = trimmed.replace(/,/g, '');
    } else if (lastComma !== -1 && lastDot === -1) {
      // Only commas — if multiple, they're thousands; if one, assume decimal
      const commaCount = (trimmed.match(/,/g) ?? []).length;
      cleaned = commaCount > 1 ? trimmed.replace(/,/g, '') : trimmed.replace(',', '.');
    } else {
      // Only dots or no separators
      cleaned = trimmed;
    }

    return parseFloat(cleaned);
  }

  const commitEdit = useCallback(async (detalle: DetalleConValores, field: string) => {
    if (field === 'notas_fila') {
      await onUpdateDetalle(detalle.id, 'notas_fila', tempValue);
    } else if (field.startsWith('dyn_')) {
      const colId = field.replace('dyn_', '');
      const v = parseNumberInput(tempValue);
      await onUpdateValorDinamico(detalle.id, colId, isNaN(v) ? tempValue : String(v));
    }
    setEditingCell(null);
  }, [tempValue, onUpdateDetalle, onUpdateValorDinamico]);

  // Compute total_final — uses custom formula if set, otherwise standard engine
  const computeTotal = useCallback((detalle: DetalleConValores): number => {
    return computeRowTotal(
      detalle,
      columnasDinamicas,
      globalMultiplier,
      totalFormula?.trim() || undefined,
      totalLineas,
    );
  }, [columnasDinamicas, globalMultiplier, totalFormula, totalLineas]);

  // Get computed value for a formula column
  const getFormulaColValue = useCallback((detalle: DetalleConValores, col: CotizacionColumnaDinamica): number => {
    if (col.effect_type !== 'formula' || !col.formula_expression) return 0;
    const varCtx = buildRowVarContext(detalle, columnasDinamicas, col.sort_order, 1, totalLineas);
    const result = evalCotizacionFormula(col.formula_expression, varCtx);
    return result.ok ? result.value : 0;
  }, [columnasDinamicas, totalLineas]);

  // Group by proceso
  const grupos = new Map<string, DetalleConValores[]>();
  detalles.forEach(d => {
    if (!grupos.has(d.proceso)) grupos.set(d.proceso, []);
    grupos.get(d.proceso)!.push(d);
  });

  const grandTotal = detalles.reduce((s, d) => s + computeTotal(d), 0);

  if (detalles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 bg-white rounded-xl border border-slate-200 border-dashed">
        <div className="w-14 h-14 flex items-center justify-center rounded-full bg-slate-100">
          <i className="ri-file-list-3-line text-2xl text-slate-400" />
        </div>
        <div className="text-center">
          <p className="text-slate-600 font-medium text-sm">Sin subprocesos en esta cotización</p>
          <p className="text-slate-400 text-xs mt-1">Agrega subprocesos desde el panel izquierdo</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate" style={{ borderSpacing: 0 }}>
          <thead>
            <tr style={{ backgroundColor: 'rgb(30,41,59)' }}>
              <th className="px-4 py-3.5 text-left sticky left-0 z-10" style={{ borderBottom: '1px solid rgb(51,65,85)', backgroundColor: 'rgb(30,41,59)', minWidth: 200 }}>
                <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Proceso / Subproceso</span>
              </th>
              {/* Costo por unidad */}
              <th className="px-4 py-3.5 text-right" style={{ borderBottom: '1px solid rgb(51,65,85)', minWidth: 130 }}>
                {editingHeader === 'fixed_costoUnidad' ? (
                  <input
                    type="text"
                    value={headerTempValue}
                    onChange={e => setHeaderTempValue(e.target.value)}
                    onBlur={() => commitFixedHeader('costoUnidad')}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitFixedHeader('costoUnidad');
                      if (e.key === 'Escape') setEditingHeader(null);
                    }}
                    autoFocus
                    className="w-28 text-right bg-transparent border-b border-slate-400 text-xs font-semibold text-slate-200 uppercase tracking-wider focus:outline-none px-1"
                  />
                ) : (
                  <span
                    onClick={() => startEditFixedHeader('costoUnidad')}
                    className={`text-xs font-semibold text-slate-200 uppercase tracking-wider ${onUpdateFixedHeader ? 'cursor-pointer hover:text-slate-100 border-b border-transparent hover:border-slate-400/50' : ''}`}
                    title={onUpdateFixedHeader ? 'Clic para editar nombre' : undefined}
                  >
                    {fh.costoUnidad}
                  </span>
                )}
              </th>
              {/* Dynamic columns — draggable */}
              {activeCols.map(col => {
                const isDragOver = dragOverId === col.id;
                const isDragging = dragColId.current === col.id;
                return (
                  <th
                    key={col.id}
                    draggable
                    onDragStart={() => handleDragStart(col.id)}
                    onDragOver={e => handleDragOver(e, col.id)}
                    onDrop={() => handleDrop(col.id)}
                    onDragEnd={handleDragEnd}
                    className="px-4 py-3.5 text-right select-none"
                    style={{
                      borderBottom: '1px solid rgb(51,65,85)',
                      minWidth: 130,
                      backgroundColor: col.effect_type === 'formula' ? 'rgb(30,27,75)' : 'rgb(46,16,101)',
                      opacity: isDragging ? 0.4 : 1,
                      borderLeft: isDragOver ? '2px solid rgb(167,139,250)' : '2px solid transparent',
                      cursor: 'grab',
                      transition: 'border-left 0.1s, opacity 0.15s',
                    }}
                  >
                    <div className="flex items-center justify-end gap-1">
                      {/* Drag handle icon */}
                      <div className="w-3 h-3 flex items-center justify-center opacity-30 hover:opacity-70 flex-shrink-0">
                        <i className="ri-draggable text-xs text-violet-300" />
                      </div>
                      {editingHeader === col.id ? (
                        <input
                          type="text"
                          value={headerTempValue}
                          onChange={e => setHeaderTempValue(e.target.value)}
                          onBlur={async () => {
                            if (headerTempValue.trim() && onUpdateColumnaHeader) {
                              await onUpdateColumnaHeader(col.id, headerTempValue.trim());
                            }
                            setEditingHeader(null);
                          }}
                          onKeyDown={async e => {
                            if (e.key === 'Enter') {
                              if (headerTempValue.trim() && onUpdateColumnaHeader) {
                                await onUpdateColumnaHeader(col.id, headerTempValue.trim());
                              }
                              setEditingHeader(null);
                            }
                            if (e.key === 'Escape') setEditingHeader(null);
                          }}
                          autoFocus
                          onClick={e => e.stopPropagation()}
                          className="w-28 text-right bg-transparent border-b border-violet-400 text-xs font-semibold text-violet-300 uppercase tracking-wider focus:outline-none px-1"
                        />
                      ) : (
                        <span
                          onClick={e => {
                            e.stopPropagation();
                            if (onUpdateColumnaHeader) {
                              setEditingHeader(col.id);
                              setHeaderTempValue(col.name);
                            }
                          }}
                          className={`text-xs font-semibold text-violet-300 uppercase tracking-wider ${onUpdateColumnaHeader ? 'cursor-text hover:text-violet-200 border-b border-transparent hover:border-violet-400/50' : ''}`}
                          title={onUpdateColumnaHeader ? 'Clic para editar • Arrastrar para mover' : 'Arrastrar para mover'}
                        >
                          {col.name}
                        </span>
                      )}
                      {col.effect_type === 'formula'
                        ? <i className="ri-function-line text-xs text-indigo-400" title="Columna calculada por fórmula" />
                        : col.is_editable && <i className="ri-pencil-line text-xs text-violet-400" />}
                    </div>
                  </th>
                );
              })}
              <th className="px-4 py-3.5 text-right" style={{ borderBottom: '1px solid rgb(51,65,85)', minWidth: 160, backgroundColor: 'rgb(7,47,40)' }}>
                <div className="flex items-center justify-end gap-1.5">
                  <i className="ri-calculator-line text-xs text-teal-400" />
                  {editingHeader === 'fixed_totalItem' ? (
                    <input
                      type="text"
                      value={headerTempValue}
                      onChange={e => setHeaderTempValue(e.target.value)}
                      onBlur={() => commitFixedHeader('totalItem')}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitFixedHeader('totalItem');
                        if (e.key === 'Escape') setEditingHeader(null);
                      }}
                      autoFocus
                      className="w-24 text-right bg-transparent border-b border-teal-400 text-xs font-semibold text-teal-300 uppercase tracking-wider focus:outline-none px-1"
                    />
                  ) : (
                    <span
                      onClick={() => startEditFixedHeader('totalItem')}
                      className={`text-xs font-semibold text-teal-300 uppercase tracking-wider ${onUpdateFixedHeader ? 'cursor-pointer hover:text-teal-200 border-b border-transparent hover:border-teal-400/50' : ''}`}
                      title={onUpdateFixedHeader ? 'Clic para editar nombre' : undefined}
                    >
                      {fh.totalItem}
                    </span>
                  )}
                  {/* Formula button */}
                  {onUpdateTotalFormula && (
                    <button
                      onClick={() => setShowTotalFormulaModal(true)}
                      title={totalFormula ? `Fórmula activa: ${totalFormula}` : 'Agregar fórmula al Costo Total'}
                      className={`w-5 h-5 flex items-center justify-center rounded transition-colors cursor-pointer flex-shrink-0 ${
                        totalFormula
                          ? 'bg-teal-400/30 text-teal-200 hover:bg-teal-400/50'
                          : 'text-teal-600 hover:text-teal-300 hover:bg-teal-400/20'
                      }`}
                    >
                      <i className="ri-function-line text-xs" />
                    </button>
                  )}
                  {totalFormula && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-teal-400/20 text-teal-300 font-mono font-bold">fx</span>
                  )}
                </div>
              </th>
              <th className="px-3 py-3.5" style={{ borderBottom: '1px solid rgb(51,65,85)', width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {Array.from(grupos.entries()).map(([proceso, rows]) => (
              <>
                <tr key={`g-${proceso}`}>
                  <td
                    colSpan={4 + activeCols.length}
                    style={{
                      borderLeft: `3px solid ${getColor(proceso)}`,
                      borderBottom: '1px solid rgb(241,245,249)',
                      padding: '8px 16px',
                      backgroundColor: 'rgb(248,250,252)',
                    }}
                  >
                    <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">{proceso}</span>
                  </td>
                </tr>
                {rows.map(detalle => {
                  const total = computeTotal(detalle);
                  return (
                    <tr key={detalle.id} className="group hover:bg-slate-50/80 transition-colors">
                      {/* Subproceso */}
                      <td className="sticky left-0 bg-white group-hover:bg-slate-50/80" style={{ borderLeft: `2px solid ${getColor(proceso)}`, borderBottom: '1px solid rgb(241,245,249)', padding: '10px 16px' }}>
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-medium text-slate-700">{detalle.subproceso || '—'}</span>
                          {editingCell?.id === detalle.id && editingCell.field === 'notas_fila' ? (
                            <input
                              type="text"
                              value={tempValue}
                              onChange={e => setTempValue(e.target.value)}
                              onBlur={() => commitEdit(detalle, 'notas_fila')}
                              onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') commitEdit(detalle, 'notas_fila'); }}
                              autoFocus
                              className="text-xs border border-emerald-300 rounded px-2 py-1 focus:outline-none text-slate-600 bg-white w-48"
                            />
                          ) : (
                            <span
                              onClick={() => startEdit(detalle.id, 'notas_fila', detalle.notas_fila ?? '')}
                              className="text-xs text-slate-400 cursor-pointer hover:text-emerald-600 transition-colors"
                            >
                              {detalle.notas_fila || <span className="opacity-0 group-hover:opacity-100 italic">+ nota</span>}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Costo base */}
                      <td style={{ borderBottom: '1px solid rgb(241,245,249)', padding: '12px 16px', textAlign: 'right' }}>
                        <span className="text-sm font-medium text-slate-600 tabular-nums">{fmt(detalle.costo_base, moneda)}</span>
                      </td>

                      {/* Dynamic column values */}
                      {activeCols.map(col => {
                        const val: CotizacionValorDinamico | undefined = detalle.valores[col.id];
                        const raw = val?.raw_value ?? '';
                        const isEditing = editingCell?.id === detalle.id && editingCell.field === `dyn_${col.id}`;
                        const isFormulaCol = col.effect_type === 'formula';

                        // For formula columns, compute value dynamically using the formula engine
                        let displayVal: string | null = null;
                        if (isFormulaCol && col.formula_expression) {
                          const formulaResult = getFormulaColValue(detalle, col);
                          displayVal = formatColValue(String(formulaResult), col, moneda);
                        } else if (raw !== '') {
                          displayVal = formatColValue(raw, col, moneda);
                        }

                        return (
                          <td key={col.id} style={{ borderBottom: '1px solid rgb(241,245,249)', padding: '10px 14px', textAlign: 'right', backgroundColor: isFormulaCol ? 'rgb(238,242,255)' : 'rgb(245,243,255)' }}>
                            {isFormulaCol ? (
                              // Formula columns: read-only, show computed value
                              <div className="flex items-center justify-end gap-1.5">
                                <i className="ri-function-line text-xs text-indigo-400" />
                                <span className="text-sm font-semibold text-indigo-700 tabular-nums">
                                  {displayVal ?? <span className="text-slate-300 text-xs italic">—</span>}
                                </span>
                              </div>
                            ) : col.is_editable ? (
                              isEditing ? (
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={tempValue}
                                  onChange={e => {
                                    const val = e.target.value.replace(/[^0-9.,]/g, '');
                                    setTempValue(val);
                                  }}
                                  onBlur={() => commitEdit(detalle, `dyn_${col.id}`)}
                                  onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') commitEdit(detalle, `dyn_${col.id}`); }}
                                  autoFocus
                                  className="w-28 text-right border border-violet-300 rounded px-2 py-1 text-sm focus:outline-none text-slate-700 bg-white tabular-nums"
                                />
                              ) : (
                                <button
                                  onClick={() => startEdit(detalle.id, `dyn_${col.id}`, raw)}
                                  className="text-sm font-semibold text-violet-700 hover:text-violet-900 tabular-nums cursor-pointer transition-colors"
                                >
                                  {displayVal ?? <span className="text-slate-300 text-xs italic">—</span>}
                                </button>
                              )
                            ) : (
                              <span className="text-sm font-semibold text-violet-700 tabular-nums">
                                {displayVal ?? <span className="text-slate-300 text-xs italic">—</span>}
                              </span>
                            )}
                          </td>
                        );
                      })}

                      {/* Total */}
                      <td style={{ borderBottom: '1px solid rgb(241,245,249)', padding: '12px 16px', textAlign: 'right', backgroundColor: 'rgb(240,253,250)' }}>
                        <span className="text-sm font-bold text-teal-700 tabular-nums">{fmt(total, moneda)}</span>
                      </td>

                      {/* Remove */}
                      <td style={{ borderBottom: '1px solid rgb(241,245,249)', padding: '12px 8px', textAlign: 'center' }}>
                        <button
                          onClick={() => onRemoveDetalle(detalle.id)}
                          className="w-7 h-7 flex items-center justify-center rounded text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer mx-auto opacity-0 group-hover:opacity-100"
                          title="Quitar"
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
              <td colSpan={2 + activeCols.length} style={{ padding: '14px 16px', borderTop: '2px solid rgb(16,185,129)' }}>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 flex items-center justify-center">
                    <i className="ri-price-tag-3-line text-xs text-teal-400" />
                  </div>
                  <span className="text-xs font-bold text-teal-300 uppercase tracking-wider">Total general</span>
                  {globalMultiplier !== 1 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-900/60 text-orange-300 font-medium">
                      ×{globalMultiplier} global
                    </span>
                  )}
                </div>
              </td>
              <td colSpan={2} style={{ padding: '14px 16px', textAlign: 'right', borderTop: '2px solid rgb(16,185,129)' }}>
                <span className="text-lg font-black text-teal-300 tabular-nums">{fmt(grandTotal, moneda)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    {/* Total formula modal */}
    {showTotalFormulaModal && onUpdateTotalFormula && (() => {
      // Construir valores REALES de preview usando el motor de cálculo acumulado
      const firstRow = detalles[0];
      let previewRowValues: Record<string, number> | undefined;
      if (firstRow) {
        // buildRowVarContext con Infinity acumula todas las columnas en orden
        // Las columnas dinámicas sobreescriben base vars si tienen la misma key
        // (ej: cantidad_lineas=17361, cantidad_unidades=202095 vienen del raw_value real)
        const fullCtx = buildRowVarContext(firstRow, columnasDinamicas, Infinity, globalMultiplier, totalLineas);
        // Costo Total real = computeRowTotal sin fórmula personalizada (muestra el base)
        const costoTotalReal = computeRowTotal(firstRow, columnasDinamicas, globalMultiplier, undefined, totalLineas);
        previewRowValues = { ...fullCtx, total_item: costoTotalReal };
      }
      return (
        <TotalFormulaModal
          columnasDinamicas={columnasDinamicas}
          currentExpression={totalFormula ?? ''}
          onClose={() => setShowTotalFormulaModal(false)}
          onSave={expr => {
            onUpdateTotalFormula(expr);
            setShowTotalFormulaModal(false);
          }}
          previewRowValues={previewRowValues}
        />
      );
    })()}
    </>
  );
}
