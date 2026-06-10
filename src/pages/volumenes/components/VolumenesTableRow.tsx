import { useState, useCallback } from 'react';
import type { VolumenFila, ModuloColumna } from '@/types/volumenes';
import { formatCellValue } from '@/types/volumenes';

interface VolumenesTableRowProps {
  fila: VolumenFila;
  columnas: ModuloColumna[];
  onUpdate: (id: string, field: string, value: string) => void;
  onUpdateCell: (id: string, columnaId: string, value: string | number) => void;
  onDelete: (id: string) => void;
  saving: boolean;
}

type EditState = { field: string; value: string } | null;

export default function VolumenesTableRow({
  fila, columnas, onUpdate, onUpdateCell, onDelete, saving,
}: VolumenesTableRowProps) {
  const [edit, setEdit] = useState<EditState>(null);

  const commit = useCallback(() => {
    if (!edit) return;
    const isFixed = ['proceso', 'subproceso', 'periodo'].includes(edit.field);
    if (isFixed) {
      onUpdate(fila.id, edit.field, edit.value);
    } else {
      const col = columnas.find(c => c.id === edit.field);
      const val = col && ['moneda', 'numero', 'porcentaje'].includes(col.tipo)
        ? (Number(edit.value) || 0)
        : edit.value;
      onUpdateCell(fila.id, edit.field, val);
    }
    setEdit(null);
  }, [edit, fila.id, columnas, onUpdate, onUpdateCell]);

  const startEdit = (field: string, value: string) => setEdit({ field, value: String(value ?? '') });

  const renderEditableFixed = (field: 'proceso' | 'subproceso' | 'periodo', placeholder: string) => {
    const isEditing = edit?.field === field;
    const displayValue = String((fila as Record<string, unknown>)[field] ?? '');
    if (isEditing) {
      return (
        <input
          autoFocus type="text" value={edit.value}
          onChange={e => setEdit({ field, value: e.target.value })}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEdit(null); }}
          className="w-full bg-transparent text-sm text-slate-700 focus:outline-none border-b border-emerald-400 pb-0.5"
        />
      );
    }
    return (
      <span
        onClick={() => startEdit(field, displayValue)}
        className={`block text-sm cursor-pointer hover:text-emerald-600 transition-colors ${displayValue ? 'text-slate-700' : 'text-slate-300 italic'}`}
      >
        {displayValue || placeholder}
      </span>
    );
  };

  const renderCell = (col: ModuloColumna) => {
    const rawVal = fila.valores[col.id];
    const isEditing = edit?.field === col.id;
    if (isEditing) {
      if (col.tipo === 'select') {
        return (
          <select autoFocus value={edit.value}
            onChange={e => setEdit({ field: col.id, value: e.target.value })}
            onBlur={commit}
            className="w-full bg-transparent text-xs focus:outline-none border-b border-emerald-400 cursor-pointer"
          >
            <option value="">— Seleccionar —</option>
            {(col.opciones ?? []).map(op => <option key={op} value={op}>{op}</option>)}
          </select>
        );
      }
      return (
        <input
          autoFocus
          type={['moneda', 'numero', 'porcentaje'].includes(col.tipo) ? 'number' : col.tipo === 'fecha' ? 'date' : 'text'}
          value={edit.value}
          onChange={e => setEdit({ field: col.id, value: e.target.value })}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEdit(null); }}
          className="w-full bg-transparent text-sm focus:outline-none border-b border-emerald-400 pb-0.5 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
      );
    }
    const formatted = formatCellValue(rawVal, col.tipo);
    const isEmpty = rawVal === null || rawVal === undefined || rawVal === '';
    return (
      <span
        onClick={() => startEdit(col.id, String(rawVal ?? ''))}
        className={`block text-sm cursor-pointer hover:text-emerald-600 transition-colors ${isEmpty ? 'text-slate-300' : 'text-slate-700'}`}
      >
        {isEmpty ? '—' : formatted}
      </span>
    );
  };

  return (
    <tr className={`border-b border-slate-100 hover:bg-slate-50/60 transition-colors group/row ${saving ? 'opacity-60' : ''}`}>
      <td className="sticky left-0 z-10 bg-white group-hover/row:bg-slate-50/60 px-4 py-3 border-r border-slate-100 min-w-[160px]">
        {renderEditableFixed('proceso', 'Proceso...')}
      </td>
      <td className="px-4 py-3 border-r border-slate-100 min-w-[160px]">
        {renderEditableFixed('subproceso', 'Subproceso...')}
      </td>
      <td className="px-4 py-3 border-r border-slate-100 min-w-[120px]">
        {renderEditableFixed('periodo', 'Período...')}
      </td>
      {columnas.map(col => (
        <td key={col.id} className="px-4 py-3 border-r border-slate-100 min-w-[140px]">
          {renderCell(col)}
        </td>
      ))}
      <td className="px-3 py-3 w-10">
        <button
          onClick={() => { if (confirm('¿Eliminar este registro?')) onDelete(fila.id); }}
          className="w-7 h-7 flex items-center justify-center rounded-lg opacity-0 group-hover/row:opacity-100 text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all cursor-pointer"
        >
          <i className="ri-delete-bin-6-line text-sm" />
        </button>
      </td>
    </tr>
  );
}
