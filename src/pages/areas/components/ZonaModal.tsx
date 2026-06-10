import { useState, useEffect } from 'react';
import type { Zona } from '../../../types/areas';

interface ZonaModalProps {
  zona: Zona | null;
  onClose: () => void;
  onSave: (zona: Omit<Zona, 'id' | 'created_at'>) => Promise<void>;
  saving: boolean;
}

export default function ZonaModal({ zona, onClose, onSave, saving }: ZonaModalProps) {
  const [nombre, setNombre] = useState('');

  useEffect(() => {
    if (zona) {
      setNombre(zona.nombre);
    } else {
      setNombre('');
    }
  }, [zona]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    await onSave({ nombre: nombre.trim() });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-teal-50">
              <i className="ri-map-pin-2-line text-teal-500 text-base" />
            </div>
            <h2 className="text-base font-bold text-slate-800">
              {zona ? 'Editar Zona' : 'Nueva Zona'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer"
          >
            <i className="ri-close-line text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Nombre de la Zona *
            </label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Zona Norte, Planta Alta, Edificio A..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-400"
              required
              autoFocus
            />
            <p className="mt-1.5 text-xs text-slate-400">
              El nombre debe ser único para identificar la zona dentro del sistema.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !nombre.trim()}
              className="flex-1 py-2 rounded-lg bg-teal-500 text-white text-sm font-medium hover:bg-teal-600 cursor-pointer whitespace-nowrap transition-colors disabled:opacity-60"
            >
              {saving ? 'Guardando...' : zona ? 'Guardar Cambios' : 'Crear Zona'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
