import { useState, useEffect, useCallback } from 'react';
import AppLayout from '../../components/feature/AppLayout';
import AreasTab from './components/AreasTab';
import TiposAreaTab from './components/TiposAreaTab';
import ZonasTab from './components/ZonasTab';
import { supabase, isSupabaseReady } from '../../lib/supabase';
import { cascadeRenameTokens, areaRenamePairs } from '@/lib/formulaTokenRename';
import { invalidateBaseCache } from '@/lib/formulaBaseCache';
import { logChange } from '@/lib/auditLog';
import type { Area, TipoArea, Zona } from '../../types/areas';
import type { FormulaContext } from '@/lib/formulaEngine';
import { EMPTY_FORMULA_CTX, calcularFormula } from '@/lib/formulaEngine';
import type { InversionRecord } from '@/types/inversion';

type Tab = 'areas' | 'zonas' | 'tipos';

export default function AreasPage() {
  const [activeTab, setActiveTab] = useState<Tab>('areas');
  const [areas, setAreas] = useState<Area[]>([]);
  const [tipos, setTipos] = useState<TipoArea[]>([]);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [formulaCtx, setFormulaCtx] = useState<FormulaContext>(EMPTY_FORMULA_CTX);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!isSupabaseReady || !supabase) {
      setError('NO_SUPABASE');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [tiposRes, areasRes, zonasRes, invRes, gastosColRes, gastosFilRes, areaDistRes, moColRes, moFilRes, volColRes, volFilRes, empRes, volDistRes, costosOpColRes, costosOpFilRes] = await Promise.all([
        supabase.from('tipos_area').select('*').order('nombre'),
        supabase.from('areas').select('*').order('nombre'),
        supabase.from('zona').select('*').order('nombre'),
        supabase.from('inversiones').select('*').order('created_at'),
        supabase.from('gastos_varios_columnas').select('id, nombre, tipo').order('orden'),
        supabase.from('gastos_varios').select('id, area, concepto, parent_id, es_total, tipo_fila, valores'),
        supabase.from('area_distribution').select('area_name, global_distribution_percentage'),
        supabase.from('mano_obra_columnas').select('id, nombre, tipo, is_sensitive').order('orden'),
        supabase.from('mano_obra').select('id, area, valores'),
        supabase.from('volumenes_columnas').select('id, nombre, tipo').order('orden'),
        supabase.from('volumenes').select('id, proceso, subproceso, valores'),
        supabase.from('mano_obra_empleados').select('*').eq('is_active', true),
        supabase.from('volumen_distribucion').select('id, nombre, porcentaje, porcentaje_inbound, porcentaje_outbound, categoria, is_active, unidades').eq('is_active', true).order('orden'),
        supabase.from('costos_columnas').select('*').order('orden'),
        supabase.from('costos_operacion').select('*').order('orden'),
      ]);
      if (tiposRes.error) throw tiposRes.error;
      if (areasRes.error) throw areasRes.error;
      if (zonasRes.error) throw zonasRes.error;
      setTipos(tiposRes.data ?? []);
      setAreas(areasRes.data ?? []);
      setZonas(zonasRes.data ?? []);

      // Build enriched area distribution with categories
      const areasWithCat = (areasRes.data ?? []) as Area[];
      const categoryTotals: Record<string, number> = {};
      areasWithCat.forEach(a => {
        const cat = a.categoria ?? 'Sin categoría';
        categoryTotals[cat] = (categoryTotals[cat] ?? 0) + (a.metros_cuadrados ?? 0);
      });
      const enrichedAreaDist = ((areaDistRes.data ?? []) as { area_name: string; global_distribution_percentage: number }[]).map(d => {
        const match = areasWithCat.find(a => a.nombre === d.area_name);
        const cat = match?.categoria ?? 'Sin categoría';
        const areaM2 = match?.metros_cuadrados ?? 0;
        const catTotal = categoryTotals[cat] ?? 0;
        const catPct = catTotal > 0 ? (areaM2 / catTotal) * 100 : 0;
        return {
          ...d,
          categoria: cat,
          category_distribution_percentage: +catPct.toFixed(2),
        };
      });

      // Build areasData with costo_area (computed in second pass)
      const mappedAreasData = areasWithCat.map(a => ({
        nombre: a.nombre,
        metros_cuadrados: a.metros_cuadrados ?? 0,
        cantidad_racks: a.cantidad_racks ?? 0,
        metros_cubicos: a.metros_cubicos ?? 0,
        costo_area: 0,
      }));

      const ctx: FormulaContext = {
        inversiones: (invRes.data as InversionRecord[]) ?? [],
        gastosColumnas: (gastosColRes.data ?? []) as FormulaContext['gastosColumnas'],
        gastosFilas: (gastosFilRes.data ?? []) as FormulaContext['gastosFilas'],
        areaDistribucion: enrichedAreaDist as FormulaContext['areaDistribucion'],
        manoObraColumnas: (moColRes.data ?? []) as FormulaContext['manoObraColumnas'],
        manoObraFilas: (moFilRes.data ?? []) as FormulaContext['manoObraFilas'],
        manoObraEmpleados: (empRes.data ?? []) as FormulaContext['manoObraEmpleados'],
        volumenesColumnas: (volColRes.data ?? []) as FormulaContext['volumenesColumnas'],
        volumenesFilas: (volFilRes.data ?? []) as FormulaContext['volumenesFilas'],
        costosColumnas: (costosOpColRes.data ?? []) as FormulaContext['costosColumnas'],
        costosFilas: (costosOpFilRes.data ?? []) as FormulaContext['costosFilas'],
        areasData: mappedAreasData,
        volDistribucion: (volDistRes.data ?? []) as FormulaContext['volDistribucion'],
      };

      // Second pass: compute costo_area for each area using its formula
      for (let i = 0; i < mappedAreasData.length; i++) {
        const a = mappedAreasData[i];
        const areaRecord = areasWithCat.find(ar => ar.nombre === a.nombre);
        if (areaRecord?.costo_area_formula) {
          mappedAreasData[i].costo_area = calcularFormula(areaRecord.costo_area_formula, ctx, a.nombre);
        } else {
          mappedAreasData[i].costo_area = areaRecord?.costo_area ?? 0;
        }
      }

      setFormulaCtx(ctx);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // --- Tipos CRUD ---
  const addTipo = async (data: Omit<TipoArea, 'id' | 'created_at'>) => {
    const { error: err } = await supabase.from('tipos_area').insert(data);
    if (!err) fetchAll();
  };

  const editTipo = async (id: string, data: Omit<TipoArea, 'id' | 'created_at'>) => {
    const { error: err } = await supabase.from('tipos_area').update(data).eq('id', id);
    if (!err) fetchAll();
  };

  const deleteTipo = async (id: string) => {
    const { error: err } = await supabase.from('tipos_area').delete().eq('id', id);
    if (!err) fetchAll();
  };

  // --- Zonas CRUD ---
  const addZona = async (data: Omit<Zona, 'id' | 'created_at'>) => {
    const { error: err } = await supabase.from('zona').insert(data);
    if (!err) fetchAll();
  };

  const editZona = async (id: string, data: Omit<Zona, 'id' | 'created_at'>) => {
    const { error: err } = await supabase.from('zona').update(data).eq('id', id);
    if (!err) fetchAll();
  };

  const deleteZona = async (id: string) => {
    const { error: err } = await supabase.from('zona').delete().eq('id', id);
    if (!err) fetchAll();
  };

  // --- Areas CRUD ---
  const addArea = async (data: Omit<Area, 'id' | 'created_at'>) => {
    const { error: err } = await supabase.from('areas').insert(data);
    if (!err) {
      invalidateBaseCache();
      logChange({ modulo: 'areas', accion: 'add_area', entidad_label: data.nombre, valor_despues: { nombre: data.nombre, metros_cuadrados: data.metros_cuadrados } });
      fetchAll();
    }
  };

  const editArea = async (id: string, data: Omit<Area, 'id' | 'created_at'>) => {
    const oldArea = areas.find(a => a.id === id);
    const { error: err } = await supabase.from('areas').update(data).eq('id', id);
    if (!err) {
      if (oldArea && data.nombre !== oldArea.nombre) {
        cascadeRenameTokens(areaRenamePairs(oldArea.nombre, data.nombre));
      }
      invalidateBaseCache();
      logChange({
        modulo: 'areas', accion: 'update_area',
        entidad_id: id, entidad_label: data.nombre,
        valor_antes: oldArea ? { nombre: oldArea.nombre, metros_cuadrados: oldArea.metros_cuadrados, metros_cubicos: oldArea.metros_cubicos, cantidad_racks: oldArea.cantidad_racks } : null,
        valor_despues: { nombre: data.nombre, metros_cuadrados: data.metros_cuadrados, metros_cubicos: data.metros_cubicos, cantidad_racks: data.cantidad_racks },
      });
      fetchAll();
    }
  };

  const deleteArea = async (id: string) => {
    const oldArea = areas.find(a => a.id === id);
    await supabase.from('areas').update({ parent_id: null }).eq('parent_id', id);
    const { error: err } = await supabase.from('areas').delete().eq('id', id);
    if (!err) {
      invalidateBaseCache();
      logChange({ modulo: 'areas', accion: 'delete_area', entidad_id: id, entidad_label: oldArea?.nombre, valor_antes: oldArea ? { nombre: oldArea.nombre } : null });
      fetchAll();
    }
  };

  const tabs: { id: Tab; label: string; icon: string; count: number }[] = [
    { id: 'areas', label: 'Áreas', icon: 'ri-map-pin-2-line', count: areas.length },
    { id: 'zonas', label: 'Zonas', icon: 'ri-map-2-line', count: zonas.length },
    { id: 'tipos', label: 'Tipos de Área', icon: 'ri-stack-line', count: tipos.length },
  ];

  if (loading) {
    return (
      <AppLayout title="Catálogo de Áreas" subtitle="Cargando datos...">
        <div className="flex items-center justify-center py-32">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Cargando catálogo...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    const isNoSupabase = error === 'NO_SUPABASE';
    return (
      <AppLayout title="Catálogo de Áreas" subtitle="Error de conexión">
        <div className="flex items-center justify-center py-32">
          <div className="text-center max-w-sm">
            <div className={`w-14 h-14 flex items-center justify-center rounded-full mx-auto mb-4 ${isNoSupabase ? 'bg-amber-100' : 'bg-rose-100'}`}>
              <i className={`text-3xl ${isNoSupabase ? 'ri-database-2-line text-amber-500' : 'ri-error-warning-line text-rose-500'}`} />
            </div>
            <p className="text-sm font-semibold text-slate-800 mb-2">
              {isNoSupabase ? 'Supabase no está configurado' : 'Error al cargar datos'}
            </p>
            <p className="text-xs text-slate-400 mb-5 leading-relaxed">
              {isNoSupabase
                ? 'Las variables de entorno de Supabase no están disponibles. Desconecta y vuelve a conectar Supabase desde el panel de configuración del proyecto.'
                : error}
            </p>
            {!isNoSupabase && (
              <button
                onClick={fetchAll}
                className="px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap"
              >
                Reintentar
              </button>
            )}
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Catálogo de Áreas"
      subtitle="Gestiona áreas, sub-áreas y sus tipos para clasificar los gastos operativos"
    >
      {/* Tabs */}
      <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 w-fit mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white text-slate-800'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <div className="w-4 h-4 flex items-center justify-center">
              <i className={`${tab.icon} text-sm`} />
            </div>
            {tab.label}
            <span
              className={`inline-block px-1.5 py-0.5 rounded-full text-xs font-semibold ${
                activeTab === tab.id
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-200 text-slate-500'
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {activeTab === 'areas' ? (
        <AreasTab
          areas={areas}
          tipos={tipos}
          zonas={zonas}
          formulaCtx={formulaCtx}
          onAdd={addArea}
          onEdit={editArea}
          onDelete={deleteArea}
        />
      ) : activeTab === 'zonas' ? (
        <ZonasTab
          zonas={zonas}
          areas={areas}
          onAdd={addZona}
          onEdit={editZona}
          onDelete={deleteZona}
        />
      ) : (
        <TiposAreaTab
          tipos={tipos}
          areas={areas}
          onAdd={addTipo}
          onEdit={editTipo}
          onDelete={deleteTipo}
        />
      )}
    </AppLayout>
  );
}
