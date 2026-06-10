import { useState, useEffect } from 'react';
import type { CotizacionCabecera, CotizacionEstadoV2 } from '@/types/cotizaciones_v2';
import { MESES, MONEDAS, ESTADO_V2_CONFIG } from '@/types/cotizaciones_v2';

interface Props {
  editing?: CotizacionCabecera | null;
  defaultCliente?: string;
  onClose: () => void;
  onSave: (data: Omit<CotizacionCabecera, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'total_general'>) => Promise<void>;
}

const ESTADOS: CotizacionEstadoV2[] = ['borrador', 'vigente', 'cerrada', 'historica'];

export default function NuevaCotizacionModal({ editing, defaultCliente, onClose, onSave }: Props) {
  const now = new Date();
  const [cliente, setCliente] = useState(defaultCliente ?? '');
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const [version, setVersion] = useState(1);
  const [estado, setEstado] = useState<CotizacionEstadoV2>('borrador');
  const [moneda, setMoneda] = useState('USD');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setCliente(editing.cliente);
      setMes(editing.mes);
      setAnio(editing.anio);
      setVersion(editing.version);
      setEstado(editing.estado);
      setMoneda(editing.moneda);
      setNotas(editing.notas ?? '');
    }
  }, [editing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cliente.trim()) return;
    setSaving(true);
    await onSave({ cliente: cliente.trim(), mes, anio, version, estado, moneda, notas });
    setSaving(false);
    onClose();
  };

  const years = Array.from({ length: 8 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">
              {editing ? 'Editar cotización' : 'Nueva cotización'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {editing ? 'Modifica los datos de cabecera' : 'Define el período y cliente'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <i className="ri-close-line" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Cliente */}
          <div>
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

          {/* Mes / Año / Versión */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Mes</label>
              <select
                value={mes}
                onChange={e => setMes(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 text-slate-700 cursor-pointer"
              >
                {MESES.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Año</label>
              <select
                value={anio}
                onChange={e => setAnio(Number(e.target.value))}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 text-slate-700 cursor-pointer"
              >
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Versión</label>
              <input
                type="number"
                value={version}
                onChange={e => setVersion(Math.max(1, Number(e.target.value)))}
                min={1}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 text-slate-700"
              />
            </div>
          </div>

          {/* Moneda + Estado */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Moneda</label>
              <select
                value={moneda}
                onChange={e => setMoneda(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 text-slate-700 cursor-pointer"
              >
                {MONEDAS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Estado</label>
              <select
                value={estado}
                onChange={e => setEstado(e.target.value as CotizacionEstadoV2)}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 text-slate-700 cursor-pointer"
              >
                {ESTADOS.map(e => (
                  <option key={e} value={e}>{ESTADO_V2_CONFIG[e].label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notas</label>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder="Observaciones, condiciones comerciales..."
              rows={3}
              maxLength={500}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 text-slate-700 placeholder-slate-300 resize-none"
            />
            <p className="text-xs text-slate-400 mt-1 text-right">{notas.length}/500</p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !cliente.trim()}
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
