import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { VolDistribucion } from '@/types/vol_distribucion';
import { COLOR_CONFIG, ICON_OPTIONS, PROCESO_COLOR_MAP } from '@/types/vol_distribucion';

interface Props {
  onClose: () => void;
  onSave: (data: Omit<VolDistribucion, 'id' | 'created_at' | 'updated_at'>) => void;
  nextOrden: number;
  defaultCategoria?: string;
}

const COLORS = Object.keys(COLOR_CONFIG) as (keyof typeof COLOR_CONFIG)[];

export default function AddVolDistribucionModal({ onClose, onSave, nextOrden, defaultCategoria }: Props) {
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [porcentaje, setPorcentaje] = useState(0);
  const [categoria, setCategoria] = useState(defaultCategoria ?? '');
  const [color, setColor] = useState<string>('emerald');
  const [icono, setIcono] = useState('ri-pie-chart-line');
  const [procesos, setProcesos] = useState<string[]>([]);
  const [loadingProcesos, setLoadingProcesos] = useState(true);

  // Load procesos from costos_operacion
  useEffect(() => {
    supabase
      .from('costos_operacion')
      .select('proceso')
      .then(({ data }) => {
        const unique = [...new Set((data ?? []).map((r: { proceso: string }) => r.proceso).filter(Boolean))].sort();
        setProcesos(unique);
        // Auto-select color based on proceso
        if (defaultCategoria && PROCESO_COLOR_MAP[defaultCategoria]) {
          setColor(PROCESO_COLOR_MAP[defaultCategoria]);
        } else if (unique.length > 0 && !defaultCategoria) {
          setCategoria(unique[0]);
          setColor(PROCESO_COLOR_MAP[unique[0]] ?? 'emerald');
        }
        setLoadingProcesos(false);
      });
  }, [defaultCategoria]);

  // Auto-update color when categoria changes
  const handleCategoriaChange = (proc: string) => {
    setCategoria(proc);
    if (PROCESO_COLOR_MAP[proc]) {
      setColor(PROCESO_COLOR_MAP[proc]);
    }
  };

  const handleSave = () => {
    if (!nombre.trim() || !categoria) return;
    onSave({
      nombre: nombre.trim(),
      descripcion,
      porcentaje,
      categoria,
      color,
      icono,
      orden: nextOrden,
      is_active: true,
    });
    onClose();
  };

  const colorCfg = COLOR_CONFIG[color] ?? COLOR_CONFIG.emerald;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-800">Nueva distribución de volumen</h2>
            <p className="text-xs text-slate-400 mt-0.5">Asigna un segmento a un proceso de operación</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer">
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">

          {/* Proceso / Categoría — selector visual de chips */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">
              Proceso <span className="text-rose-400">*</span>
            </label>
            {loadingProcesos ? (
              <div className="flex items-center gap-2 py-2">
                <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-slate-400">Cargando procesos...</span>
              </div>
            ) : procesos.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No hay procesos en Costos por Operación</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {procesos.map(proc => {
                  const procColor = PROCESO_COLOR_MAP[proc] ?? 'slate';
                  const cfg = COLOR_CONFIG[procColor] ?? COLOR_CONFIG.slate;
                  const isSelected = categoria === proc;
                  return (
                    <button
                      key={proc}
                      onClick={() => handleCategoriaChange(proc)}
                      className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border-2 transition-all cursor-pointer whitespace-nowrap ${
                        isSelected
                          ? `border-transparent text-white`
                          : `border-slate-200 text-slate-600 hover:border-slate-300 bg-white`
                      }`}
                      style={isSelected ? { backgroundColor: cfg.hex, borderColor: cfg.hex } : {}}
                    >
                      <div className="w-4 h-4 flex items-center justify-center">
                        <i className={`${isSelected ? 'ri-checkbox-circle-fill' : 'ri-circle-line'} text-sm`} />
                      </div>
                      {proc}
                    </button>
                  );
                })}
              </div>
            )}
            {categoria && (
              <p className="text-xs text-slate-400 mt-1.5">
                <i className="ri-information-line mr-1" />
                Los tokens de este proceso se agrupan bajo <span className="font-mono font-semibold text-slate-600">{categoria}</span>
              </p>
            )}
          </div>

          {/* Nombre */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              Nombre del segmento <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder={`Ej: ${categoria ? `${categoria} Cliente A` : 'Inbound ZF, Outbound Nacional...'}`}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400 text-slate-800"
            />
            {nombre.trim() && (
              <p className="text-xs text-slate-400 mt-1 font-mono">
                Token: <span className="text-slate-600">{`{VOLDIST_${nombre.trim().replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}}`}</span>
              </p>
            )}
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Descripción</label>
            <input
              type="text"
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Descripción opcional..."
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-emerald-400 text-slate-800"
            />
          </div>

          {/* Porcentaje */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Porcentaje inicial</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                step={0.5}
                value={porcentaje}
                onChange={e => setPorcentaje(parseFloat(e.target.value))}
                className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, ${colorCfg.hex} 0%, ${colorCfg.hex} ${porcentaje}%, #e2e8f0 ${porcentaje}%, #e2e8f0 100%)`,
                }}
              />
              <div className="flex items-center gap-1 flex-shrink-0">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={porcentaje}
                  onChange={e => setPorcentaje(parseFloat(e.target.value) || 0)}
                  className="w-20 text-sm font-bold border border-slate-200 rounded-lg px-2 py-1 text-right focus:outline-none focus:border-emerald-400"
                />
                <span className="text-sm font-bold text-slate-500">%</span>
              </div>
            </div>
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">Color</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map(c => {
                const cfg = COLOR_CONFIG[c];
                return (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                      color === c ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: cfg.hex }}
                    title={c}
                  >
                    {color === c && <i className="ri-check-line text-white text-xs" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ícono */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">Ícono</label>
            <div className="flex flex-wrap gap-2">
              {ICON_OPTIONS.map(ic => (
                <button
                  key={ic}
                  onClick={() => setIcono(ic)}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all cursor-pointer ${
                    icono === ic
                      ? `${colorCfg.bg} ${colorCfg.text} ring-2 ring-offset-1 ring-slate-300`
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                  title={ic}
                >
                  <i className={`${ic} text-sm`} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 border border-slate-200 rounded-lg cursor-pointer whitespace-nowrap"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!nombre.trim() || !categoria}
            className="px-4 py-2 text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Crear distribución
          </button>
        </div>
      </div>
    </div>
  );
}
