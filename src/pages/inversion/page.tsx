import { useState, useEffect, useCallback } from 'react';
import AppLayout from '../../components/feature/AppLayout';
import { supabase, isSupabaseReady } from '../../lib/supabase';
import type { InversionRecord } from '../../types/inversion';
import { calcularInversion } from '../../types/inversion';
import InversionSummary from './components/InversionSummary';
import InversionTable from './components/InversionTable';

export default function InversionPage() {
  const [records, setRecords] = useState<InversionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!isSupabaseReady || !supabase) {
      setLoading(false);
      return;
    }
    try {
      const { data, error: err } = await supabase
        .from('inversiones')
        .select('*')
        .order('created_at', { ascending: true });
      if (err) throw err;
      setRecords(data ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const addRow = useCallback(async () => {
    const newRecord: InversionRecord = {
      id: crypto.randomUUID(),
      nombre: '',
      tipo: 'Activo Fijo',
      valor_inicial: 0,
      tasa_interes: 0,
      tasa_depreciacion: 0,
      rango: 1,
      unidad_rango: 'años',
      metodo_depreciacion: 'porcentaje',
    };

    if (isSupabaseReady && supabase) {
      const { data, error: err } = await supabase
        .from('inversiones')
        .insert({ ...newRecord })
        .select()
        .maybeSingle();
      if (!err && data) {
        setRecords((prev) => [...prev, data as InversionRecord]);
        return;
      }
    }
    setRecords((prev) => [...prev, newRecord]);
  }, []);

  const updateRow = useCallback(async (id: string, changes: Partial<InversionRecord>) => {
    setRecords((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes } : r)));

    if (isSupabaseReady && supabase) {
      setSaving((prev) => new Set(prev).add(id));
      try {
        await supabase.from('inversiones').update(changes).eq('id', id);
      } finally {
        setSaving((prev) => {
          const s = new Set(prev);
          s.delete(id);
          return s;
        });
      }
    }
  }, []);

  const deleteRow = useCallback(async (id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
    if (isSupabaseReady && supabase) {
      await supabase.from('inversiones').delete().eq('id', id);
    }
  }, []);

  const calculated = records.map(calcularInversion);

  if (loading) {
    return (
      <AppLayout title="Inversión" subtitle="Cargando registros...">
        <div className="flex items-center justify-center py-32">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Cargando inversiones...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout title="Inversión" subtitle="Error de conexión">
        <div className="flex items-center justify-center py-32">
          <div className="text-center max-w-sm">
            <div className="w-14 h-14 flex items-center justify-center rounded-full bg-rose-100 mx-auto mb-4">
              <i className="ri-error-warning-line text-rose-500 text-3xl" />
            </div>
            <p className="text-sm font-semibold text-slate-800 mb-2">Error al cargar datos</p>
            <p className="text-xs text-slate-400 mb-5">{error}</p>
            <button
              onClick={fetchData}
              className="px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap"
            >
              Reintentar
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Inversión"
      subtitle="Registra activos e inversiones y visualiza proyecciones de interés compuesto y depreciación"
    >
      <InversionSummary data={calculated} />
      <InversionTable
        data={calculated}
        saving={saving}
        onAdd={addRow}
        onUpdate={updateRow}
        onDelete={deleteRow}
      />
    </AppLayout>
  );
}
