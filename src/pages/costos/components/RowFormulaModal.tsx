import { useState } from 'react';
import type { CostoColumna, CostoFila, FormulaConfig } from '@/types/costos';
import type { FormulaContext } from '@/lib/formulaEngine';
import { EMPTY_FORMULA_CTX } from '@/lib/formulaEngine';
import FormulaBuilder from './FormulaBuilder';

interface RowFormulaModalProps {
  fila: CostoFila;
  columna: CostoColumna;
  formulaCtx?: FormulaContext;
  onClose: () => void;
  onSave: (rowId: string, colId: string, formula: FormulaConfig) => void;
  onClear: (rowId: string, colId: string) => void;
}

export default function RowFormulaModal({
  fila, columna, formulaCtx, onClose, onSave, onClear,
}: RowFormulaModalProps) {
  const ctx = formulaCtx ?? EMPTY_FORMULA_CTX;

  // Use row-level formula if it exists, otherwise start fresh
  const existing = fila.formulas?.[columna.id];
  const [formula, setFormula] = useState<FormulaConfig>(
    existing ?? { mode: 'expression', terminos: [], expression: '' }
  );
  const [error, setError] = useState('');

  const hasExistingFormula = !!existing;
  const mode = formula.mode ?? 'terms';
  const hasContent =
    (mode === 'expression' && !!formula.expression?.trim()) ||
    (mode === 'terms' && (formula.terminos?.length ?? 0) > 0);

  const handleSave = () => {
    if (!hasContent) {
      setError('La fórmula no puede estar vacía');
      return;
    }
    onSave(fila.id, columna.id, formula);
    onClose();
  };

  const handleClear = () => {
    if (!confirm('¿Eliminar la fórmula de este subproceso? Se usará la fórmula de la columna si existe.')) return;
    onClear(fila.id, columna.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">
                <i className="ri-functions mr-1" />
                Fórmula independiente
              </span>
              {hasExistingFormula && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                  <i className="ri-checkbox-circle-line mr-1" />
                  Ya tiene fórmula propia
                </span>
              )}
            </div>
            <h2 className="text-base font-semibold text-slate-800 mt-1">
              Fórmula: <span className="text-violet-600">{columna.nombre}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Subproceso: <span className="font-medium text-slate-600">{fila.subproceso || 'Sin nombre'}</span>
              {' · '}Proceso: <span className="font-medium text-slate-600">{fila.proceso || 'Sin proceso'}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        {/* Info banner */}
        <div className="px-6 pt-4 flex-shrink-0">
          <div className="flex items-start gap-2.5 px-4 py-3 bg-violet-50 border border-violet-100 rounded-lg">
            <div className="w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5">
              <i className="ri-information-line text-violet-500" />
            </div>
            <p className="text-xs text-violet-700 leading-relaxed">
              Esta fórmula es <strong>exclusiva</strong> para el subproceso <strong>&quot;{fila.subproceso || 'este subproceso'}&quot;</strong>.
              No afecta a ningún otro subproceso de la columna <strong>&quot;{columna.nombre}&quot;</strong>.
              {columna.formula && !hasExistingFormula && (
                <> La columna tiene una fórmula predeterminada que actualmente aplica a este subproceso; al guardar aquí la reemplazarás solo para esta fila.</>
              )}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          {error && (
            <div className="mb-3 px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg">
              <p className="text-xs text-rose-600"><i className="ri-error-warning-line mr-1" />{error}</p>
            </div>
          )}
          <FormulaBuilder config={formula} onChange={f => { setFormula(f); setError(''); }} ctx={ctx} />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            {hasExistingFormula && (
              <button
                onClick={handleClear}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  <i className="ri-delete-bin-6-line" />
                </div>
                Eliminar fórmula propia
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 bg-violet-500 hover:bg-violet-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-save-line mr-1.5" />
              Guardar fórmula
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
