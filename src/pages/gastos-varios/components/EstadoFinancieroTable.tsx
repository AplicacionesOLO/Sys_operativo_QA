import { useState, useMemo } from 'react';
import type { GastoVarioFila } from '@/types/gastos_varios';
import {
  buildTree, flattenVisible, hasChildren,
  MES_KEYS, ACUM_KEYS,
  fmt,
} from '@/types/gastos_varios';
import EstadoFinancieroRow from './EstadoFinancieroRow';

interface EstadoFinancieroTableProps {
  filas: GastoVarioFila[];
  savingId: string | null;
  onUpdate: (id: string, field: string, value: string | number | null) => void;
  onDelete: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onAddRoot: () => void;
}

const COL_LABELS: Record<string, string> = {
  mes: 'Mes',
  ppto_mes: 'Ppto',
  psdo_mes: 'Psdo',
  acum: 'Acum',
  ppto_acum: 'Ppto',
  psdo_acum: 'Psdo',
};

export default function EstadoFinancieroTable({
  filas,
  savingId,
  onUpdate,
  onDelete,
  onAddChild,
  onAddRoot,
}: EstadoFinancieroTableProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const toggleCollapse = (id: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const tree = useMemo(() => buildTree(filas), [filas]);
  const visibleRows = useMemo(() => flattenVisible(tree, collapsedIds), [tree, collapsedIds]);

  const grandTotals = useMemo(() => {
    const roots = filas.filter(r => !r.parent_id);
    const totals: Record<string, number> = {};
    [...MES_KEYS, ...ACUM_KEYS].forEach(key => {
      totals[key] = roots.reduce((s, r) => s + (Number(r.valores?.[key]) || 0), 0);
    });
    return totals;
  }, [filas]);

  const isEmpty = filas.length === 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth: '1200px' }}>
          <thead>
            {/* GROUP HEADERS */}
            <tr className="bg-slate-900">
              <th className="sticky left-0 z-20 bg-slate-900 px-3 py-2 text-left min-w-[280px] border-r border-slate-700">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-widest">Concepto</span>
              </th>
              <th colSpan={3} className="px-3 py-2 text-center border-r border-slate-600">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Mes</span>
              </th>
              <th colSpan={3} className="px-3 py-2 text-center border-r border-slate-600">
                <span className="text-xs font-bold text-sky-400 uppercase tracking-widest">Acumulado</span>
              </th>
              <th className="w-20 bg-slate-900" />
            </tr>

            {/* COLUMN HEADERS */}
            <tr className="bg-slate-800">
              <th className="sticky left-0 z-20 bg-slate-800 px-3 py-2.5 text-left border-r border-slate-700">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Concepto / Categoría</span>
              </th>
              {MES_KEYS.map(key => (
                <th key={key} className="px-2 py-2.5 text-right min-w-[100px] border-r border-slate-700">
                  <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
                    {COL_LABELS[key]}
                    <span className="text-slate-500 ml-1">/ %</span>
                  </span>
                </th>
              ))}
              {ACUM_KEYS.map(key => (
                <th key={key} className="px-2 py-2.5 text-right min-w-[100px] border-r border-slate-700">
                  <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
                    {COL_LABELS[key]}
                    <span className="text-slate-500 ml-1">/ %</span>
                  </span>
                </th>
              ))}
              <th className="w-20 bg-slate-800" />
            </tr>
          </thead>

          <tbody>
            {isEmpty ? (
              <tr>
                <td colSpan={8} className="px-8 py-20 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-16 flex items-center justify-center rounded-full bg-slate-100">
                      <i className="ri-bar-chart-grouped-line text-3xl text-slate-400" />
                    </div>
                    <div>
                      <p className="text-slate-600 font-semibold text-sm">Sin datos financieros</p>
                      <p className="text-slate-400 text-xs mt-1">Agrega un concepto manualmente o importa un estado financiero</p>
                    </div>
                    <button
                      onClick={onAddRoot}
                      className="mt-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-add-line mr-1.5" />
                      Agregar primer concepto
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              visibleRows.map(fila => (
                <EstadoFinancieroRow
                  key={fila.id}
                  fila={fila}
                  allRows={filas}
                  isCollapsed={collapsedIds.has(fila.id)}
                  childCount={filas.filter(r => r.parent_id === fila.id).length}
                  onToggle={toggleCollapse}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  onAddChild={onAddChild}
                  saving={savingId === fila.id}
                />
              ))
            )}
          </tbody>

          {/* GRAND TOTAL FOOTER */}
          {!isEmpty && (
            <tfoot>
              <tr className="bg-slate-900 border-t-2 border-slate-600">
                <td className="sticky left-0 z-10 bg-slate-900 px-4 py-3 border-r border-slate-700">
                  <span className="text-xs font-bold text-white uppercase tracking-widest">
                    Total General
                  </span>
                </td>
                {[...MES_KEYS, ...ACUM_KEYS].map(key => (
                  <td key={key} className="px-2 py-3 border-r border-slate-700 text-right">
                    <span className="text-xs font-bold text-emerald-400 tabular-nums">
                      {grandTotals[key] !== 0 ? fmt(grandTotals[key]) : '—'}
                    </span>
                  </td>
                ))}
                <td className="w-20 bg-slate-900" />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Add row button */}
      {!isEmpty && (
        <div className="px-4 py-3 border-t border-slate-100 flex items-center gap-3">
          <button
            onClick={onAddRoot}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap"
          >
            <div className="w-4 h-4 flex items-center justify-center"><i className="ri-add-line" /></div>
            Agregar concepto raíz
          </button>
          <span className="text-xs text-slate-300">
            {filas.length} registros · usa el botón <i className="ri-add-line" /> en cada fila para agregar hijos
          </span>
        </div>
      )}
    </div>
  );
}
