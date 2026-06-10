import { useState } from 'react';
import type { CotizacionColumnaDinamica } from '@/types/cotizaciones_v2';
import { getAvailableVariables, validateFormulaExpression } from '@/lib/cotizacionFormulaEngine';
import CotizacionFormulaBuilder from './CotizacionFormulaBuilder';

interface Props {
  columnasDinamicas: CotizacionColumnaDinamica[];
  currentExpression: string;
  onClose: () => void;
  onSave: (expression: string) => void;
  /** Valores reales de la primera fila para preview */
  previewRowValues?: Record<string, number>;
}

export default function TotalFormulaModal({ columnasDinamicas, currentExpression, onClose, onSave, previewRowValues }: Props) {
  const [expression, setExpression] = useState(currentExpression);

  // Costo Total puede usar variables base + TODAS las columnas dinámicas activas
  const availableVars = getAvailableVariables(columnasDinamicas, Infinity);

  const validation = expression.trim()
    ? validateFormulaExpression(expression, availableVars.map(v => v.key))
    : { valid: true, usedVars: [] };

  const canSave = !expression.trim() || validation.valid;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-xl flex flex-col" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-teal-100 flex-shrink-0">
              <i className="ri-calculator-line text-teal-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Fórmula del Costo Total</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Define cómo se calcula el Costo Total usando los valores de las columnas dinámicas.
                Si está vacía, se usa el cálculo estándar (costo_base + columnas dinámicas).
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <i className="ri-close-line" />
          </button>
        </div>

        {/* Info banner */}
        <div className="mx-6 mt-4 flex items-start gap-2.5 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 flex-shrink-0">
          <div className="w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5">
            <i className="ri-information-line text-teal-600 text-sm" />
          </div>
          <div className="text-xs text-teal-700 leading-relaxed">
            <strong>Sin fórmula:</strong> <code className="font-mono bg-teal-100 px-1 rounded">costo_base + suma de columnas dinámicas</code>
            <br />
            <strong>Con fórmula:</strong> usá variables base y columnas dinámicas. Ej: <code className="font-mono bg-teal-100 px-1 rounded">cantidad_unidades * costo_base + seguro_carga</code>
          </div>
        </div>

        {/* Builder */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <CotizacionFormulaBuilder
            value={expression}
            onChange={setExpression}
            availableVars={availableVars}
            previewValues={previewRowValues}
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 flex-shrink-0">
          {currentExpression && (
            <button
              onClick={() => { setExpression(''); onSave(''); onClose(); }}
              className="flex items-center gap-1.5 px-4 py-2.5 border border-rose-200 text-rose-500 hover:bg-rose-50 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-delete-bin-6-line text-sm" />
              Quitar fórmula
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
          >
            Cancelar
          </button>
          <button
            onClick={() => { onSave(expression.trim()); onClose(); }}
            disabled={!canSave}
            className="flex-1 px-4 py-2.5 bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-save-line mr-1.5" />
            Aplicar fórmula
          </button>
        </div>
      </div>
    </div>
  );
}
