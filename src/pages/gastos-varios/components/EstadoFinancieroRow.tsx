import { useState, useCallback, useRef } from 'react';
import type { GastoVarioFila, ValorKey } from '@/types/gastos_varios';
import {
  fmt, fmtPct, calcPct,
  MES_KEYS, ACUM_KEYS, hasChildren,
} from '@/types/gastos_varios';

interface RowProps {
  fila: GastoVarioFila;
  allRows: GastoVarioFila[];
  isCollapsed: boolean;
  childCount: number;
  onToggle: (id: string) => void;
  onUpdate: (id: string, field: string, value: string | number | null) => void;
  onDelete: (id: string) => void;
  onAddChild: (parentId: string) => void;
  saving: boolean;
}

type EditState = { field: string; value: string } | null;

function CellNum({
  value,
  pct,
  editing,
  onStartEdit,
  onEdit,
  onCommit,
  negative,
}: {
  value: number | undefined;
  pct: number | null;
  editing: EditState;
  onStartEdit: () => void;
  onEdit: (v: string) => void;
  onCommit: () => void;
  negative?: boolean;
}) {
  const isEmpty = value === undefined || value === null || isNaN(value);
  const isNeg = !isEmpty && value! < 0;

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        value={editing.value}
        onChange={e => onEdit(e.target.value)}
        onBlur={onCommit}
        onKeyDown={e => { if (e.key === 'Enter') onCommit(); if (e.key === 'Escape') onCommit(); }}
        className="w-full bg-transparent text-right text-xs focus:outline-none border-b border-emerald-400 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        step="any"
      />
    );
  }

  return (
    <div
      onClick={onStartEdit}
      className="cursor-pointer text-right group/cell select-none"
    >
      <div className={`text-xs font-medium tabular-nums ${isEmpty ? 'text-slate-300' : isNeg || negative ? 'text-rose-600' : 'text-slate-700'} group-hover/cell:text-emerald-700 transition-colors`}>
        {isEmpty ? '—' : fmt(value)}
      </div>
      {pct !== null && (
        <div className="text-[10px] text-slate-400 tabular-nums mt-0.5">
          {fmtPct(pct)}
        </div>
      )}
    </div>
  );
}

