import type { CostoAlmacenColumna, CostoAlmacenFila, FormulaConfig } from '@/types/almacen';
import type { FormulaContext } from '@/lib/formulaEngine';
import { EMPTY_FORMULA_CTX } from '@/lib/formulaEngine';
import ExportMenu from '@/components/base/ExportMenu';
import CostosAlmacenTableRow from './CostosAlmacenTableRow';

interface CostosAlmacenTableProps {
  columnas: CostoAlmacenColumna[];
  filas: CostoAlmacenFila[];
  savingId: string | null;
  onAddColumn: () => void;
  onEditColumn: (col: CostoAlmacenColumna) => void;
  onDeleteColumn: (id: string) => void;
  onAddFila: () => void;
  onUpdateFila: (id: string, field: string, value: string | number) => void;
  onUpdateCell: (id: string, columnaId: string, value: string | number) => void;
  onDeleteFila: (id: string) => void;
  onSaveRowFormula: (rowId: string, colId: string, formula: FormulaConfig) => void;
  onClearRowFormula: (rowId: string, colId: string) => void;
  formulaCtx?: FormulaContext;
}

export default function CostosAlmacenTable({
  columnas, filas, savingId,
  onAddColumn, onEditColumn, onDeleteColumn,
  onAddFila, onUpdateFila, onUpdateCell, onDeleteFila,
  onSaveRowFormula, onClearRowFormula,
  formulaCtx,
}: CostosAlmacenTableProps) {
  const ctx = formulaCtx ?? EMPTY_FORMULA_CTX;
  const hasData = filas.length > 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 'calc(100vh - 360px)' }}>
        <table className="text-sm w-full border-separate" style={{ borderSpacing: 0 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr>
              <th className="px-4 py-3 text-left bg-slate-800 text-slate-200 text-xs font-semibold uppercase tracking-wider border-r border-slate-700" style={{ width: 144, minWidth: 144 }}>Proceso</th>
              <th className="px-4 py-3 text-left bg-slate-800 text-slate-200 text-xs font-semibold uppercase tracking-wider border-r border-slate-700" style={{ width: 176, minWidth: 176 }}>Subproceso</th>
              {columnas.map(col => (
                <th key={col.id} className="px-4 py-3 text-left bg-slate-800 border-r border-slate-700 group/colhead" style={{ minWidth: 160 }}>
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className={`text-xs font-semibold uppercase tracking-wider truncate ${col.tipo === 'formula' ? 'text-violet-300' : 'text-slate-200'}`}>{col.nombre}</span>
                      {col.tipo === 'formula' && <span className="text-xs px-1 py-0.5 rounded bg-violet-700/60 text-violet-300 font-mono font-bold flex-shrink-0">fx</span>}
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover/colhead:opacity-100 transition-opacity">
                      <button onClick={() => onEditColumn(col)} className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-600 transition-colors cursor-pointer" title="Editar"><i className="ri-pencil-line text-xs" /></button>
                      <button onClick={() => onDeleteColumn(col.id)} className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-rose-400 hover:bg-slate-600 transition-colors cursor-pointer" title="Eliminar"><i className="ri-delete-bin-6-line text-xs" /></button>
                    </div>
                  </div>
                </th>
              ))}
              <th className="px-3 py-3 bg-slate-800" style={{ width: 48, minWidth: 48 }}>
                <button onClick={onAddColumn} className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-700 hover:bg-teal-500 text-slate-300 hover:text-white transition-all cursor-pointer" title="Agregar columna">
                  <i className="ri-add-line text-sm" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {hasData ? filas.map(fila => (
              <CostosAlmacenTableRow
                key={fila.id}
                fila={fila}
                columnas={columnas}
                onUpdate={onUpdateFila}
                onUpdateCell={onUpdateCell}
                onDelete={onDeleteFila}
                onSaveRowFormula={onSaveRowFormula}
                onClearRowFormula={onClearRowFormula}
                saving={savingId === fila.id}
                formulaCtx={ctx}
              />
            )) : (
              <tr>
                <td colSpan={columnas.length + 3} className="px-8 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 flex items-center justify-center rounded-full bg-slate-100"><i className="ri-table-2 text-2xl text-slate-400" /></div>
                    <div>
                      <p className="text-slate-600 font-medium text-sm">Sin registros aún</p>
                      <p className="text-slate-400 text-xs mt-1">Agrega una fila para comenzar a registrar costos de almacén</p>
                    </div>
                    <button onClick={onAddFila} className="mt-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap">
                      <i className="ri-add-line mr-1.5" />Agregar primera fila
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {hasData && (
        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
          <button onClick={onAddFila} className="flex items-center gap-2 text-sm text-slate-500 hover:text-teal-600 hover:bg-teal-50 px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap">
            <div className="w-4 h-4 flex items-center justify-center"><i className="ri-add-line" /></div>Agregar fila
          </button>
          <ExportMenu
            filenameBase="costos-almacen-operacion"
            getExportData={() => {
              const headers = ['Proceso', 'Subproceso', ...columnas.map(c => c.nombre)];
              const exportRows = filas.map(f => [
                f.proceso,
                f.subproceso,
                ...columnas.map(col => {
                  const val = f.valores?.[col.id];
                  return val !== null && val !== undefined ? String(val) : '';
                }),
              ]);
              return { headers, rows: exportRows };
            }}
          />
        </div>
      )}
    </div>
  );
}