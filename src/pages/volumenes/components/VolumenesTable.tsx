import type { VolumenFila, ModuloColumna } from '@/types/volumenes';
import { formatCellValue, getColumnTotal, COLUMN_TYPES } from '@/types/volumenes';
import VolumenesTableRow from './VolumenesTableRow';

interface VolumenesTableProps {
  columnas: ModuloColumna[];
  filas: VolumenFila[];
  savingId: string | null;
  onAddColumn: () => void;
  onEditColumn: (col: ModuloColumna) => void;
  onDeleteColumn: (id: string) => void;
  onAddFila: () => void;
  onUpdateFila: (id: string, field: string, value: string) => void;
  onUpdateCell: (id: string, columnaId: string, value: string | number) => void;
  onDeleteFila: (id: string) => void;
}

function getTypeIcon(tipo: string): string {
  return COLUMN_TYPES.find(ct => ct.value === tipo)?.icon ?? 'ri-text';
}

export default function VolumenesTable({
  columnas, filas, savingId,
  onAddColumn, onEditColumn, onDeleteColumn,
  onAddFila, onUpdateFila, onUpdateCell, onDeleteFila,
}: VolumenesTableProps) {
  const hasData = filas.length > 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth: `${480 + columnas.length * 160}px` }}>
          <thead>
            <tr className="bg-slate-800">
              <th className="sticky left-0 z-20 bg-slate-800 px-4 py-3.5 text-left w-40 min-w-[160px] border-r border-slate-700">
                <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Proceso</span>
              </th>
              <th className="px-4 py-3.5 text-left w-40 min-w-[160px] border-r border-slate-700">
                <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Subproceso</span>
              </th>
              <th className="px-4 py-3.5 text-left w-32 min-w-[120px] border-r border-slate-700">
                <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Período</span>
              </th>
              {columnas.map(col => (
                <th key={col.id} className="px-4 py-3.5 text-left min-w-[140px] border-r border-slate-700 group/colhead">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                        <i className={`${getTypeIcon(col.tipo)} text-xs text-slate-400`} />
                      </div>
                      <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider truncate">{col.nombre}</span>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover/colhead:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={() => onEditColumn(col)} className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-600 transition-colors cursor-pointer">
                        <i className="ri-pencil-line text-xs" />
                      </button>
                      <button onClick={() => onDeleteColumn(col.id)} className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-rose-400 hover:bg-slate-600 transition-colors cursor-pointer">
                        <i className="ri-delete-bin-6-line text-xs" />
                      </button>
                    </div>
                  </div>
                </th>
              ))}
              <th className="px-3 py-3.5 w-12 min-w-[48px]">
                <button onClick={onAddColumn} className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-700 hover:bg-emerald-600 text-slate-300 hover:text-white transition-all cursor-pointer">
                  <i className="ri-add-line text-sm" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {hasData ? (
              filas.map(fila => (
                <VolumenesTableRow
                  key={fila.id}
                  fila={fila}
                  columnas={columnas}
                  onUpdate={onUpdateFila}
                  onUpdateCell={onUpdateCell}
                  onDelete={onDeleteFila}
                  saving={savingId === fila.id}
                />
              ))
            ) : (
              <tr>
                <td colSpan={columnas.length + 4} className="px-8 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 flex items-center justify-center rounded-full bg-slate-100">
                      <i className="ri-bar-chart-box-line text-2xl text-slate-400" />
                    </div>
                    <div>
                      <p className="text-slate-600 font-medium text-sm">Sin datos de volúmenes</p>
                      <p className="text-slate-400 text-xs mt-1">Agrega una fila manualmente o importa desde un archivo</p>
                    </div>
                    <button onClick={onAddFila} className="mt-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap">
                      <i className="ri-add-line mr-1.5" />Agregar primera fila
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
          {hasData && columnas.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-slate-200">
                <td className="sticky left-0 z-10 bg-slate-50 px-4 py-3 border-r border-slate-200">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Totales</span>
                </td>
                <td className="px-4 py-3 border-r border-slate-200" />
                <td className="px-4 py-3 border-r border-slate-200">
                  <span className="text-xs text-slate-400">{filas.length} registros</span>
                </td>
                {columnas.map(col => {
                  const total = getColumnTotal(filas, col.id, col.tipo);
                  return (
                    <td key={col.id} className="px-4 py-3 border-r border-slate-200">
                      {total !== null ? (
                        <span className="text-sm font-bold text-emerald-700">{formatCellValue(total, col.tipo)}</span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  );
                })}
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {hasData && (
        <div className="px-4 py-3 border-t border-slate-100">
          <button onClick={onAddFila} className="flex items-center gap-2 text-sm text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap">
            <div className="w-4 h-4 flex items-center justify-center"><i className="ri-add-line" /></div>
            Agregar fila
          </button>
        </div>
      )}
    </div>
  );
}
