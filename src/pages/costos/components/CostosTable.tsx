import { useState, useCallback, useMemo } from 'react';
import { downloadExcelMultiSheet } from '@/lib/csvExport';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CostoColumna, CostoFila, FormulaConfig } from '@/types/costos';
import type { Area } from '@/types/areas';
import { formatCellValue, getColumnTotal, COLUMN_TYPES } from '@/types/costos';
import type { FormulaContext } from '@/lib/formulaEngine';
import { EMPTY_FORMULA_CTX, calcularFormula } from '@/lib/formulaEngine';
import CostosTableRow, { COL_W_SIM } from './CostosTableRow';

// ─── Column widths (px) — single source of truth ────────────────────────────
export const COL_W_PROCESO = 144;
export const COL_W_SUBPROC = 160;
export const COL_W_DYNAMIC = 160;
export const COL_W_TOTAL   = 150;
export const COL_W_ADD     = 48;

// ─── Z-index levels (must stay below sidebar z-30) ──────────────────────────
export const Z_HEAD      = 15;  // header row sticky cells
export const Z_HEAD_STICKY = 20; // header cells that are ALSO column-sticky (corner cells)
export const Z_BODY      = 3;

// ─── Opaque background colours for sticky cells ─────────────────────────────
export const BG_HEADER = 'rgb(30,41,59)';
export const BG_WHITE  = '#ffffff';
export const BG_FOOT   = 'rgb(248,250,252)';
export const BG_VIOLET = 'rgb(245,243,255)';
export const BG_TEAL   = 'rgb(240,253,250)';
export const BG_HOVER  = 'rgb(248,250,252)';

// ─── Border constants ────────────────────────────────────────────────────────
export const BORDER_ROW      = '1px solid rgb(241,245,249)';
export const BORDER_FOOT_T   = '2px solid rgb(226,232,240)';
export const BORDER_HEAD_COL = '1px solid rgb(51,65,85)';
export const BORDER_FREEZE   = '2px solid rgba(16,185,129,0.45)';
export const BORDER_PROC_DIV = '2px solid rgb(203,213,225)';

export function getStickyLeft(i: number): number {
  if (i === 0) return 0;
  if (i === 1) return COL_W_PROCESO;
  return COL_W_PROCESO + COL_W_SUBPROC + (i - 2) * COL_W_DYNAMIC;
}

export function getColWidth(i: number): number {
  if (i === 0) return COL_W_PROCESO;
  if (i === 1) return COL_W_SUBPROC;
  return COL_W_DYNAMIC;
}

export function makeStickyStyle(
  colIndex: number,
  frozenCols: number,
  bg: string,
  zIdx: number,
): React.CSSProperties {
  const w = getColWidth(colIndex);
  const isSticky     = colIndex < frozenCols;
  const isLastFreeze = colIndex === frozenCols - 1;
  const base: React.CSSProperties = { width: w, minWidth: w };

  if (!isSticky) return base;

  return {
    ...base,
    position: 'sticky',
    left: getStickyLeft(colIndex),
    zIndex: zIdx,
    backgroundColor: bg,
    ...(isLastFreeze ? { borderRight: BORDER_FREEZE } : {}),
  };
}

const LS_KEY = 'costos-frozen-cols';

// ─── Types ───────────────────────────────────────────────────────────────────
interface CostosTableProps {
  columnas: CostoColumna[];
  filas: CostoFila[];
  areas: Area[];
  savingId: string | null;
  onAddColumn: () => void;
  onEditColumn: (col: CostoColumna) => void;
  onDeleteColumn: (id: string) => void;
  onAddFila: () => void;
  onUpdateFila: (id: string, field: string, value: string | number) => void;
  onUpdateCell: (id: string, columnaId: string, value: string | number) => void;
  onDeleteFila: (id: string) => void;
  onSaveRowFormula: (rowId: string, colId: string, formula: FormulaConfig) => void;
  onClearRowFormula: (rowId: string, colId: string) => void;
  onAddFilaForProceso: (proceso: string) => void;
  onReorderColumns: (newOrder: CostoColumna[]) => void;
  formulaCtx?: FormulaContext;
}

function getTypeIcon(tipo: string): string {
  return COLUMN_TYPES.find(ct => ct.value === tipo)?.icon ?? 'ri-text';
}

