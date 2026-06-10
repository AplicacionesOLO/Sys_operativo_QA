import { useState, useEffect } from 'react';
import type { Cotizacion, CotizacionEstado } from '@/types/cotizaciones';
import { ESTADO_CONFIG } from '@/types/cotizaciones';

interface Props {
  editing?: Cotizacion | null;
  onClose: () => void;
  onSave: (data: Partial<Cotizacion>) => Promise<void>;
}

const ESTADOS: CotizacionEstado[] = ['borrador', 'enviada', 'aprobada', 'rechazada'];

export default function CotizacionFormModal({ editing, onClose, onSave }: Props) {
  const [nombre, setNombre] = useState('');
  const [cliente, setCliente] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [notas, setNotas] = useState('');
  const [estado, setEstado] = useState<CotizacionEstado>('borrador');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setNombre(editing.nombre);
      setCliente(editing.cliente);
      setDescripcion(editing.descripcion ?? '');
      setNotas(editing.notas ?? '');
      setEstado(editing.estado);
    }
  }, [editing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || !cliente.trim()) return;
    setSaving(true);
    await onSave({ nombre: nombre.trim(), cliente: cliente.trim(), descripcion, notas, estado });
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">
              {editing ? 'Editar cotización' : 'Nueva cotización'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Completa los datos del cliente</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <i className="ri-close-line" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Nombre de la cotización <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Ej: Propuesta operación cliente ABC"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 text-slate-700 placeholder-slate-300"
                required
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                Cliente <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={cliente}
                onChange={e => setCliente(e.target.value)}
                placeholder="Nombre del cliente o empresa"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 text-slate-700 placeholder-slate-300"
                required
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Descripción</label>
              <textarea
                value={descripcion}
                onChange={e => setDescripcion(e.target.value)}
                placeholder="Descripción del alcance o servicios incluidos..."
                rows={2}
                maxLength={500}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 text-slate-700 placeholder-slate-300 resize-none"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notas internas</label>
              <textarea
                value={notas}
                onChange={e => setNotas(e.target.value)}
                placeholder="Notas internas (no aparecen en el PDF)..."
                rows={2}
                maxLength={500}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-100 text-slate-700 placeholder-slate-300 resize-none"
              />
            </div>
            {editing && (
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Estado</label>
                <div className="flex gap-2 flex-wrap">
                  {ESTADOS.map(e => {
                    const cfg = ESTADO_CONFIG[e];
                    return (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setEstado(e)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer whitespace-nowrap border-2 ${
                          estado === e
                            ? `${cfg.color} border-current`
                            : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <i className={cfg.icon} />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !nombre.trim() || !cliente.trim()}
              className="flex-1 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Crear cotización'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
