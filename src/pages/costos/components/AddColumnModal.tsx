import { useState, useEffect } from 'react';
import type { CostoColumna, ColumnType, FormulaConfig } from '@/types/costos';
import { COLUMN_TYPES, TIPO_GASTO_OPCIONES } from '@/types/costos';
import type { FormulaContext } from '@/lib/formulaEngine';
import { EMPTY_FORMULA_CTX } from '@/lib/formulaEngine';
import FormulaBuilder from './FormulaBuilder';

interface AddColumnModalProps {
  onClose: () => void;
  onSave: (data: { nombre: string; tipo: ColumnType; opciones: string[]; formula?: FormulaConfig }) => void;
  editing?: CostoColumna | null;
  formulaCtx?: FormulaContext;
}

export default function AddColumnModal({ onClose, onSave, editing, formulaCtx }: AddColumnModalProps) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<ColumnType>('moneda');
  const [opciones, setOpciones] = useState<string[]>([...TIPO_GASTO_OPCIONES]);
  const [newOpcion, setNewOpcion] = useState('');
  const [formula, setFormula] = useState<FormulaConfig>({ mode: 'terms', terminos: [] });
  const [error, setError] = useState('');

  const ctx = formulaCtx ?? EMPTY_FORMULA_CTX;

  useEffect(() => {
    if (editing) {
      setNombre(editing.nombre);
      setTipo(editing.tipo);
      setOpciones(editing.opciones?.length ? editing.opciones : [...TIPO_GASTO_OPCIONES]);
      if (editing.formula) setFormula(editing.formula);
    }
  }, [editing]);

  const handleSave = () => {
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return; }
    // Formula at column level is now optional — each row can define its own
    // Only save column-level formula if it actually has content
    const hasColFormula = tipo === 'formula' && (
      ((formula.mode ?? 'terms') === 'terms' && (formula.terminos?.length ?? 0) > 0) ||
      ((formula.mode ?? 'terms') === 'expression' && !!formula.expression?.trim())
    );
    onSave({ nombre: nombre.trim(), tipo, opciones, formula: hasColFormula ? formula : undefined });
  };

  const addOpcion = () => {
    if (!newOpcion.trim()) return;
    setOpciones(prev => [...prev, newOpcion.trim()]);
    setNewOpcion('');
  };

  const removeOpcion = (idx: number) => {
    setOpciones(prev => prev.filter((_, i) => i !== idx));
  };

  const isFormulaType = tipo === 'formula';
  const isExpressionMode = isFormulaType && (formula.mode ?? 'terms') === 'expression';

  // Modal width: extra wide for expression mode (needs variable picker + editor side by side)
  const modalWidth = isExpressionMode ? 'max-w-5xl' : isFormulaType ? 'max-w-2xl' : 'max-w-md';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className={`bg-white rounded-xl shadow-xl w-full ${modalWidth} overflow-hidden flex flex-col max-h-[92vh] transition-all duration-200`}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              {editing ? 'Editar columna' : 'Agregar columna'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isFormulaType
                ? 'Define la fórmula usando el constructor visual o escribe una expresión personalizada'
                : 'Define nombre y tipo de dato para la columna'}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          <div className={isFormulaType ? 'space-y-5' : 'space-y-5'}>
            {/* Top row: nombre + tipo */}
            <div className={`grid gap-5 ${isFormulaType ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {/* Nombre */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Nombre de la columna <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={nombre}
                  onChange={e => { setNombre(e.target.value); setError(''); }}
                  placeholder="ej. Costo total, Tasa de ocupación..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                />
                {error && <p className="text-xs text-rose-500 mt-1">{error}</p>}
              </div>

              {/* Tipo */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">Tipo de dato</label>
                <div className="grid grid-cols-3 gap-2">
                  {COLUMN_TYPES.map(ct => (
                    <button
                      key={ct.value}
                      onClick={() => { setTipo(ct.value); setError(''); }}
                      className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                        tipo === ct.value
                          ? ct.value === 'formula'
                            ? 'border-violet-500 bg-violet-50 text-violet-700'
                            : 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="w-3 h-3 flex items-center justify-center"><i className={`${ct.icon} text-xs`} /></div>
                      {ct.label}
                    </button>
                  ))}
                </div>
                {isFormulaType && (
                  <div className="mt-2 px-3 py-2 bg-violet-50 border border-violet-100 rounded-lg">
                    <p className="text-xs text-violet-700">
                      <i className="ri-information-line mr-1" />
                      Cada subproceso puede tener su <strong>propia fórmula independiente</strong>. Puedes definir una fórmula aquí como predeterminada, o dejarla vacía y asignar fórmulas individuales a cada fila directamente desde la tabla.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Opciones for select */}
            {tipo === 'select' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">Opciones de la lista</label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto mb-2">
                  {opciones.map((op, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-1.5">
                      <span className="flex-1 text-sm text-slate-700">{op}</span>
                      <button onClick={() => removeOpcion(idx)} className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-rose-500 cursor-pointer">
                        <i className="ri-close-line text-xs" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input type="text" value={newOpcion} onChange={e => setNewOpcion(e.target.value)} onKeyDown={e => e.key === 'Enter' && addOpcion()}
                    placeholder="Nueva opción..." className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400" />
                  <button onClick={addOpcion} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm cursor-pointer whitespace-nowrap transition-colors">
                    <i className="ri-add-line" />
                  </button>
                </div>
              </div>
            )}

            {/* Formula builder */}
            {isFormulaType && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">
                  <i className="ri-functions mr-1 text-violet-600" />
                  Fórmula predeterminada <span className="text-slate-400 font-normal">(opcional — cada subproceso puede tener la suya)</span>
                </label>
                <FormulaBuilder config={formula} onChange={setFormula} ctx={ctx} />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className={`px-5 py-2 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
              isFormulaType ? 'bg-violet-500 hover:bg-violet-600' : 'bg-emerald-500 hover:bg-emerald-600'
            }`}
          >
            {editing ? 'Guardar cambios' : 'Agregar columna'}
          </button>
        </div>
      </div>
    </div>
  );
}