export default function EstadoFinancieroRow({
  fila,
  allRows,
  isCollapsed,
  childCount,
  onToggle,
  onUpdate,
  onDelete,
  onAddChild,
  saving,
}: RowProps) {
  const [edit, setEdit] = useState<EditState>(null);
  const [hovering, setHovering] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback((field: string, current: string | number | undefined) => {
    setEdit({ field, value: String(current ?? '') });
  }, []);

  const commit = useCallback(() => {
    if (!edit) return;
    const numFields: ValorKey[] = ['mes', 'ppto_mes', 'psdo_mes', 'acum', 'ppto_acum', 'psdo_acum'];
    if (numFields.includes(edit.field as ValorKey)) {
      const n = edit.value === '' ? null : Number(edit.value);
      onUpdate(fila.id, edit.field, n);
    } else {
      onUpdate(fila.id, edit.field, edit.value);
    }
    setEdit(null);
  }, [edit, fila.id, onUpdate]);

  const nivel = fila.nivel ?? 0;
  const isTipo = fila.tipo_fila ?? 'detalle';

  const rowBg =
    isTipo === 'total'
      ? 'bg-slate-100'
      : isTipo === 'subtotal'
      ? 'bg-slate-50'
      : 'bg-white hover:bg-emerald-50/40';

  const textColor =
    isTipo === 'total'
      ? 'text-slate-800'
      : isTipo === 'subtotal'
      ? 'text-slate-700 font-semibold'
      : 'text-slate-600';

  const numTextColor =
    isTipo === 'total'
      ? 'text-slate-800'
      : isTipo === 'subtotal'
      ? 'text-slate-700'
      : 'text-slate-700';

  const indentPx = nivel * 16;

  const allKeys = [...MES_KEYS, ...ACUM_KEYS] as ValorKey[];

  const renderNumCell = (key: ValorKey, showPct: boolean) => {
    const raw = fila.valores?.[key];
    const value = raw !== undefined && raw !== null ? Number(raw) : undefined;
    const pct = showPct
      ? calcPct(value, fila.parent_id, key, allRows)
      : null;
    const isEditing = edit?.field === key;

    return (
      <td
        key={key}
        className={`px-2 py-2 border-r border-slate-200/40 min-w-[100px] ${rowBg} transition-colors`}
      >
        <CellNum
          value={value}
          pct={pct}
          editing={isEditing ? edit : null}
          onStartEdit={() => startEdit(key, value)}
          onEdit={v => setEdit({ field: key, value: v })}
          onCommit={commit}
          negative={value !== undefined && value < 0}
        />
      </td>
    );
  };

  return (
    <tr
      className={`border-b border-slate-200/50 transition-colors ${rowBg} ${saving ? 'opacity-50' : ''}`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* CONCEPTO — sticky left */}
      <td
        className={`sticky left-0 z-10 px-3 py-2.5 border-r border-slate-200/50 min-w-[280px] max-w-[340px] ${rowBg}`}
        style={{ paddingLeft: `${12 + indentPx}px` }}
      >
        <div className="flex items-center gap-1.5">
          {/* Toggle button */}
          {childCount > 0 ? (
            <button
              onClick={() => onToggle(fila.id)}
              className={`w-5 h-5 flex items-center justify-center rounded flex-shrink-0 transition-colors cursor-pointer ${
                isTipo === 'total' ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-slate-200 text-slate-400'
              }`}
            >
              <i className={`ri-arrow-right-s-line text-sm transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
            </button>
          ) : (
            <div className="w-5 h-5 flex-shrink-0" />
          )}

          {/* Concepto text */}
          {edit?.field === 'concepto' ? (
            <input
              ref={inputRef}
              autoFocus
              type="text"
              value={edit.value}
              onChange={e => setEdit({ field: 'concepto', value: e.target.value })}
              onBlur={commit}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEdit(null); }}
              className="flex-1 bg-transparent text-sm focus:outline-none border-b border-emerald-400 text-slate-800"
            />
          ) : (
            <span
              onClick={() => startEdit('concepto', fila.concepto)}
              className={`flex-1 text-sm cursor-pointer truncate leading-snug ${textColor} ${
                isTipo === 'total' ? 'font-bold tracking-wide' : isTipo === 'subtotal' ? 'font-semibold' : ''
              }`}
            >
              {fila.concepto || <span className="italic text-slate-300">Sin concepto</span>}
            </span>
          )}
        </div>
      </td>

      {/* MES columns */}
      {MES_KEYS.map(key => (
        <td
          key={key}
          className={`px-2 py-2 border-r border-slate-200/40 min-w-[100px] ${rowBg} transition-colors`}
        >
          {(() => {
            const raw = fila.valores?.[key];
            const value = raw !== undefined && raw !== null ? Number(raw) : undefined;
            const pct = calcPct(value, fila.parent_id, key, allRows);
            const isEditing = edit?.field === key;
            return (
              <CellNum
                value={value}
                pct={pct}
                editing={isEditing ? edit : null}
                onStartEdit={() => startEdit(key, value)}
                onEdit={v => setEdit({ field: key, value: v })}
                onCommit={commit}
              />
            );
          })()}
        </td>
      ))}

      {/* ACUM columns */}
      {ACUM_KEYS.map(key => (
        <td
          key={key}
          className={`px-2 py-2 border-r border-slate-200/40 min-w-[100px] ${rowBg} transition-colors`}
        >
          {(() => {
            const raw = fila.valores?.[key];
            const value = raw !== undefined && raw !== null ? Number(raw) : undefined;
            const pct = calcPct(value, fila.parent_id, key, allRows);
            const isEditing = edit?.field === key;
            return (
              <CellNum
                value={value}
                pct={pct}
                editing={isEditing ? edit : null}
                onStartEdit={() => startEdit(key, value)}
                onEdit={v => setEdit({ field: key, value: v })}
                onCommit={commit}
              />
            );
          })()}
        </td>
      ))}

      {/* Actions */}
      <td className={`px-2 py-2 w-20 ${rowBg}`}>
        <div className={`flex items-center gap-0.5 transition-opacity ${hovering ? 'opacity-100' : 'opacity-0'}`}>
          <button
            onClick={() => onAddChild(fila.id)}
            title="Agregar hijo"
            className="w-6 h-6 flex items-center justify-center rounded cursor-pointer transition-colors text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
          >
            <i className="ri-add-line text-xs" />
          </button>
          <button
            onClick={() => { if (confirm('¿Eliminar este concepto?')) onDelete(fila.id); }}
            title="Eliminar"
            className="w-6 h-6 flex items-center justify-center rounded cursor-pointer transition-colors text-slate-400 hover:text-rose-500 hover:bg-rose-50"
          >
            <i className="ri-delete-bin-6-line text-xs" />
          </button>
        </div>
      </td>
    </tr>
  );
}
