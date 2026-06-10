import { useState, useCallback } from 'react';
import type { ManoObraFila, ModuloColumna } from '@/types/mano_obra';
import { formatCellValue } from '@/types/mano_obra';

interface ManoObraTableRowProps {
  fila: ManoObraFila;
  columnas: ModuloColumna[];
  isAdmin: boolean;
  /** Valores ya desencriptados: colId -> valor en texto plano */
  decryptedMap: Record<string, string>;
  onUpdate: (id: string, field: string, value: string) => void;
  onUpdateCell: (id: string, columnaId: string, value: string | number, isSensitive: boolean) => void;
  onDelete: (id: string) => void;
  saving: boolean;
}

type EditState = { field: string; value: string } | null;

export default function ManoObraTableRow({
  fila, columnas, isAdmin, decryptedMap,
  onUpdate, onUpdateCell, onDelete, saving,
}: ManoObraTableRowProps) {
  const [edit, setEdit] = useState<EditState>(null);

  const commit = useCallback(() => {
    if (!edit) return;
    const isFixed = ['nombre', 'area', 'tipo'].includes(edit.field);
    if (isFixed) {
      onUpdate(fila.id, edit.field, edit.value);
    } else {
      const colId = edit.field;
      const col = columnas.find(c => c.id === colId);
      const val = col && ['moneda', 'numero', 'porcentaje'].includes(col.tipo)
        ? (Number(edit.value) || 0)
        : edit.value;
      onUpdateCell(fila.id, colId, val, col?.is_sensitive ?? false);
    }
    setEdit(null);
  }, [edit, fila.id, columnas, onUpdate, onUpdateCell]);

  const startEdit = (field: string, value: string) => {
    setEdit({ field, value: String(value ?? '') });
  };

  const renderEditableFixed = (field: 'nombre' | 'area' | 'tipo', placeholder: string) => {
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
        title="Clic para editar"
        className={`block text-sm cursor-pointer hover:text-emerald-600 transition-colors ${displayValue ? 'text-slate-700' : 'text-slate-300 italic'}`}
      >
        {displayValue || placeholder}
      </span>
    );
  };

  const renderCell = (col: ModuloColumna) => {
    const rawVal = fila.valores[col.id];
    const isEditing = edit?.field === col.id;

    // SENSITIVE FIELD HANDLING
    if (col.is_sensitive) {
      // Non-admin: always show masked, no interaction
      if (!isAdmin) {
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 rounded text-xs text-slate-400 font-mono select-none">
            <i className="ri-lock-line text-xs" />
            ••••••
          </span>
        );
      }
      // Admin: show decrypted value from map
      const decryptedVal = decryptedMap[col.id];
      if (isEditing) {
        return (
          <input
            autoFocus
            type={['moneda', 'numero', 'porcentaje'].includes(col.tipo) ? 'number' : 'text'}
            value={edit.value}
            onChange={e => setEdit({ field: col.id, value: e.target.value })}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEdit(null); }}
            className="w-full bg-transparent text-sm focus:outline-none border-b border-amber-400 pb-0.5 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
        );
      }
      const hasValue = rawVal !== null && rawVal !== undefined && rawVal !== '';
      const displayDecrypted = decryptedVal !== undefined ? decryptedVal : (hasValue ? '…' : '');
      return (
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 flex items-center justify-center text-amber-500 shrink-0">
            <i className="ri-lock-line text-xs" />
          </div>
          <span
            onClick={() => startEdit(col.id, displayDecrypted)}
            title="Dato sensible — clic para editar"
            className={`block text-sm cursor-pointer hover:text-amber-600 transition-colors ${displayDecrypted ? 'text-slate-700' : 'text-slate-300'}`}
          >
            {displayDecrypted ? formatCellValue(displayDecrypted, col.tipo) : '—'}
          </span>
        </div>
      );
    }

    // REGULAR FIELD
    if (isEditing) {
      if (col.tipo === 'select') {
        return (
          <select
            autoFocus value={edit.value}
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
        {renderEditableFixed('nombre', 'Nombre...')}
      </td>
      <td className="px-4 py-3 border-r border-slate-100 min-w-[140px]">
        {renderEditableFixed('area', 'Área...')}
      </td>
      <td className="px-4 py-3 border-r border-slate-100 min-w-[120px]">
        {renderEditableFixed('tipo', 'Tipo...')}
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
          title="Eliminar"
        >
          <i className="ri-delete-bin-6-line text-sm" />
        </button>
      </td>
    </tr>
  );
}
