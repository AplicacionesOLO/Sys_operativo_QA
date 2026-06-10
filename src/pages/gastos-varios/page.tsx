import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import AppLayout from '@/components/feature/AppLayout';
import type { GastoVarioFila, TipoFila } from '@/types/gastos_varios';
import type { FormulaConfig } from '@/types/costos';
import EstadoFinancieroTable from './components/EstadoFinancieroTable';
import AddConceptoModal from './components/AddConceptoModal';
import BulkUploadFinanciero from './components/BulkUploadFinanciero';

type ModalState =
  | { open: false }
  | { open: true; parentId: string | null };

interface ParsedRowImport {
  concepto: string;
  nivel: number;
  tipo_fila: TipoFila;
  es_total: boolean;
  valores: Record<string, number | undefined>;
}

interface DeleteError {
  message: string;
  usages: string[];
}

export default function GastosVariosPage() {
  const [filas, setFilas] = useState<GastoVarioFila[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ open: false });
  const [showBulk, setShowBulk] = useState(false);
  const [deleteError, setDeleteError] = useState<DeleteError | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('gastos_varios')
      .select('*')
      .order('orden', { ascending: true });
    setFilas((data as GastoVarioFila[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Add root or child ──────────────────────────────────────────────────────
  const handleAddConcepto = async (data: {
    concepto: string;
    parent_id: string | null;
    tipo_fila: TipoFila;
    es_total: boolean;
  }) => {
    let nivel = 0;
    if (data.parent_id) {
      const parent = filas.find(f => f.id === data.parent_id);
      nivel = (parent?.nivel ?? 0) + 1;
    }

    const maxOrden = filas.length > 0 ? Math.max(...filas.map(f => f.orden ?? 0)) + 1 : 0;

    const { data: newRow } = await supabase
      .from('gastos_varios')
      .insert({
        concepto: data.concepto,
        parent_id: data.parent_id,
        nivel,
        tipo_fila: data.tipo_fila,
        es_total: data.es_total,
        orden: maxOrden,
        valores: {},
      })
      .select()
      .maybeSingle();

    if (newRow) setFilas(prev => [...prev, newRow as GastoVarioFila]);
    setModal({ open: false });
  };

  // ── Update field or value ──────────────────────────────────────────────────
  const handleUpdate = useCallback(async (
    id: string,
    field: string,
    value: string | number | null
  ) => {
    setSavingId(id);
    setFilas(prev =>
      prev.map(f => {
        if (f.id !== id) return f;
        const numericFields = ['mes', 'ppto_mes', 'psdo_mes', 'acum', 'ppto_acum', 'psdo_acum'];
        if (numericFields.includes(field)) {
          const newValores = { ...f.valores, [field]: value === null ? undefined : Number(value) };
          return { ...f, valores: newValores };
        }
        return { ...f, [field]: value };
      })
    );

    const numericFields = ['mes', 'ppto_mes', 'psdo_mes', 'acum', 'ppto_acum', 'psdo_acum'];
    if (numericFields.includes(field)) {
      const fila = filas.find(f => f.id === id);
      if (!fila) { setSavingId(null); return; }
      const newValores = { ...fila.valores, [field]: value === null ? undefined : Number(value) };
      await supabase.from('gastos_varios').update({ valores: newValores }).eq('id', id);
    } else {
      await supabase.from('gastos_varios').update({ [field]: value }).eq('id', id);
    }

    setSavingId(null);
  }, [filas]);

  // ── Check if concept is used in formulas ───────────────────────────────────
  const checkGvFormulaUsage = useCallback(async (id: string): Promise<string[]> => {
    const fila = filas.find(f => f.id === id);
    if (!fila) return [];

    const safeToken = fila.concepto.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase().slice(0, 30);
    const tokenPrefix = `GV_${safeToken}`;

    const usages: string[] = [];

    // Check costos_columnas
    const { data: columnas } = await supabase
      .from('costos_columnas')
      .select('nombre, formula');

    (columnas ?? []).forEach((col: { nombre: string; formula: FormulaConfig | null }) => {
      const expr = col.formula?.expression ?? '';
      if (expr.includes(tokenPrefix)) {
        usages.push(`Columna de costo: "${col.nombre}"`);
      }
    });

    // Check costos_operacion row formulas
    const { data: filasCostos } = await supabase
      .from('costos_operacion')
      .select('subproceso, formulas');

    (filasCostos ?? []).forEach((f: { subproceso: string; formulas: Record<string, FormulaConfig> | null }) => {
      if (!f.formulas) return;
      const hasUsage = Object.values(f.formulas).some(
        (fc: FormulaConfig) => (fc?.expression ?? '').includes(tokenPrefix)
      );
      if (hasUsage) {
        usages.push(`Subproceso de costo: "${f.subproceso}"`);
      }
    });

    return [...new Set(usages)];
  }, [filas]);

  // ── Delete (with formula protection) ──────────────────────────────────────
  const handleDelete = async (id: string) => {
    setDeleteError(null);

    const usages = await checkGvFormulaUsage(id);
    if (usages.length > 0) {
      setDeleteError({
        message: 'Este concepto no puede eliminarse porque está referenciado en fórmulas de Costos de Operación:',
        usages,
      });
      return;
    }

    const getAllDescendants = (parentId: string): string[] => {
      const children = filas.filter(f => f.parent_id === parentId).map(f => f.id);
      return [...children, ...children.flatMap(getAllDescendants)];
    };
    const toDelete = [id, ...getAllDescendants(id)];
    await supabase.from('gastos_varios').delete().in('id', toDelete);
    setFilas(prev => prev.filter(f => !toDelete.includes(f.id)));
  };

  // ── Bulk import (upsert: overwrite existing, insert new) ──────────────────
  const handleBulkImport = async (
    rows: ParsedRowImport[]
  ): Promise<{ inserted: number; updated: number; errors: number }> => {
    let inserted = 0;
    let updated = 0;
    let errors = 0;

    // Map existing rows by concepto name (case-insensitive)
    const existingMap = new Map<string, GastoVarioFila>();
    filas.forEach(f => existingMap.set(f.concepto.toLowerCase().trim(), f));

    const maxOrden = filas.length > 0 ? Math.max(...filas.map(f => f.orden ?? 0)) : 0;

    // Parent tracking stack: keeps (rowId, nivel) pairs
    const parentIdStack: (string | null)[] = [null];
    const levelStack: number[] = [-1];

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];

      // Pop stack to find parent at proper level
      while (levelStack.length > 1 && levelStack[levelStack.length - 1] >= row.nivel) {
        levelStack.pop();
        parentIdStack.pop();
      }
      const parent_id = parentIdStack[parentIdStack.length - 1];

      const cleanKey = row.concepto.toLowerCase().trim();
      const existing = existingMap.get(cleanKey);

      const valores = Object.fromEntries(
        Object.entries(row.valores).filter(([, v]) => v !== undefined)
      );

      let rowId: string;

      if (existing) {
        // UPDATE existing — overwrite values and type info, keep hierarchy
        const { error } = await supabase
          .from('gastos_varios')
          .update({
            tipo_fila: row.tipo_fila,
            es_total: row.es_total,
            valores,
          })
          .eq('id', existing.id);

        if (error) {
          errors++;
          rowId = existing.id; // still use for parent tracking
        } else {
          updated++;
          rowId = existing.id;
        }
      } else {
        // INSERT new
        const { data: created, error } = await supabase
          .from('gastos_varios')
          .insert({
            concepto: row.concepto,
            parent_id,
            nivel: row.nivel,
            tipo_fila: row.tipo_fila,
            es_total: row.es_total,
            orden: maxOrden + idx + 1,
            valores,
          })
          .select()
          .maybeSingle();

        if (error || !created) {
          errors++;
          rowId = `__err_${idx}`;
        } else {
          inserted++;
          rowId = (created as GastoVarioFila).id;
        }
      }

      // Push current row as potential parent for deeper rows
      parentIdStack.push(rowId);
      levelStack.push(row.nivel);
    }

    if (inserted + updated > 0) await loadData();
    return { inserted, updated, errors };
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <AppLayout title="Gastos Varios" subtitle="Cargando estado financiero...">
        <div className="flex items-center justify-center py-32">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Cargando datos financieros...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Gastos Varios"
      subtitle="Estado financiero estructurado con jerarquías y análisis de presupuesto vs real"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBulk(true)}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <div className="w-4 h-4 flex items-center justify-center"><i className="ri-upload-cloud-2-line" /></div>
            Carga masiva
          </button>
          <button
            onClick={() => setModal({ open: true, parentId: null })}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <div className="w-4 h-4 flex items-center justify-center"><i className="ri-add-line" /></div>
            Agregar concepto
          </button>
        </div>
      }
    >
      {/* Delete error notification */}
      {deleteError && (
        <div className="mb-4 bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-rose-100 flex-shrink-0 mt-0.5">
            <i className="ri-error-warning-line text-rose-500 text-base" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-rose-700">{deleteError.message}</p>
            <ul className="mt-1.5 space-y-0.5">
              {deleteError.usages.map((u, i) => (
                <li key={i} className="text-xs text-rose-600 flex items-center gap-1.5">
                  <i className="ri-arrow-right-s-line" />{u}
                </li>
              ))}
            </ul>
            <p className="text-xs text-rose-500 mt-2">
              Elimina o actualiza las fórmulas que lo referencian antes de borrarlo.
            </p>
          </div>
          <button
            onClick={() => setDeleteError(null)}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-rose-100 text-rose-400 cursor-pointer flex-shrink-0"
          >
            <i className="ri-close-line text-sm" />
          </button>
        </div>
      )}

      {/* Summary bar */}
      {filas.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-5">
          {[
            { label: 'Mes', key: 'mes', color: 'text-emerald-600' },
            { label: 'Ppto Mes', key: 'ppto_mes', color: 'text-slate-600' },
            { label: 'Psdo Mes', key: 'psdo_mes', color: 'text-slate-500' },
            { label: 'Acumulado', key: 'acum', color: 'text-sky-600' },
            { label: 'Ppto Acum', key: 'ppto_acum', color: 'text-slate-600' },
            { label: 'Psdo Acum', key: 'psdo_acum', color: 'text-slate-500' },
          ].map(({ label, key, color }) => {
            const roots = filas.filter(f => !f.parent_id);
            const total = roots.reduce((s, r) => s + (Number(r.valores?.[key]) || 0), 0);
            return (
              <div key={key} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
                <p className="text-xs text-slate-400 font-medium mb-0.5">{label}</p>
                <p className={`text-sm font-bold tabular-nums ${color}`}>
                  {total !== 0
                    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(total)
                    : '—'}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <EstadoFinancieroTable
        filas={filas}
        savingId={savingId}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onAddChild={(parentId) => setModal({ open: true, parentId })}
        onAddRoot={() => setModal({ open: true, parentId: null })}
      />

      {modal.open && (
        <AddConceptoModal
          filas={filas}
          defaultParentId={modal.parentId}
          onClose={() => setModal({ open: false })}
          onSave={handleAddConcepto}
        />
      )}

      {showBulk && (
        <BulkUploadFinanciero
          filas={filas}
          onClose={() => setShowBulk(false)}
          onImport={handleBulkImport}
        />
      )}
    </AppLayout>
  );
}
