import { useState, useEffect } from 'react';
import type { Area, TipoArea, Zona, CategoriaArea } from '../../../types/areas';
import type { FormulaConfig } from '@/types/costos';
import type { FormulaContext } from '@/lib/formulaEngine';
import { calcularFormula } from '@/lib/formulaEngine';
import FormulaBuilder from '@/pages/costos/components/FormulaBuilder';
import { formatMoneda } from '../../../types/areas';

interface AreaModalProps {
  area: Area | null;
  tipos: TipoArea[];
  zonas: Zona[];
  areas: Area[];
  defaultParentId: string | null;
  formulaCtx: FormulaContext;
  onClose: () => void;
  onSave: (area: Omit<Area, 'id' | 'created_at'>) => Promise<void>;
  saving: boolean;
}

export default function AreaModal({ area, tipos, zonas, areas, defaultParentId, formulaCtx, onClose, onSave, saving }: AreaModalProps) {
  const [nombre, setNombre] = useState('');
  const [tipoAreaId, setTipoAreaId] = useState<string>('');
  const [parentId, setParentId] = useState<string>('');
  const [zonaId, setZonaId] = useState<string>('');
  const [categoria, setCategoria] = useState<CategoriaArea | null>(null);
  const [metrosCuadrados, setMetrosCuadrados] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [activo, setActivo] = useState(true);
  const [tieneAutomatizacion, setTieneAutomatizacion] = useState(false);
  const [cantidadRacks, setCantidadRacks] = useState('');
  const [metrosCubicos, setMetrosCubicos] = useState('');
  const [costoArea, setCostoArea] = useState('');
  // Formula mode states
  const [costoFormulaMode, setCostoFormulaMode] = useState<'manual' | 'formula'>('manual');
  const [costoFormula, setCostoFormula] = useState<FormulaConfig>({ mode: 'expression', terminos: [], expression: '' });

  const topLevelAreas = areas.filter((a) => a.parent_id === null && a.id !== area?.id);
  const selectedTipo = tipos.find((t) => t.id === tipoAreaId);
  const selectedZona = zonas.find((z) => z.id === zonaId);
  const esZonaRacks = selectedZona?.nombre?.toLowerCase() === 'racks';

  // Modal width depends on formula mode
  const modalMaxWidth = costoFormulaMode === 'formula' ? 'max-w-5xl' : 'max-w-lg';

  useEffect(() => {
    if (area) {
      setNombre(area.nombre);
      setTipoAreaId(area.tipo_area_id ?? '');
      setParentId(area.parent_id ?? '');
      setZonaId(area.zona_id ?? '');
      setCategoria(area.categoria ?? null);
      setMetrosCuadrados(area.metros_cuadrados > 0 ? area.metros_cuadrados.toString() : '');
      setDescripcion(area.descripcion);
      setActivo(area.activo);
      setTieneAutomatizacion(area.tiene_automatizacion ?? false);
      setCantidadRacks(area.cantidad_racks != null ? area.cantidad_racks.toString() : '');
      setMetrosCubicos(area.metros_cubicos != null && area.metros_cubicos > 0 ? area.metros_cubicos.toString() : '');
      setCostoArea(area.costo_area != null && area.costo_area > 0 ? area.costo_area.toString() : '');
      // Initialize formula mode based on existing data
      const hasExistingFormula = area.costo_area_formula && (
        (area.costo_area_formula.mode === 'expression' && area.costo_area_formula.expression?.trim()) ||
        (area.costo_area_formula.mode === 'terms' && (area.costo_area_formula.terminos?.length ?? 0) > 0)
      );
      if (hasExistingFormula) {
        setCostoFormulaMode('formula');
        setCostoFormula(area.costo_area_formula);
      } else {
        setCostoFormulaMode('manual');
        setCostoFormula({ mode: 'expression', terminos: [], expression: '' });
      }
    } else {
      setNombre('');
      setTipoAreaId(tipos[0]?.id ?? '');
      setParentId(defaultParentId ?? '');
      setZonaId('');
      setCategoria(null);
      setMetrosCuadrados('');
      setDescripcion('');
      setActivo(true);
      setTieneAutomatizacion(false);
      setCantidadRacks('');
      setMetrosCubicos('');
      setCostoArea('');
      setCostoFormulaMode('manual');
      setCostoFormula({ mode: 'expression', terminos: [], expression: '' });
    }
  }, [area, tipos, defaultParentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;

    const hasFormulaContent = costoFormula && (
      (costoFormula.mode === 'expression' && costoFormula.expression?.trim()) ||
      (costoFormula.mode === 'terms' && (costoFormula.terminos?.length ?? 0) > 0)
    );

    await onSave({
      nombre: nombre.trim(),
      tipo_area_id: tipoAreaId || null,
      parent_id: parentId || null,
      zona_id: zonaId || null,
      categoria: categoria,
      metros_cuadrados: parseFloat(metrosCuadrados) || 0,
      moneda: selectedTipo?.moneda ?? 'USD',
      descripcion: descripcion.trim(),
      activo,
      tiene_automatizacion: tieneAutomatizacion,
      metros_automatizacion: 0,
      cantidad_racks: esZonaRacks && cantidadRacks !== '' ? parseInt(cantidadRacks, 10) : null,
      metros_cubicos: parseFloat(metrosCubicos) || null,
      costo_area: costoFormulaMode === 'manual' ? (parseFloat(costoArea) || null) : null,
      costo_area_formula: costoFormulaMode === 'formula' && hasFormulaContent ? costoFormula : null,
    });
  };

  const formulaPreview = costoFormulaMode === 'formula' && costoFormula
    ? calcularFormula(costoFormula, formulaCtx, nombre || 'Área')
    : null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-xl w-full ${modalMaxWidth} flex flex-col max-h-[90vh] transition-all duration-300`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <h2 className="text-base font-bold text-slate-800">
            {area ? 'Editar Área' : defaultParentId ? 'Nueva Sub-Área' : 'Nueva Área'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 cursor-pointer">
            <i className="ri-close-line text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre del Área *</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej. Operativa en Piso"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              required
            />
          </div>

          {/* Categoría — toggle Interior / Exterior */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Categoría</label>
            <div className="flex gap-2">
              {(['Interior', 'Exterior'] as CategoriaArea[]).map((cat) => {
                const isActive = categoria === cat;
                const config = cat === 'Interior'
                  ? { icon: 'ri-home-3-line', activeClass: 'border-amber-400 bg-amber-50 text-amber-700', inactiveClass: 'border-slate-200 text-slate-500 hover:border-amber-200 hover:bg-amber-50/50' }
                  : { icon: 'ri-sun-line', activeClass: 'border-sky-400 bg-sky-50 text-sky-700', inactiveClass: 'border-slate-200 text-slate-500 hover:border-sky-200 hover:bg-sky-50/50' };
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoria(isActive ? null : cat)}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all cursor-pointer ${isActive ? config.activeClass : config.inactiveClass}`}
                  >
                    <div className="w-4 h-4 flex items-center justify-center">
                      <i className={`${config.icon} text-sm`} />
                    </div>
                    {cat}
                  </button>
                );
              })}
            </div>
            {categoria === null && (
              <p className="text-xs text-slate-400 mt-1">Opcional — selecciona si aplica</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Tipo */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Tipo de Área</label>
              <select
                value={tipoAreaId}
                onChange={(e) => setTipoAreaId(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
              >
                <option value="">Sin tipo</option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre}</option>
                ))}
              </select>
            </div>

            {/* Zona */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Zona</label>
              <select
                value={zonaId}
                onChange={(e) => setZonaId(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
              >
                <option value="">Sin zona</option>
                {zonas.map((z) => (
                  <option key={z.id} value={z.id}>{z.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Cantidad de Racks — solo visible si zona es Racks */}
          {esZonaRacks && (
            <div className="rounded-xl border-2 border-amber-200 bg-amber-50/50 p-4 transition-all">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 flex items-center justify-center rounded-lg bg-amber-100">
                  <i className="ri-layout-grid-line text-amber-600 text-sm" />
                </div>
                <span className="text-sm font-semibold text-amber-800">Configuración de Racks</span>
                <span className="text-xs text-amber-500 bg-amber-100 px-2 py-0.5 rounded-full">Opcional</span>
              </div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Cantidad de Racks</label>
              <div className="relative">
                <input
                  type="number"
                  value={cantidadRacks}
                  onChange={(e) => setCantidadRacks(e.target.value)}
                  placeholder="Ej. 24"
                  min="0"
                  step="1"
                  className="w-full border border-amber-200 rounded-lg pl-4 pr-16 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-amber-500 font-medium">racks</span>
              </div>
              <p className="text-xs text-amber-600 mt-2 flex items-center gap-1.5">
                <i className="ri-information-line" />
                Ingresa el número total de racks disponibles en esta área
              </p>
            </div>
          )}

          {/* Área padre */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Área Principal</label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
            >
              <option value="">Ninguna (raíz)</option>
              {topLevelAreas.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre}</option>
              ))}
            </select>
          </div>

          {/* Metros cuadrados y cúbicos */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Metros Cuadrados (m²)</label>
              <div className="relative">
                <input
                  type="number"
                  value={metrosCuadrados}
                  onChange={(e) => setMetrosCuadrados(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full border border-slate-200 rounded-lg pl-4 pr-12 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">m²</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Metros Cúbicos (m³)</label>
              <div className="relative">
                <input
                  type="number"
                  value={metrosCubicos}
                  onChange={(e) => setMetrosCubicos(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full border border-slate-200 rounded-lg pl-4 pr-12 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">m³</span>
              </div>
            </div>
          </div>

          {/* Costo del área — Manual o Fórmula */}
          <div className={`rounded-xl border-2 transition-all ${costoFormulaMode === 'formula' ? 'border-teal-200 bg-teal-50/30' : 'border-slate-200'} p-4`}>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-slate-700">Costo del Área</label>
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setCostoFormulaMode('manual')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${costoFormulaMode === 'manual' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <i className="ri-edit-line mr-1" />
                  Manual
                </button>
                <button
                  type="button"
                  onClick={() => setCostoFormulaMode('formula')}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${costoFormulaMode === 'formula' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <i className="ri-function-line mr-1" />
                  Fórmula
                </button>
              </div>
            </div>

            {costoFormulaMode === 'manual' ? (
              <div>
                <div className="relative">
                  <input
                    type="number"
                    value={costoArea}
                    onChange={(e) => setCostoArea(e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="w-full border border-slate-200 rounded-lg pl-4 pr-16 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-medium">{selectedTipo?.moneda ?? 'USD'}</span>
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  Valor manual del costo del área. Si usás fórmula, este valor se ignora.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-white rounded-lg border border-slate-200">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    <i className="ri-information-line mr-1 text-slate-400" />
                    Construí una fórmula usando variables del sistema: inversiones, gastos varios, mano de obra, volúmenes, distribución de áreas, m², racks, m³, etc. El resultado se guarda como el costo de esta área.
                  </p>
                </div>
                <FormulaBuilder
                  config={costoFormula}
                  onChange={(config) => setCostoFormula(config)}
                  ctx={formulaCtx}
                />
                {formulaPreview !== null && formulaPreview > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-lg">
                    <div className="w-4 h-4 flex items-center justify-center">
                      <i className="ri-eye-line text-emerald-500 text-xs" />
                    </div>
                    <p className="text-xs text-emerald-700">
                      Vista previa del costo calculado:{' '}
                      <span className="font-bold font-mono">{formatMoneda(formulaPreview, selectedTipo?.moneda ?? 'USD')}</span>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sección Automatización */}
          <div className={`rounded-xl border-2 transition-all ${tieneAutomatizacion ? 'border-violet-200 bg-violet-50/50' : 'border-slate-200 bg-slate-50/50'} p-4`}>
            <label className="flex items-center gap-3 cursor-pointer select-none" onClick={() => setTieneAutomatizacion(!tieneAutomatizacion)}>
              <div className={`w-5 h-5 flex items-center justify-center rounded border-2 transition-all shrink-0 ${tieneAutomatizacion ? 'bg-violet-500 border-violet-500' : 'border-slate-300 bg-white'}`}>
                {tieneAutomatizacion && <i className="ri-check-line text-white text-xs" />}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 flex items-center justify-center">
                  <i className={`ri-robot-line text-sm ${tieneAutomatizacion ? 'text-violet-500' : 'text-slate-400'}`} />
                </div>
                <span className={`text-sm font-medium ${tieneAutomatizacion ? 'text-violet-700' : 'text-slate-600'}`}>
                  Esta área tiene automatización
                </span>
              </div>
            </label>
            {tieneAutomatizacion && (
              <div className="mt-3 pt-3 border-t border-violet-200">
                <p className="text-xs text-violet-600 flex items-center gap-1.5">
                  <i className="ri-check-double-line" />
                  Área marcada con sistema de automatización activo
                </p>
              </div>
            )}
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Descripción</label>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Descripción del área..."
              rows={2}
              maxLength={500}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
            />
          </div>

          {/* Activo */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setActivo(!activo)}
                className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${activo ? 'bg-emerald-500' : 'bg-slate-300'}`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${activo ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm font-medium text-slate-700">Área Activa</span>
            </label>
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
              {saving ? 'Guardando...' : area ? 'Guardar Cambios' : 'Crear Área'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
