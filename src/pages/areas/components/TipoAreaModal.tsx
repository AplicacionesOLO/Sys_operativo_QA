import { useState, useEffect } from 'react';
import type { TipoArea } from '../../../types/areas';
import { TIPO_COLORS, MONEDAS } from '../../../types/areas';

interface TipoAreaModalProps {
  tipo: TipoArea | null;
  onClose: () => void;
  onSave: (tipo: Omit<TipoArea, 'id' | 'created_at'>) => Promise<void>;
  saving: boolean;
}

const ICONOS = [
  'ri-building-line', 'ri-store-line', 'ri-team-line', 'ri-settings-3-line',
  'ri-service-line', 'ri-car-line', 'ri-home-line', 'ri-hospital-line',
  'ri-restaurant-line', 'ri-computer-line', 'ri-tools-line', 'ri-archive-line',
  'ri-sun-line', 'ri-map-pin-2-line', 'ri-stack-line', 'ri-box-3-line',
];

const COLORES = Object.keys(TIPO_COLORS);
const COLOR_LABELS: Record<string, string> = {
  emerald: 'Verde', amber: 'Ámbar', rose: 'Rosa',
  sky: 'Cielo', violet: 'Violeta', orange: 'Naranja',
};

export default function TipoAreaModal({ tipo, onClose, onSave, saving }: TipoAreaModalProps) {
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [color, setColor] = useState('emerald');
  const [icono, setIcono] = useState('ri-building-line');
  const [costoPorM2, setCostoPorM2] = useState('');
  const [moneda, setMoneda] = useState('USD');

  useEffect(() => {
    if (tipo) {
      setNombre(tipo.nombre);
      setDescripcion(tipo.descripcion);
      setColor(tipo.color);
      setIcono(tipo.icono);
      setCostoPorM2(tipo.costo_por_m2 > 0 ? tipo.costo_por_m2.toString() : '');
      setMoneda(tipo.moneda ?? 'USD');
    } else {
      setNombre(''); setDescripcion(''); setColor('emerald');
      setIcono('ri-building-line'); setCostoPorM2(''); setMoneda('USD');
    }
  }, [tipo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    await onSave({
      nombre: nombre.trim(),
      descripcion: descripcion.trim(),
      color,
      icono,
      costo_por_m2: parseFloat(costoPorM2) || 0,
      moneda,
    });
  };

  const selectedMoneda = MONEDAS.find((m) => m.code === moneda);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-slate-800">
            {tipo ? 'Editar Tipo de Área' : 'Nuevo Tipo de Área'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer">
            <i className="ri-close-line text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre *</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Áreas Operativas"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              required
            />
          </div>

          {/* Costo por m² + Moneda */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Costo por m²
              <span className="ml-1.5 text-xs font-normal text-slate-400">(define el costo automático de las áreas)</span>
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">
                  {selectedMoneda?.symbol ?? '$'}
                </span>
                <input
                  type="number"
                  value={costoPorM2}
                  onChange={(e) => setCostoPorM2(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              <select
                value={moneda}
                onChange={(e) => setMoneda(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer w-32"
              >
                {MONEDAS.map((m) => (
                  <option key={m.code} value={m.code}>{m.code} — {m.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Descripción</label>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Descripción breve..."
              rows={2}
              maxLength={500}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Color</label>
            <div className="flex gap-2 flex-wrap">
              {COLORES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-all border-2 ${TIPO_COLORS[c]} ${color === c ? 'border-current scale-105' : 'border-transparent'}`}
                >
                  {COLOR_LABELS[c]}
                </button>
              ))}
            </div>
          </div>

          {/* Ícono */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Ícono</label>
            <div className="grid grid-cols-8 gap-1.5">
              {ICONOS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcono(ic)}
                  className={`w-9 h-9 flex items-center justify-center rounded-lg border-2 cursor-pointer transition-all ${icono === ic ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <i className={`${ic} text-base text-slate-600`} />
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer whitespace-nowrap">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 rounded-lg bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 cursor-pointer whitespace-nowrap transition-colors disabled:opacity-60"
            >
              {saving ? 'Guardando...' : tipo ? 'Guardar Cambios' : 'Crear Tipo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
