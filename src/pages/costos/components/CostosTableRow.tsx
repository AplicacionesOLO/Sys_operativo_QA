import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { CostoColumna, CostoFila, FormulaConfig } from '@/types/costos';
import type { Area } from '@/types/areas';
import { formatCellValue } from '@/types/costos';
import type { FormulaContext } from '@/lib/formulaEngine';
import { calcularFormula, EMPTY_FORMULA_CTX } from '@/lib/formulaEngine';
import RowFormulaModal from './RowFormulaModal';
import {
  makeStickyStyle,
  COL_W_DYNAMIC,
  COL_W_TOTAL,
  COL_W_ADD,
  Z_BODY,
  BG_WHITE,
  BG_HOVER,
  BORDER_ROW,
  BORDER_FREEZE,
  BORDER_PROC_DIV,
} from './CostosTable';

// ─── Proceso accent colours (border-left) ────────────────────────────────────
// Defined as plain CSS hex values so they can be used in inline styles.
// No Tailwind bg-* classes are ever applied to sticky cells — all backgrounds
// come from inline styles to guarantee opacity and correct stacking.
const PROCESO_BORDER_COLOR: Record<string, string> = {
  'Inbound':           '#10b981', // emerald-500
  'Outbound':          '#3b82f6', // blue-500
  'Almacenaje':        '#f59e0b', // amber-500
  'No Nacionalizados': '#f43f5e', // rose-500
  'Cross Docking':     '#8b5cf6', // violet-500
  'Devoluciones':      '#f97316', // orange-500
  'Administración':    '#14b8a6', // teal-500
};

function getProcesoAccentColor(proceso: string): string {
  return PROCESO_BORDER_COLOR[proceso] ?? '#94a3b8'; // slate-400
}

