import { useState } from 'react';
import type { CostoColumna, CostoFila, FormulaConfig } from '@/types/costos';
import type { FormulaContext } from '@/lib/formulaEngine';
import { EMPTY_FORMULA_CTX } from '@/lib/formulaEngine';
import FormulaBuilder from '@/pages/costos/components/FormulaBuilder';

interface Props {
  fila: CostoFila;
  columna: CostoColumna;
  formulaCtx?: FormulaContext;
  existingOverride?: FormulaConfig;
  onClose: () => void;
  onSave: (colId: string, formula: FormulaConfig) => void;
  onClear: (colId: string) => void;
}

export default function CotizacionFormulaModal({
  fila, columna, formulaCtx, existingOverride, onClose, onSave, onClear,
}: Props) {
  const ctx = formulaCtx ?? EMPTY_FORMULA_CTX;

  // Priority: existing override → row formula from costos → column formula → blank
  const initialFormula: FormulaConfig =
    existingOverride ??
    fila.formulas?.[columna.id] ??
    columna.formula ??
    { mode: 'expression', terminos: [], expression: '' };

  const [formula, setFormula] = useState<FormulaConfig>(initialFormula);
  const [error, setError] = useState('');

  const hasOverride = !!existingOverride;
  const mode = formula.mode ?? 'terms';
  const hasContent =
    (mode === 'expression' && !!formula.expression?.trim()) ||
    (mode === 'terms' && (formula.terminos?.length ?? 0) > 0);

  const handleSave = () => {
    if (!hasContent) { setError('La fórmula no puede estar vacía'); return; }
    onSave(columna.id, formula);
  };

  const handleClear = () => {
    if (!confirm('¿Eliminar la fórmula exclusiva de esta cotización? Se usará la fórmula original del subproceso.')) return;
    onClear(columna.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                <i className="ri-file-list-3-line mr-1" />
                Exclusiva de cotización
              </span>
              {hasOverride && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">
                  <i className="ri-checkbox-circle-line mr-1" />
                  Ya tiene fórmula propia
                </span>
              )}
              {!hasOverride && fila.formulas?.[columna.id] && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                  <i className="ri-information-line mr-1" />
                  Heredada de costos (subproceso)
                </span>
              )}
              {!hasOverride && !fila.formulas?.[columna.id] && columna.formula && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                  <i className="ri-information-line mr-1" />
                  Heredada de costos (columna)
                </span>
              )}
            </div>
            <h2 className="text-base font-semibold text-slate-800">
              Fórmula de cotización: <span className="text-violet-600">{columna.nombre}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Subproceso: <span className="font-medium text-slate-600">{fila.subproceso || 'Sin nombre'}</span>
              {' · '}Proceso: <span className="font-medium text-slate-600">{fila.proceso || 'Sin proceso'}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer flex-shrink-0"
          >
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        {/* Info banner */}
        <div className="px-6 pt-4 flex-shrink-0">
          <div className="flex items-start gap-2.5 px-4 py-3 bg-emerald-50 border border-emerald-100 rounded-lg">
            <div className="w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5">
              <i className="ri-shield-check-line text-emerald-600" />
            </div>
            <p className="text-xs text-emerald-700 leading-relaxed">
              Esta fórmula es <strong>exclusiva para esta cotización</strong> y no modifica el módulo de Costos por Operación.
              Puedes ajustar libremente los valores para este cliente sin afectar ningún otro registro.
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
          <FormulaBuilder
            config={formula}
            onChange={f => { setFormula(f); setError(''); }}
            ctx={ctx}
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            {hasOverride && (
              <button
                onClick={handleClear}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  <i className="ri-delete-bin-6-line" />
                </div>
                Eliminar fórmula de cotización
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
              className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
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
