import { useState, useRef, useEffect } from 'react';
import type { VolDistribucion } from '@/types/vol_distribucion';
import { COLOR_CONFIG } from '@/types/vol_distribucion';

interface Props {
  item: VolDistribucion;
  totalPct: number;
  onUpdate: (id: string, field: keyof VolDistribucion, value: string | number | boolean) => void;
  onDelete: (id: string) => void;
  saving: boolean;
}

export default function VolDistribucionItem({ item, totalPct, onUpdate, onDelete, saving }: Props) {
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(item.nombre);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descVal, setDescVal] = useState(item.descripcion ?? '');
  const [pctInput, setPctInput] = useState(String(item.porcentaje));
  const nameRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setNameVal(item.nombre); }, [item.nombre]);
  useEffect(() => { setPctInput(String(item.porcentaje)); }, [item.porcentaje]);
  useEffect(() => { setDescVal(item.descripcion ?? ''); }, [item.descripcion]);

  useEffect(() => {
    if (editingName && nameRef.current) nameRef.current.focus();
  }, [editingName]);
  useEffect(() => {
    if (editingDesc && descRef.current) descRef.current.focus();
  }, [editingDesc]);

  const colorCfg = COLOR_CONFIG[item.color ?? 'emerald'] ?? COLOR_CONFIG.emerald;

  const handlePctChange = (val: string) => {
    setPctInput(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0 && num <= 100) {
      onUpdate(item.id, 'porcentaje', num);
    }
  };

  const handleSliderChange = (val: number) => {
    setPctInput(String(val));
    onUpdate(item.id, 'porcentaje', val);
  };

  const handleNameCommit = () => {
    setEditingName(false);
    if (nameVal.trim() && nameVal.trim() !== item.nombre) {
      onUpdate(item.id, 'nombre', nameVal.trim());
    } else {
      setNameVal(item.nombre);
    }
  };

  const handleDescCommit = () => {
    setEditingDesc(false);
    if (descVal !== item.descripcion) {
      onUpdate(item.id, 'descripcion', descVal);
    }
  };

  const remaining = Math.max(0, 100 - totalPct + item.porcentaje);
  const isOverflow = totalPct > 100.01;

  return (
    <div className={`bg-white rounded-xl border-2 transition-all ${isOverflow ? 'border-rose-200' : 'border-slate-100'} p-5`}>
      <div className="flex items-start gap-4">
        {/* Color dot + icon */}
        <div className={`w-10 h-10 flex items-center justify-center rounded-xl flex-shrink-0 ${colorCfg.bg}`}>
          <i className={`${item.icono ?? 'ri-pie-chart-line'} text-lg ${colorCfg.text}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Name */}
          <div className="flex items-center gap-2 mb-1">
            {editingName ? (
              <input
                ref={nameRef}
                value={nameVal}
                onChange={e => setNameVal(e.target.value)}
                onBlur={handleNameCommit}
                onKeyDown={e => { if (e.key === 'Enter') handleNameCommit(); if (e.key === 'Escape') { setEditingName(false); setNameVal(item.nombre); } }}
                className="text-sm font-bold text-slate-800 bg-slate-50 border border-slate-300 rounded-lg px-2 py-0.5 focus:outline-none focus:border-emerald-400 w-full max-w-xs"
              />
            ) : (
              <button
                onClick={() => setEditingName(true)}
                className="text-sm font-bold text-slate-800 hover:text-emerald-600 transition-colors cursor-pointer text-left"
              >
                {item.nombre}
              </button>
            )}
            {saving && (
              <div className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            )}
          </div>

          {/* Description */}
          {editingDesc ? (
            <input
              ref={descRef}
              value={descVal}
              onChange={e => setDescVal(e.target.value)}
              onBlur={handleDescCommit}
              onKeyDown={e => { if (e.key === 'Enter') handleDescCommit(); if (e.key === 'Escape') { setEditingDesc(false); setDescVal(item.descripcion ?? ''); } }}
              placeholder="Descripción opcional..."
              className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 focus:outline-none focus:border-emerald-400 w-full mb-3"
            />
          ) : (
            <button
              onClick={() => setEditingDesc(true)}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors cursor-pointer text-left mb-3 block"
            >
              {item.descripcion || <span className="italic">Agregar descripción...</span>}
            </button>
          )}

          {/* Slider + input */}
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <input
                type="range"
                min={0}
                max={Math.min(100, remaining + item.porcentaje)}
                step={0.01}
                value={item.porcentaje}
                onChange={e => handleSliderChange(parseFloat(e.target.value))}
                className="w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, ${colorCfg.hex} 0%, ${colorCfg.hex} ${item.porcentaje}%, #e2e8f0 ${item.porcentaje}%, #e2e8f0 100%)`,
                }}
              />
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={pctInput}
                onChange={e => handlePctChange(e.target.value)}
                onBlur={() => {
                  const num = parseFloat(pctInput);
                  if (isNaN(num)) setPctInput(String(item.porcentaje));
                }}
                className="w-20 text-sm font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-right focus:outline-none focus:border-emerald-400 tabular-nums"
              />
              <span className="text-sm font-bold text-slate-500">%</span>
            </div>
          </div>

          {/* Bar visual */}
          <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${Math.min(item.porcentaje, 100)}%`, backgroundColor: colorCfg.hex }}
            />
          </div>

          {/* Token info */}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
              {`{VOLDIST_${item.nombre.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}}`}
            </span>
            <span className="text-xs text-slate-400">→ fracción decimal: {(item.porcentaje / 100).toFixed(4)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onUpdate(item.id, 'is_active', !item.is_active)}
            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
              item.is_active ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-300 hover:bg-slate-100'
            }`}
            title={item.is_active ? 'Desactivar' : 'Activar'}
          >
            <i className={`text-sm ${item.is_active ? 'ri-eye-line' : 'ri-eye-off-line'}`} />
          </button>
          <button
            onClick={() => onDelete(item.id)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer"
            title="Eliminar"
          >
            <i className="ri-delete-bin-line text-sm" />
          </button>
        </div>
      </div>
    </div>
  );
}
