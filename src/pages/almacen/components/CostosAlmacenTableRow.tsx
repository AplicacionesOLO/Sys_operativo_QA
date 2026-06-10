import { useState, useRef, useCallback } from 'react';
import type { CostoAlmacenColumna, CostoAlmacenFila, FormulaConfig } from '@/types/almacen';
import { formatCellValue } from '@/types/almacen';
import type { FormulaContext } from '@/lib/formulaEngine';
import { calcularFormula, EMPTY_FORMULA_CTX } from '@/lib/formulaEngine';
import RowFormulaModal from '@/pages/costos/components/RowFormulaModal';

interface CostosAlmacenTableRowProps {
  fila: CostoAlmacenFila;
  columnas: CostoAlmacenColumna[];
  onUpdate: (id: string, field: string, value: string | number) => void;
  onUpdateCell: (id: string, columnaId: string, value: string | number) => void;
  onDelete: (id: string) => void;
  onSaveRowFormula: (rowId: string, colId: string, formula: FormulaConfig) => void;
  onClearRowFormula: (rowId: string, colId: string) => void;
  saving: boolean;
  formulaCtx?: FormulaContext;
}

interface EditingCell { field: string; value: string }

export default function CostosAlmacenTableRow({
  fila, columnas, onUpdate, onUpdateCell, onDelete,
  onSaveRowFormula, onClearRowFormula,
  saving, formulaCtx,
}: CostosAlmacenTableRowProps) {
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [hovered, setHovered] = useState(false);
  const [formulaModalCol, setFormulaModalCol] = useState<CostoAlmacenColumna | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  const ctx = formulaCtx ?? EMPTY_FORMULA_CTX;

  const startEdit = useCallback((field: string, currentValue: string | number) => {
    setEditing({ field, value: String(currentValue ?? '') });
    setTimeout(() => inputRef.current?.focus(), 0);
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
  }, [editing, fila.id, columnas, onUpdate, onUpdateCell]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') setEditing(null);
  };

  const renderFormulaCell = (col: CostoAlmacenColumna) => {
    const rowFormula = fila.formulas?.[col.id];
    const activeFormula = rowFormula ?? col.formula;
    const mode = activeFormula?.mode ?? 'expression';
    const hasFormula = activeFormula && (
      (mode === 'expression' && !!activeFormula.expression?.trim()) ||
      (mode === 'terms' && (activeFormula.terminos?.length ?? 0) > 0)
    );

    if (!hasFormula) {
      return (
        <div className="flex items-center gap-1.5">
          <button onClick={() => setFormulaModalCol(col)} className="flex items-center gap-1 px-2 py-0.5 rounded text-xs text-violet-400 hover:text-violet-600 hover:bg-violet-50 transition-colors cursor-pointer whitespace-nowrap">
            <div className="w-3.5 h-3.5 flex items-center justify-center"><i className="ri-add-line text-xs" /></div>
            <span className={hovered ? '' : 'opacity-0 group-hover:opacity-100 transition-opacity'}>fórmula</span>
          </button>
          {!hovered && <span className="text-xs text-slate-300 italic">—</span>}
        </div>
      );
    }

    const value = calcularFormula(activeFormula, ctx, fila.subproceso);
    return (
      <div className="flex items-center gap-1.5 group/formula">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {rowFormula ? <span className="text-xs px-1 py-0.5 rounded bg-teal-100 text-teal-600 font-mono font-semibold flex-shrink-0">fx</span> : <span className="text-xs px-1 py-0.5 rounded bg-violet-100 text-violet-600 font-mono font-semibold flex-shrink-0">fx</span>}
          <span className="text-sm font-semibold text-violet-700 tabular-nums truncate">{formatCellValue(value, 'formula')}</span>
        </div>
        {hovered && (
          <button onClick={() => setFormulaModalCol(col)} className="w-5 h-5 flex items-center justify-center rounded text-violet-400 hover:text-violet-600 hover:bg-violet-100 transition-colors cursor-pointer flex-shrink-0">
            <i className="ri-pencil-line text-xs" />
          </button>
        )}
      </div>
    );
  };

  const renderDynamicCell = (columnaId: string, col: CostoAlmacenColumna) => {
    if (col.tipo === 'formula') return renderFormulaCell(col);
    const rawValue = fila.valores[columnaId] ?? '';
    const isEditingThis = editing?.field === columnaId;

    if (isEditingThis) {
      if (col.tipo === 'select') {
        return (
          <select ref={inputRef as React.RefObject<HTMLSelectElement>} value={editing!.value} onChange={e => setEditing({ field: columnaId, value: e.target.value })} onBlur={commitEdit} className="w-full bg-white border border-teal-400 rounded px-2 py-1 text-xs focus:outline-none">
            <option value="">— Seleccionar —</option>
            {col.opciones?.map(op => <option key={op} value={op}>{op}</option>)}
          </select>
        );
      }
      const isNumeric = ['moneda', 'numero', 'porcentaje'].includes(col.tipo);
      return <input ref={inputRef as React.RefObject<HTMLInputElement>} type={isNumeric ? 'number' : 'text'} value={editing!.value} onChange={e => setEditing({ field: columnaId, value: e.target.value })} onBlur={commitEdit} onKeyDown={handleKeyDown} className="w-full bg-white border border-teal-400 rounded px-2 py-1 text-xs focus:outline-none text-right" />;
    }

    const formatted = formatCellValue(rawValue, col.tipo);
    const isEmpty = rawValue === '' || rawValue === undefined || rawValue === null;
    const isNumeric = ['moneda', 'numero', 'porcentaje'].includes(col.tipo);

    return (
      <span className={`block truncate cursor-text ${isEmpty ? 'text-slate-300 italic' : isNumeric ? 'text-slate-700 font-medium' : 'text-slate-600'}`} onClick={() => startEdit(columnaId, rawValue)}>
        {isEmpty ? 'Ingresar...' : formatted}
      </span>
    );
  };

  const cellClass = "px-4 py-3 border-r border-slate-100 align-middle";

  return (
    <>
      <tr onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} className="group transition-colors hover:bg-slate-50 border-t border-slate-100">
        <td className={`${cellClass} w-36`}>
          {editing?.field === 'proceso' ? (
            <input ref={inputRef as React.RefObject<HTMLInputElement>} type="text" value={editing.value} onChange={e => setEditing({ field: 'proceso', value: e.target.value })} onBlur={commitEdit} onKeyDown={handleKeyDown} className="w-full bg-white border border-teal-400 rounded px-2 py-1 text-sm font-medium focus:outline-none" />
          ) : (
            <span className="block truncate cursor-text font-semibold text-slate-700 hover:text-teal-600 transition-colors text-sm" onClick={() => startEdit('proceso', fila.proceso)} title={fila.proceso}>
              {fila.proceso || <span className="text-slate-300 italic font-normal text-xs">Proceso...</span>}
            </span>
          )}
        </td>
        <td className={`${cellClass} w-44`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              {editing?.field === 'subproceso' ? (
                <input ref={inputRef as React.RefObject<HTMLInputElement>} type="text" value={editing.value} onChange={e => setEditing({ field: 'subproceso', value: e.target.value })} onBlur={commitEdit} onKeyDown={handleKeyDown} className="w-full bg-white border border-teal-400 rounded px-2 py-1 text-sm focus:outline-none" />
              ) : (
                <span className={`block truncate cursor-text text-sm font-medium transition-colors ${fila.subproceso ? 'text-slate-700 hover:text-teal-600' : 'text-slate-300 italic font-normal'}`} onClick={() => startEdit('subproceso', fila.subproceso)} title={fila.subproceso}>
                  {fila.subproceso || 'Subproceso...'}
                </span>
              )}
            </div>
            {hovered && (
              <button onClick={() => onDelete(fila.id)} className="w-6 h-6 flex items-center justify-center rounded text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer flex-shrink-0" title="Eliminar fila">
                <i className="ri-delete-bin-6-line text-xs" />
              </button>
            )}
          </div>
        </td>
        {columnas.map(col => (
          <td key={col.id} className={`${cellClass} ${col.tipo === 'formula' ? 'bg-violet-50/40' : ''}`} style={{ minWidth: 160 }}>
            {renderDynamicCell(col.id, col)}
          </td>
        ))}
        <td className="px-4 py-3" style={{ minWidth: 48 }} />
      </tr>

      {formulaModalCol && (
        <RowFormulaModal
          fila={fila as any}
          columna={formulaModalCol as any}
          formulaCtx={ctx}
          onClose={() => setFormulaModalCol(null)}
          onSave={(rowId, colId, formula) => { onSaveRowFormula(rowId, colId, formula); setFormulaModalCol(null); }}
          onClear={(rowId, colId) => { onClearRowFormula(rowId, colId); setFormulaModalCol(null); }}
        />
      )}
    </>
  );
}