function getFormulaColumnTotal(filas: CostoFila[], col: CostoColumna, ctx: FormulaContext): number {
  return filas.reduce((sum, fila) => {
    const f    = fila.formulas?.[col.id] ?? col.formula;
    if (!f) return sum;
    const mode = f.mode ?? 'terms';
    const has  =
      (mode === 'expression' && !!f.expression?.trim()) ||
      (mode === 'terms' && (f.terminos?.length ?? 0) > 0);
    return has ? sum + calcularFormula(f, ctx, fila.subproceso) : sum;
  }, 0);
}

function getRowTotal(fila: CostoFila, columnas: CostoColumna[], ctx: FormulaContext): number {
  return columnas.reduce((sum, col) => {
    if (col.tipo === 'texto' || col.tipo === 'select') return sum;
    if (col.tipo === 'formula') {
      const f    = fila.formulas?.[col.id] ?? col.formula;
      if (!f) return sum;
      const mode = f.mode ?? 'terms';
      const has  =
        (mode === 'expression' && !!f.expression?.trim()) ||
        (mode === 'terms' && (f.terminos?.length ?? 0) > 0);
      return has ? sum + calcularFormula(f, ctx, fila.subproceso) : sum;
    }
    const v = Number(fila.valores[col.id] ?? 0);
    return sum + (isNaN(v) ? 0 : v);
  }, 0);
}

// ── Pin button ───────────────────────────────────────────────────────────────
function PinBtn({
  colIndex, frozenCols, onToggle,
}: { colIndex: number; frozenCols: number; onToggle: (i: number) => void }) {
  const frozen = colIndex < frozenCols;
  const isLast = colIndex === frozenCols - 1;
  return (
    <button
      onClick={e => { e.stopPropagation(); onToggle(colIndex); }}
      title={frozen ? 'Desfijar columna' : 'Fijar columna al hacer scroll'}
      className={`w-5 h-5 flex items-center justify-center rounded transition-all cursor-pointer flex-shrink-0
        ${frozen
          ? isLast
            ? 'text-emerald-400 hover:text-rose-400 opacity-100'
            : 'text-emerald-300 opacity-60 hover:opacity-100 hover:text-rose-400'
          : 'text-slate-500 opacity-0 group-hover/colhead:opacity-100 hover:text-emerald-300'
        }`}
    >
      <i className={`text-xs ${frozen ? 'ri-pushpin-fill' : 'ri-pushpin-line'}`} />
    </button>
  );
}

// ── Sortable column header ────────────────────────────────────────────────────
interface SortableColHeaderProps {
  col: CostoColumna;
  colIndex: number;
  frozenCols: number;
  headCellStyle: (ci: number, bg?: string) => React.CSSProperties;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFreeze: (i: number) => void;
  isDragOverlay?: boolean;
}

function SortableColHeader({
  col, colIndex, frozenCols, headCellStyle, onEdit, onDelete, onToggleFreeze, isDragOverlay = false,
}: SortableColHeaderProps) {
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: col.id });

  const isFormula    = col.tipo === 'formula';
  const colBg        = isFormula ? 'rgb(46,16,101)' : BG_HEADER;
  const isLastFreeze = colIndex === frozenCols - 1;

  const style: React.CSSProperties = {
    ...headCellStyle(colIndex, colBg),
    borderRight: isLastFreeze ? BORDER_FREEZE : BORDER_HEAD_COL,
    borderBottom: BORDER_HEAD_COL,
    transform: CSS.Transform.toString(transform),
    transition: isDragOverlay ? undefined : transition,
    opacity: isDragging ? 0.45 : 1,
    ...(isDragOverlay ? { boxShadow: '0 4px 16px rgba(0,0,0,0.3)', borderRadius: 6, zIndex: 9999 } : {}),
  };

  return (
    <th
      ref={isDragOverlay ? undefined : setNodeRef}
      className="px-4 py-3.5 text-left group/colhead"
      style={style}
      {...(isDragOverlay ? {} : attributes)}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {/* Drag handle */}
          <div
            {...(isDragOverlay ? {} : listeners)}
            title="Arrastrar para reorganizar"
            className={`w-4 h-4 flex items-center justify-center flex-shrink-0 transition-opacity
              ${isDragOverlay
                ? 'opacity-80 cursor-grabbing'
                : 'opacity-0 group-hover/colhead:opacity-60 hover:!opacity-100 cursor-grab active:cursor-grabbing'
              }`}
          >
            <i className="ri-drag-move-2-line text-xs text-slate-400" />
          </div>
          <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
            <i className={`${getTypeIcon(col.tipo)} text-xs ${isFormula ? 'text-violet-400' : 'text-slate-400'}`} />
          </div>
          <span className={`text-xs font-semibold uppercase tracking-wider truncate ${isFormula ? 'text-violet-300' : 'text-slate-200'}`}>
            {col.nombre}
          </span>
          {isFormula && (
            <span className="text-xs px-1 py-0.5 rounded bg-violet-700/60 text-violet-300 font-mono font-bold flex-shrink-0">fx</span>
          )}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <PinBtn colIndex={colIndex} frozenCols={frozenCols} onToggle={onToggleFreeze} />
          <div className="opacity-0 group-hover/colhead:opacity-100 transition-opacity flex items-center gap-0.5">
            <button
              onClick={e => { e.stopPropagation(); onEdit(); }}
              className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-600 transition-colors cursor-pointer"
              title="Editar"
            >
              <i className="ri-pencil-line text-xs" />
            </button>
            <button
              onClick={e => { e.stopPropagation(); onDelete(); }}
              className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-rose-400 hover:bg-slate-600 transition-colors cursor-pointer"
              title="Eliminar"
            >
              <i className="ri-delete-bin-6-line text-xs" />
            </button>
          </div>
        </div>
      </div>
    </th>
  );
}

