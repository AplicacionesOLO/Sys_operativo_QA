import { useState, useEffect } from 'react';
import type { ColumnType, ModuloColumna } from '@/types/volumenes';
import { COLUMN_TYPES } from '@/types/volumenes';

interface AddColumnModalProps {
  onClose: () => void;
  onSave: (data: { nombre: string; tipo: ColumnType; opciones: string[] }) => void;
  editing?: ModuloColumna | null;
}

const DEFAULT_OPCIONES = ['Opción 1', 'Opción 2', 'Opción 3'];

export default function AddColumnModal({ onClose, onSave, editing }: AddColumnModalProps) {
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<ColumnType>('numero');
  const [opciones, setOpciones] = useState<string[]>([...DEFAULT_OPCIONES]);
  const [newOpcion, setNewOpcion] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (editing) {
      setNombre(editing.nombre);
      setTipo(editing.tipo);
      setOpciones(editing.opciones?.length ? editing.opciones : [...DEFAULT_OPCIONES]);
    }
  }, [editing]);

  const handleSave = () => {
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return; }
    onSave({ nombre: nombre.trim(), tipo, opciones });
  };

  const addOpcion = () => {
    if (!newOpcion.trim()) return;
    setOpciones(prev => [...prev, newOpcion.trim()]);
    setNewOpcion('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              {editing ? 'Editar columna' : 'Agregar columna'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Define nombre y tipo de dato</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Nombre <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={nombre}
              onChange={e => { setNombre(e.target.value); setError(''); }}
              placeholder="ej. Unidades, Peso (kg), Pallets..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
            />
            {error && <p className="text-xs text-rose-500 mt-1">{error}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">Tipo de dato</label>
            <div className="grid grid-cols-2 gap-2">
              {COLUMN_TYPES.map(ct => (
                <button
                  key={ct.value}
                  onClick={() => setTipo(ct.value)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
                    tipo === ct.value
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="w-4 h-4 flex items-center justify-center">
                    <i className={`${ct.icon} text-sm`} />
                  </div>
                  {ct.label}
                </button>
              ))}
            </div>
          </div>

          {tipo === 'select' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">Opciones de la lista</label>
              <div className="space-y-1.5 max-h-36 overflow-y-auto mb-2">
                {opciones.map((op, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-1.5">
                    <span className="flex-1 text-sm text-slate-700">{op}</span>
                    <button
                      onClick={() => setOpciones(prev => prev.filter((_, i) => i !== idx))}
                      className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-rose-500 cursor-pointer"
                    >
                      <i className="ri-close-line text-xs" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newOpcion}
                  onChange={e => setNewOpcion(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addOpcion()}
                  placeholder="Nueva opción..."
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                />
                <button onClick={addOpcion} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm cursor-pointer whitespace-nowrap transition-colors">
                  <i className="ri-add-line" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap">
            Cancelar
          </button>
          <button onClick={handleSave} className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap">
            {editing ? 'Guardar cambios' : 'Agregar columna'}
          </button>
        </div>
      </div>
    </div>
  );
}