// ─── Row total ────────────────────────────────────────────────────────────────
function getRowTotal(fila: CostoFila, columnas: CostoColumna[], ctx: FormulaContext): number {
  return columnas.reduce((sum, col) => {
    if (col.tipo === 'texto' || col.tipo === 'select') return sum;
    if (col.tipo === 'formula') {
      const f = fila.formulas?.[col.id] ?? col.formula;
      if (!f) return sum;
      const mode = f.mode ?? 'terms';
      const has =
        (mode === 'expression' && !!f.expression?.trim()) ||
        (mode === 'terms' && (f.terminos?.length ?? 0) > 0);
      return has ? sum + calcularFormula(f, ctx, fila.subproceso) : sum;
    }
    const val = Number(fila.valores[col.id] ?? 0);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);
}

// ─── Portal area dropdown ─────────────────────────────────────────────────────
interface PortalAreaDropdownProps {
  triggerRef: React.RefObject<HTMLElement | null>;
  value: string;
  areas: Area[];
  onSelect: (nombre: string) => void;
  onClose: () => void;
}

function PortalAreaDropdown({ triggerRef, value, areas, onSelect, onClose }: PortalAreaDropdownProps) {
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const DROPDOWN_H   = 244;

  useEffect(() => {
    const computePos = () => {
      if (!triggerRef.current) return;
      const rect      = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp    = spaceBelow < DROPDOWN_H && rect.top > DROPDOWN_H;
      setPos({
        top: openUp ? rect.top - DROPDOWN_H - 4 : rect.bottom + 4,
        left: rect.left,
        width: Math.max(224, rect.width),
      });
    };
    computePos();
    setTimeout(() => inputRef.current?.focus(), 30);
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, triggerRef]);

  const filtered = areas.filter(a => a.nombre.toLowerCase().includes(query.toLowerCase()));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && query && filtered.length === 0) onSelect(query);
    if (e.key === 'Enter' && filtered.length === 1) onSelect(filtered[0].nombre);
  };

  if (!pos) return null;

  return createPortal(
    <div
      ref={containerRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 99999 }}
      className="bg-white rounded-xl border border-slate-200 overflow-hidden"
    >
      <div className="px-3 py-2 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
            <i className="ri-search-2-line text-xs text-slate-400" />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar área..."
            className="flex-1 text-xs text-slate-700 placeholder-slate-300 focus:outline-none bg-transparent"
          />
        </div>
      </div>
      <div className="max-h-44 overflow-y-auto py-1">
        {filtered.length > 0 ? (
          filtered.map(area => (
            <button
              key={area.id}
              onMouseDown={() => onSelect(area.nombre)}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-emerald-50 hover:text-emerald-700 transition-colors cursor-pointer ${
                value === area.nombre ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 flex items-center justify-center">
                  <i className="ri-map-pin-2-line text-xs text-slate-400" />
                </div>
                {area.nombre}
              </div>
            </button>
          ))
        ) : (
          <div className="px-3 py-3 text-center">
            <p className="text-xs text-slate-400 mb-1.5">Sin coincidencias</p>
            {query && (
              <button
                onMouseDown={() => onSelect(query)}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium cursor-pointer"
              >
                Usar &quot;{query}&quot;
              </button>
            )}
          </div>
        )}
      </div>
      <div className="px-3 py-2 border-t border-slate-100 bg-slate-50">
        <p className="text-xs text-slate-400">
          <i className="ri-keyboard-line mr-1" />
          Enter para texto libre
        </p>
      </div>
    </div>,
    document.body
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface CostosTableRowProps {
  fila: CostoFila;
  columnas: CostoColumna[];
  areas: Area[];
  /** true only for the first row of a proceso group */
  isFirst: boolean;
  /** true only for the last row of a proceso group — draws the divider */
  isLastOfProceso?: boolean;
  onUpdate: (id: string, field: string, value: string | number) => void;
  onUpdateCell: (id: string, columnaId: string, value: string | number) => void;
  onDelete: (id: string) => void;
  onSaveRowFormula: (rowId: string, colId: string, formula: FormulaConfig) => void;
  onClearRowFormula: (rowId: string, colId: string) => void;
  onAddFilaForProceso?: (proceso: string) => void;
  saving: boolean;
  formulaCtx?: FormulaContext;
  showTotal?: boolean;
  frozenCols?: number;

}

interface EditingCell { field: string; value: string }

// ─── Row component ────────────────────────────────────────────────────────────
export default function CostosTableRow({
  fila, columnas, areas,
  isFirst, isLastOfProceso = false,
  onUpdate, onUpdateCell, onDelete,
  onSaveRowFormula, onClearRowFormula, onAddFilaForProceso,
  saving, formulaCtx, showTotal, frozenCols = 2,

}: CostosTableRowProps) {
  const [editing, setEditing]               = useState<EditingCell | null>(null);
  const [hovered, setHovered]               = useState(false);
  const [showAreaDropdown, setShowAreaDropdown] = useState(false);
  const [formulaModalCol, setFormulaModalCol] = useState<CostoColumna | null>(null);

  const inputRef            = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  const subprocesoTriggerRef = useRef<HTMLDivElement | null>(null);
  const ctx                 = formulaCtx ?? EMPTY_FORMULA_CTX;

  // ── Opaque background colours — NEVER use semi-transparent values here ───
  // Sticky cells MUST have opaque backgrounds or scrolled content bleeds through.
  const bodyBg    = hovered ? BG_HOVER : BG_WHITE;
  const formulaBg = hovered ? 'rgb(237,233,254)' : 'rgb(245,243,255)'; // violet tints

  // ── Bottom border — stronger line after last row of a proceso group ───────
  const rowBorder = isLastOfProceso ? BORDER_PROC_DIV : BORDER_ROW;

  // ── Accent colour for the Proceso border-left ─────────────────────────────
  const accentColor = getProcesoAccentColor(fila.proceso);

  const startEdit = useCallback((field: string, currentValue: string | number) => {
    setEditing({ field, value: String(currentValue ?? '') });
    if (field === 'subproceso') setShowAreaDropdown(true);
    else setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const commitEdit = useCallback(() => {
    if (!editing) return;
    if (editing.field === 'proceso' || editing.field === 'subproceso') {
      onUpdate(fila.id, editing.field, editing.value);
    } else {
      const col = columnas.find(c => c.id === editing.field);
      if (col) {
        const isNumeric = ['moneda', 'numero', 'porcentaje'].includes(col.tipo);
        onUpdateCell(fila.id, editing.field, isNumeric ? (Number(editing.value) || 0) : editing.value);
      }
    }
    setEditing(null);
    setShowAreaDropdown(false);
  }, [editing, fila.id, columnas, onUpdate, onUpdateCell]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter')  commitEdit();
    if (e.key === 'Escape') { setEditing(null); setShowAreaDropdown(false); }
  };

  const handleAreaSelect = (nombre: string) => {
    onUpdate(fila.id, 'subproceso', nombre);
    setEditing(null);
    setShowAreaDropdown(false);
  };

  // ── Formula cell renderer ─────────────────────────────────────────────────
  const renderFormulaCell = (col: CostoColumna) => {
    const rowFormula    = fila.formulas?.[col.id];
    const activeFormula = rowFormula ?? col.formula;
    const mode          = activeFormula?.mode ?? 'terms';
    const hasFormula    = activeFormula && (
      (mode === 'expression' && !!activeFormula.expression?.trim()) ||
      (mode === 'terms' && (activeFormula.terminos?.length ?? 0) > 0)
    );

    if (!hasFormula) {
      return (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-300 italic">sin fórmula</span>
          {hovered && (
            <button
              onClick={() => setFormulaModalCol(col)}
              title="Definir fórmula para este subproceso"
              className="w-5 h-5 flex items-center justify-center rounded bg-violet-100 text-violet-500 hover:bg-violet-200 transition-colors cursor-pointer flex-shrink-0"
            >
              <i className="ri-add-line text-xs" />
            </button>
          )}
        </div>
      );
    }

    const value = calcularFormula(activeFormula, ctx, fila.subproceso);
    return (
      <div className="flex items-center gap-1.5 group/formula">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {rowFormula ? (
            <span className="text-xs px-1 py-0.5 rounded bg-emerald-100 text-emerald-600 font-mono font-semibold flex-shrink-0" title="Fórmula propia de este subproceso">fx</span>
          ) : (
            <span className="text-xs px-1 py-0.5 rounded bg-violet-100 text-violet-600 font-mono font-semibold flex-shrink-0" title="Fórmula heredada de la columna">fx</span>
          )}
          <span className="text-sm font-semibold text-violet-700 tabular-nums truncate">
            {formatCellValue(value, 'formula')}
          </span>
          {rowFormula && (
            <span className="text-xs px-1 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex-shrink-0 hidden group-hover/formula:inline-flex whitespace-nowrap">
              propia
            </span>
          )}
        </div>
        {hovered && (
          <button
            onClick={() => setFormulaModalCol(col)}
            title={rowFormula ? 'Editar fórmula de este subproceso' : 'Crear fórmula propia para este subproceso'}
            className="w-5 h-5 flex items-center justify-center rounded text-violet-400 hover:text-violet-600 hover:bg-violet-100 transition-colors cursor-pointer flex-shrink-0"
          >
            <i className="ri-pencil-line text-xs" />
          </button>
        )}
      </div>
    );
  };

  // ── Editable cell renderer ────────────────────────────────────────────────
  const renderDynamicCell = (columnaId: string, col: CostoColumna) => {
    if (col.tipo === 'formula') return renderFormulaCell(col);
    const rawValue = fila.valores[columnaId] ?? '';
    const isEditingThis = editing?.field === columnaId;

    if (isEditingThis) {
      if (col.tipo === 'select') {
        return (
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            value={editing!.value}
            onChange={e => setEditing({ field: columnaId, value: e.target.value })}
            onBlur={commitEdit}
            className="w-full bg-white border border-emerald-400 rounded px-2 py-1 text-xs focus:outline-none"
          >
            <option value="">— Seleccionar —</option>
            {col.opciones?.map(op => <option key={op} value={op}>{op}</option>)}
          </select>
        );
      }
      const isNumeric = ['moneda', 'numero', 'porcentaje'].includes(col.tipo);
      return (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type={isNumeric ? 'number' : 'text'}
          value={editing!.value}
          onChange={e => setEditing({ field: columnaId, value: e.target.value })}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="w-full bg-white border border-emerald-400 rounded px-2 py-1 text-xs focus:outline-none text-right"
        />
      );
    }

    const formatted = formatCellValue(rawValue, col.tipo);
    const isEmpty   = rawValue === '' || rawValue === undefined || rawValue === null;
    const isNumeric = ['moneda', 'numero', 'porcentaje'].includes(col.tipo);

    return (
      <span
        className={`block truncate cursor-text ${isEmpty ? 'text-slate-300 italic' : isNumeric ? 'text-slate-700 font-medium' : 'text-slate-600'}`}
        onClick={() => startEdit(columnaId, rawValue)}
      >
        {isEmpty ? 'Ingresar...' : formatted}
      </span>
    );
  };

  // ── Proceso cell content ──────────────────────────────────────────────────
  const renderProcesoContent = () => {
    if (editing?.field === 'proceso') {
      return (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={editing.value}
          onChange={e => setEditing({ field: 'proceso', value: e.target.value })}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="w-full bg-white border border-emerald-400 rounded px-2 py-1 text-sm font-medium focus:outline-none"
        />
      );
    }
    return (
      <span
        className="block truncate cursor-text font-semibold text-slate-700 hover:text-emerald-600 transition-colors text-sm"
        onClick={() => startEdit('proceso', fila.proceso)}
        title={fila.proceso}
      >
        {fila.proceso || <span className="text-slate-300 italic font-normal text-xs">Proceso...</span>}
      </span>
    );
  };

  // ── Subproceso cell content ───────────────────────────────────────────────
  const renderSubprocesoContent = () => (
    <div className="relative">
      <div
        ref={subprocesoTriggerRef}
        className="flex items-center gap-1.5 cursor-pointer group/sub"
        onClick={() => startEdit('subproceso', fila.subproceso)}
      >
        <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
          <i className="ri-map-pin-2-line text-xs text-slate-300 group-hover/sub:text-emerald-500 transition-colors" />
        </div>
        <span
          className={`text-sm truncate font-medium transition-colors ${fila.subproceso ? 'text-slate-700 hover:text-emerald-600' : 'text-slate-300 italic font-normal'}`}
          title={fila.subproceso}
        >
          {fila.subproceso || 'Seleccionar área...'}
        </span>
        <div className="w-3 h-3 flex items-center justify-center flex-shrink-0 opacity-0 group-hover/sub:opacity-100 transition-opacity">
          <i className="ri-arrow-down-s-line text-xs text-slate-400" />
        </div>
      </div>
      {showAreaDropdown && (
        <PortalAreaDropdown
          triggerRef={subprocesoTriggerRef}
          value={fila.subproceso}
          areas={areas}
          onSelect={handleAreaSelect}
          onClose={() => { setEditing(null); setShowAreaDropdown(false); }}
        />
      )}
    </div>
  );

  return (
    <>
      <tr
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="group transition-colors"
      >

        {/*
         * ── Proceso ─────────────────────────────────────────────────────────
         *
         * STICKY RULES enforced here:
         *   1. position:sticky comes from makeStickyStyle when colIndex < frozenCols
         *   2. left: 0 (getStickyLeft(0) = 0)
         *   3. zIndex: Z_BODY (3) — above non-sticky scrolling cells
         *   4. backgroundColor: bodyBg — ALWAYS OPAQUE (#ffffff or rgb(248,250,252))
         *      NO Tailwind bg-* classes here; inline style owns the background.
         *   5. borderLeft is set inline using the accent colour (no Tailwind border class)
         *
         * NO rowSpan. This cell is rendered on EVERY row.
         * Visual grouping: content is shown only on isFirst rows;
         *                  connector rows show just the accent border line.
         */}
        <td
          style={{
            // Sticky base (position, left, zIndex, width, minWidth, backgroundColor)
            ...makeStickyStyle(0, frozenCols, bodyBg, Z_BODY),
            // Force opaque bg even when not sticky (no Tailwind bg class interference)
            backgroundColor: bodyBg,
            // Proceso accent: left border colour from the process palette
            borderLeft: `2px solid ${accentColor}`,
            borderRight: frozenCols === 1 ? BORDER_FREEZE : BORDER_ROW,
            borderBottom: rowBorder,
            padding: '12px',
            verticalAlign: 'top',
          }}
        >
          {isFirst ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                {saving && (
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                )}
                {renderProcesoContent()}
              </div>
              {onAddFilaForProceso && (
                <button
                  onClick={() => onAddFilaForProceso(fila.proceso)}
                  className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 hover:border-emerald-300 px-2.5 py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap opacity-50 group-hover:opacity-100 hover:shadow-sm w-fit"
                  title={`Agregar subproceso a "${fila.proceso}"`}
                >
                  <div className="w-3.5 h-3.5 flex items-center justify-center">
                    <i className="ri-add-line" />
                  </div>
                  + subproceso
                </button>
              )}
            </div>
          ) : (
            // Connector row — only the accent border is visible; cell is empty
            <div style={{ height: '100%', minHeight: 1 }} />
          )}
        </td>

        {/*
         * ── Subproceso ───────────────────────────────────────────────────────
         *
         * STICKY RULES:
         *   1. position:sticky when colIndex(1) < frozenCols
         *   2. left: COL_W_PROCESO = 144px
         *   3. zIndex: Z_BODY
         *   4. backgroundColor: bodyBg — always opaque
         */}
        <td
          style={{
            ...makeStickyStyle(1, frozenCols, bodyBg, Z_BODY),
            backgroundColor: bodyBg,
            borderRight: frozenCols === 2 ? BORDER_FREEZE : BORDER_ROW,
            borderBottom: rowBorder,
            padding: '12px 16px',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">{renderSubprocesoContent()}</div>
            <button
              onClick={() => onDelete(fila.id)}
              className="w-7 h-7 flex items-center justify-center rounded-md text-rose-400 hover:text-rose-600 hover:bg-rose-50 border border-rose-200 hover:border-rose-300 transition-all cursor-pointer flex-shrink-0 opacity-60 hover:opacity-100"
              title="Eliminar subproceso"
            >
              <i className="ri-delete-bin-6-line text-sm" />
            </button>
          </div>
        </td>

        {/* ── Dynamic columns ─────────────────────────────────────────────── */}
        {columnas.map((col, idx) => {
          const colIndex      = idx + 2;
          const isSticky      = colIndex < frozenCols;
          const isLastFrozen  = colIndex === frozenCols - 1;
          const cellBg        = col.tipo === 'formula' ? formulaBg : bodyBg;

          const cellStyle: React.CSSProperties = isSticky
            ? {
                // Sticky cell: full sticky treatment with opaque background
                ...makeStickyStyle(colIndex, frozenCols, cellBg, Z_BODY),
                backgroundColor: cellBg,
                borderRight: isLastFrozen ? BORDER_FREEZE : BORDER_ROW,
                borderBottom: rowBorder,
                padding: '12px 16px',
              }
            : {
                // Non-sticky: still needs explicit width + background + border
                width: COL_W_DYNAMIC,
                minWidth: COL_W_DYNAMIC,
                backgroundColor: cellBg,
                borderRight: BORDER_ROW,
                borderBottom: rowBorder,
                padding: '12px 16px',
              };

          return (
            <td key={col.id} style={cellStyle}>
              {renderDynamicCell(col.id, col)}
            </td>
          );
        })}

        {/* ── Row total ────────────────────────────────────────────────────── */}
        {showTotal && (
          <td
            style={{
              width: COL_W_TOTAL,
              minWidth: COL_W_TOTAL,
              borderRight: BORDER_ROW,
              borderBottom: rowBorder,
              backgroundColor: hovered ? 'rgb(204,251,241)' : 'rgb(240,253,250)',
              padding: '12px 16px',
            }}
          >
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 flex items-center justify-center flex-shrink-0">
                <i className="ri-calculator-line text-xs text-teal-400" />
              </div>
              <span className="text-sm font-bold text-teal-700 tabular-nums">
                {new Intl.NumberFormat('en-US', {
                  style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
                }).format(getRowTotal(fila, columnas, ctx))}
              </span>
            </div>
          </td>
        )}

        {/* ── Spacer ────────────────────────────────────────────────────────── */}
        <td
          style={{
            width: COL_W_ADD,
            minWidth: COL_W_ADD,
            borderBottom: rowBorder,
            backgroundColor: bodyBg,
          }}
        />
      </tr>

      {/* Row-level formula modal */}
      {formulaModalCol && (
        <RowFormulaModal
          fila={fila}
          columna={formulaModalCol}
          formulaCtx={ctx}
          onClose={() => setFormulaModalCol(null)}
          onSave={(rowId, colId, formula) => {
            onSaveRowFormula(rowId, colId, formula);
            setFormulaModalCol(null);
          }}
          onClear={(rowId, colId) => {
            onClearRowFormula(rowId, colId);
            setFormulaModalCol(null);
          }}
        />
      )}
    </>
  );
}