// ── Main table ────────────────────────────────────────────────────────────────
export default function CostosTable({
  columnas, filas, areas, savingId,
  onAddColumn, onEditColumn, onDeleteColumn,
  onAddFila, onUpdateFila, onUpdateCell, onDeleteFila,
  onSaveRowFormula, onClearRowFormula, onAddFilaForProceso,
  onReorderColumns,
  formulaCtx,
}: CostosTableProps) {
  const ctx = formulaCtx ?? EMPTY_FORMULA_CTX;

  const [frozenCols, setFrozenCols] = useState<number>(() => {
    const s = localStorage.getItem(LS_KEY);
    return s !== null ? Number(s) : 2;
  });
  const [activeColId, setActiveColId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const toggleFreeze = useCallback((i: number) => {
    setFrozenCols(prev => {
      const next = i === prev - 1 ? i : i + 1;
      localStorage.setItem(LS_KEY, String(next));
      return next;
    });
  }, []);

  const handleDragStart = useCallback((event: { active: { id: string | number } }) => {
    setActiveColId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveColId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = columnas.findIndex(c => c.id === String(active.id));
    const newIdx = columnas.findIndex(c => c.id === String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    onReorderColumns(arrayMove(columnas, oldIdx, newIdx));
  }, [columnas, onReorderColumns]);

  // ── Display-order: group rows by proceso so boundaries are always respected ──
  //    This keeps each proceso group visually together regardless of the `orden`
  //    values in the database (which reflect insertion order, not group order).
  const displayFilas = useMemo<CostoFila[]>(() => {
    const groupOrder: string[] = [];
    const groups: Record<string, CostoFila[]> = {};
    filas.forEach(f => {
      if (!groups[f.proceso]) {
        groups[f.proceso] = [];
        groupOrder.push(f.proceso);
      }
      groups[f.proceso].push(f);
    });
    return groupOrder.flatMap(p => groups[p]);
  }, [filas]);

  // ── Row grouping metadata (computed from display-order array) ──────────────
  const firstOfProceso = new Set<string>();
  const lastOfProceso  = new Set<string>();
  const seenProcesos   = new Set<string>();
  displayFilas.forEach((f, i) => {
    if (!seenProcesos.has(f.proceso)) {
      seenProcesos.add(f.proceso);
      firstOfProceso.add(f.id);
    }
    const next = displayFilas[i + 1];
    if (!next || next.proceso !== f.proceso) lastOfProceso.add(f.id);
  });

  const hasData   = displayFilas.length > 0;
  const tableMinW = COL_W_PROCESO + COL_W_SUBPROC
    + columnas.length * COL_W_DYNAMIC
    + (columnas.length > 0 ? COL_W_TOTAL : 0)
    + COL_W_ADD;

  const headCellStyle = (ci: number, bgOverride?: string): React.CSSProperties => {
    const bg   = bgOverride ?? BG_HEADER;
    // Header cells that are also column-sticky need a higher z-index so they
    // sit above both: scrolling body cells AND the sticky thead row itself.
    const z    = ci < frozenCols ? Z_HEAD_STICKY : Z_HEAD;
    const base = makeStickyStyle(ci, frozenCols, bg, z);
    return { ...base, backgroundColor: bg };
  };

  const handleExport = useCallback(() => {
    const fmtN = (v: string|number|undefined|null) => {
      const n = Number(v);
      return isNaN(n) ? String(v ?? '') : Math.round(n*100)/100;
    };
    const formulaCols = columnas.filter(c => c.tipo === 'formula');
    const headers1 = ['Proceso','Subproceso', ...columnas.map(c=>c.nombre), 'Total'];
    const rows1 = filas.map(fila => {
      const cells = columnas.map(col => {
        if (col.tipo === 'formula') {
          const f = fila.formulas?.[col.id] ?? col.formula;
          if (!f) return '';
          try { return fmtN(calcularFormula(f, ctx, fila.subproceso)); } catch { return ''; }
        }
        return fmtN(fila.valores?.[col.id]);
      });
      const total = columnas.reduce((s, col) => {
        const f = col.tipo === 'formula' ? (fila.formulas?.[col.id] ?? col.formula) : null;
        const v = f ? calcularFormula(f, ctx, fila.subproceso) : Number(fila.valores?.[col.id] ?? 0);
        return isNaN(v) ? s : s + v;
      }, 0);
      return [fila.proceso, fila.subproceso, ...cells, fmtN(total)];
    });
    const headers2 = ['Columna','Modo','Expresión / Términos'];
    const rows2 = formulaCols.map(col => {
      const f = col.formula;
      if (!f) return [col.nombre, '—', '—'];
      if (f.mode === 'expression') return [col.nombre, 'Expresión', f.expression ?? ''];
      const terms = (f.terms ?? []).map(t => `${t.variable}×${t.factor}`).join(' + ');
      return [col.nombre, 'Términos', terms];
    });
    downloadExcelMultiSheet('costos_operacion.xlsx', [
      { name: 'Datos', headers: headers1, rows: rows1 },
      ...(rows2.length > 0 ? [{ name: 'Fórmulas', headers: headers2, rows: rows2 }] : []),
    ]);
  }, [columnas, filas, ctx]);

  // The active column being dragged (for overlay)
  const activeCol = activeColId ? columnas.find(c => c.id === activeColId) : null;
  const activeColIdx = activeCol ? columnas.findIndex(c => c.id === activeColId) + 2 : -1;

  return (
    <div className="bg-white rounded-xl border border-slate-200">

      {/* Toolbar: export + freeze status */}
      <div className="px-4 py-2 border-b border-slate-100 flex items-center gap-2 flex-wrap">
        <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap">
          <i className="ri-file-excel-2-line text-emerald-600"/>Descargar .xlsx
        </button>
        {frozenCols > 0 && (
          <>
            <div className="w-px h-4 bg-slate-200"/>
            <div className="flex items-center gap-1.5">
              <i className="ri-pushpin-fill text-xs text-emerald-500"/>
              <span className="text-xs text-slate-500">
                {frozenCols === 1 && 'Columna fija: Proceso'}
                {frozenCols === 2 && 'Columnas fijas: Proceso y Subproceso'}
                {frozenCols > 2 && `Columnas fijas: Proceso, Subproceso + ${frozenCols - 2} más`}
              </span>
              <button onClick={()=>{setFrozenCols(0);localStorage.setItem(LS_KEY,'0');}} className="ml-1 text-xs text-slate-400 hover:text-rose-500 cursor-pointer flex items-center gap-0.5"><i className="ri-close-line text-xs"/>Quitar</button>
            </div>
          </>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
          <table
            className="border-separate text-sm"
            style={{ borderSpacing: 0, width: '100%', minWidth: tableMinW }}
          >
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                {/* ── Proceso ── */}
                <th
                  className="px-4 py-3.5 text-left group/colhead"
                  style={{
                    ...headCellStyle(0),
                    borderRight: frozenCols <= 1 ? BORDER_FREEZE : BORDER_HEAD_COL,
                    borderBottom: BORDER_HEAD_COL,
                  }}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Proceso</span>
                    <PinBtn colIndex={0} frozenCols={frozenCols} onToggle={toggleFreeze} />
                  </div>
                </th>

                {/* ── Subproceso ── */}
                <th
                  className="px-4 py-3.5 text-left group/colhead"
                  style={{
                    ...headCellStyle(1),
                    borderRight: frozenCols === 2 ? BORDER_FREEZE : BORDER_HEAD_COL,
                    borderBottom: BORDER_HEAD_COL,
                  }}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Subproceso</span>
                    <PinBtn colIndex={1} frozenCols={frozenCols} onToggle={toggleFreeze} />
                  </div>
                </th>

                {/* ── Sortable dynamic columns ── */}
                <SortableContext
                  items={columnas.map(c => c.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  {columnas.map((col, idx) => (
                    <SortableColHeader
                      key={col.id}
                      col={col}
                      colIndex={idx + 2}
                      frozenCols={frozenCols}
                      headCellStyle={headCellStyle}
                      onEdit={() => onEditColumn(col)}
                      onDelete={() => onDeleteColumn(col.id)}
                      onToggleFreeze={toggleFreeze}
                    />
                  ))}
                </SortableContext>

                {/* ── Total ── */}
                {columnas.length > 0 && (
                  <th
                    className="px-4 py-3.5 text-left"
                    style={{
                      backgroundColor: BG_HEADER,
                      minWidth: COL_W_TOTAL,
                      width: COL_W_TOTAL,
                      borderRight: BORDER_HEAD_COL,
                      borderBottom: BORDER_HEAD_COL,
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <div className="w-4 h-4 flex items-center justify-center">
                        <i className="ri-calculator-line text-xs text-teal-400" />
                      </div>
                      <span className="text-xs font-bold text-teal-300 uppercase tracking-wider">Total</span>
                      <span className="text-xs px-1 py-0.5 rounded bg-teal-700/60 text-teal-300 font-mono font-semibold ml-0.5">Σ</span>
                    </div>
                    <p className="text-xs text-teal-500/70 mt-0.5 font-normal normal-case tracking-normal">Suma horizontal</p>
                  </th>
                )}

                {/* ── + add column ── */}
                <th
                  className="px-3 py-3.5"
                  style={{ backgroundColor: BG_HEADER, width: COL_W_ADD, minWidth: COL_W_ADD }}
                >
                  <button
                    onClick={onAddColumn}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-700 hover:bg-emerald-600 text-slate-300 hover:text-white transition-all cursor-pointer"
                    title="Agregar columna"
                  >
                    <i className="ri-add-line text-sm" />
                  </button>
                </th>
              </tr>
            </thead>

            <tbody>
              {hasData ? (
                displayFilas.map(fila => (
                  <CostosTableRow
                    key={fila.id}
                    fila={fila}
                    columnas={columnas}
                    areas={areas}
                    isFirst={firstOfProceso.has(fila.id)}
                    isLastOfProceso={lastOfProceso.has(fila.id)}
                    onUpdate={onUpdateFila}
                    onUpdateCell={onUpdateCell}
                    onDelete={onDeleteFila}
                    onSaveRowFormula={onSaveRowFormula}
                    onClearRowFormula={onClearRowFormula}
                    onAddFilaForProceso={onAddFilaForProceso}
                    saving={savingId === fila.id}
                    formulaCtx={ctx}
                    showTotal={columnas.length > 0}
                    frozenCols={frozenCols}
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={columnas.length + 4} className="px-8 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 flex items-center justify-center rounded-full bg-slate-100">
                        <i className="ri-table-2 text-2xl text-slate-400" />
                      </div>
                      <div>
                        <p className="text-slate-600 font-medium text-sm">Sin registros aún</p>
                        <p className="text-slate-400 text-xs mt-1">Agrega una fila para comenzar a registrar costos por operación</p>
                      </div>
                      <button
                        onClick={onAddFila}
                        className="mt-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <i className="ri-add-line mr-1.5" />Agregar primera fila
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>


          </table>
        </div>

        {/* Drag overlay — ghost that follows the cursor while dragging */}
        <DragOverlay>
          {activeCol && activeColIdx >= 0 ? (
            <table className="border-separate text-sm" style={{ borderSpacing: 0 }}>
              <thead>
                <tr>
                  <SortableColHeader
                    col={activeCol}
                    colIndex={activeColIdx}
                    frozenCols={frozenCols}
                    headCellStyle={headCellStyle}
                    onEdit={() => {}}
                    onDelete={() => {}}
                    onToggleFreeze={() => {}}
                    isDragOverlay
                  />
                </tr>
              </thead>
            </table>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Add row button */}
      {hasData && (
        <div className="px-4 py-3 border-t border-slate-100">
          <button
            onClick={onAddFila}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap"
          >
            <div className="w-4 h-4 flex items-center justify-center"><i className="ri-add-line" /></div>
            Agregar fila
          </button>
        </div>
      )}
    </div>
  );
}
