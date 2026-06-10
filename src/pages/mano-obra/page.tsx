import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import AppLayout from '@/components/feature/AppLayout';
import BulkUploadModal from '@/components/feature/BulkUploadModal';
import type { ManoObraFila, ModuloColumna, ColumnType } from '@/types/mano_obra';
import type { EmpleadoImportado } from '@/types/mano_obra_empleados';
import { encryptValues, encryptSingle, decryptValues } from '@/lib/manoObraCrypto';
import { useAuth } from '@/contexts/AuthContext';
import ManoObraTable from './components/ManoObraTable';
import AddColumnModal from './components/AddColumnModal';
import EmpleadosImportModal from './components/EmpleadosImportModal';
import EmpleadosTable from './components/EmpleadosTable';
import EmpleadosSummary from './components/EmpleadosSummary';

type Tab = 'general' | 'empleados';
type ModalState = { open: false } | { open: true; editing: ModuloColumna | null };

const BULK_FIELDS = [
  { key: 'nombre', label: 'Nombre', required: true },
  { key: 'area', label: 'Área' },
  { key: 'tipo', label: 'Tipo' },
];

export default function ManoObraPage() {
  const { role } = useAuth();
  const isAdmin = role?.nombre === 'Administrador';

  const [activeTab, setActiveTab] = useState<Tab>('empleados');

  // ── General tab state ────────────────────────────────────────────────────
  const [columnas, setColumnas]         = useState<ModuloColumna[]>([]);
  const [filas, setFilas]               = useState<ManoObraFila[]>([]);
  const [decryptedData, setDecryptedData] = useState<Record<string, Record<string, string>>>({});
  const [loadingGeneral, setLoadingGeneral] = useState(true);
  const [savingId, setSavingId]         = useState<string | null>(null);
  const [modalState, setModalState]     = useState<ModalState>({ open: false });
  const [showBulk, setShowBulk]         = useState(false);

  // ── Empleados tab state ──────────────────────────────────────────────────
  const [empleados, setEmpleados]         = useState<EmpleadoImportado[]>([]);
  const [loadingEmpleados, setLoadingEmpleados] = useState(true);
  const [showImport, setShowImport]       = useState(false);

  // ── Load general data ────────────────────────────────────────────────────
  const decryptAllSensitive = useCallback(async (cols: ModuloColumna[], rows: ManoObraFila[]) => {
    if (!isAdmin) return;
    const sensitiveCols = cols.filter(c => c.is_sensitive);
    if (sensitiveCols.length === 0) return;
    const tasks: { filaId: string; colId: string; value: string }[] = [];
    rows.forEach(fila => {
      sensitiveCols.forEach(col => {
        const raw = fila.valores[col.id];
        if (raw !== null && raw !== undefined && raw !== '') {
          tasks.push({ filaId: fila.id, colId: col.id, value: String(raw) });
        }
      });
    });
    if (tasks.length === 0) return;
    try {
      const encrypted = tasks.map(t => t.value);
      const decrypted = await decryptValues(encrypted);
      const newMap: Record<string, Record<string, string>> = {};
      tasks.forEach((task, idx) => {
        if (!newMap[task.filaId]) newMap[task.filaId] = {};
        newMap[task.filaId][task.colId] = decrypted[idx];
      });
      setDecryptedData(newMap);
    } catch (err) {
      console.error('Error al desencriptar:', err);
    }
  }, [isAdmin]);

  const loadGeneral = useCallback(async () => {
    setLoadingGeneral(true);
    const [{ data: colData }, { data: filData }] = await Promise.all([
      supabase.from('mano_obra_columnas').select('*').order('orden'),
      supabase.from('mano_obra').select('*').order('created_at'),
    ]);
    const cols = (colData as ModuloColumna[]) ?? [];
    const rows = (filData as ManoObraFila[]) ?? [];
    setColumnas(cols);
    setFilas(rows);
    setLoadingGeneral(false);
    await decryptAllSensitive(cols, rows);
  }, [decryptAllSensitive]);

  // ── Load empleados data ──────────────────────────────────────────────────
  const loadEmpleados = useCallback(async () => {
    setLoadingEmpleados(true);
    const { data } = await supabase
      .from('mano_obra_empleados')
      .select('*')
      .eq('is_active', true)
      .order('created_at');
    setEmpleados((data as EmpleadoImportado[]) ?? []);
    setLoadingEmpleados(false);
  }, []);

  useEffect(() => {
    loadGeneral();
    loadEmpleados();
  }, [loadGeneral, loadEmpleados]);

  // ── General handlers ─────────────────────────────────────────────────────
  const handleSaveColumn = async (data: { nombre: string; tipo: ColumnType; opciones: string[]; is_sensitive: boolean }) => {
    const isEditing = modalState.open && modalState.editing;
    if (isEditing && modalState.editing) {
      const { data: updated } = await supabase
        .from('mano_obra_columnas')
        .update({ nombre: data.nombre, tipo: data.tipo, opciones: data.opciones, is_sensitive: data.is_sensitive })
        .eq('id', modalState.editing.id).select().maybeSingle();
      if (updated) setColumnas(prev => prev.map(c => c.id === (updated as ModuloColumna).id ? updated as ModuloColumna : c));
    } else {
      const { data: newCol } = await supabase
        .from('mano_obra_columnas')
        .insert({ ...data, orden: columnas.length }).select().maybeSingle();
      if (newCol) setColumnas(prev => [...prev, newCol as ModuloColumna]);
    }
    setModalState({ open: false });
  };

  const handleDeleteColumn = async (id: string) => {
    if (!confirm('¿Eliminar esta columna? Se perderán todos los valores registrados en ella.')) return;
    await supabase.from('mano_obra_columnas').delete().eq('id', id);
    setColumnas(prev => prev.filter(c => c.id !== id));
    setFilas(prev => prev.map(f => { const nv = { ...f.valores }; delete nv[id]; return { ...f, valores: nv }; }));
  };

  const handleAddFila = async () => {
    const { data: newFila } = await supabase
      .from('mano_obra').insert({ nombre: 'Nuevo empleado', area: '', tipo: '', valores: {} }).select().maybeSingle();
    if (newFila) setFilas(prev => [...prev, newFila as ManoObraFila]);
  };

  const handleUpdateFila = useCallback(async (id: string, field: string, value: string) => {
    setSavingId(id);
    setFilas(prev => prev.map(f => f.id === id ? { ...f, [field]: value } : f));
    await supabase.from('mano_obra').update({ [field]: value }).eq('id', id);
    setSavingId(null);
  }, []);

  const handleUpdateCell = useCallback(async (id: string, columnaId: string, value: string | number, sensitive: boolean) => {
    setSavingId(id);
    if (sensitive && isAdmin) {
      try {
        const encrypted = await encryptSingle(String(value));
        setFilas(prev => prev.map(f => {
          if (f.id !== id) return f;
          const fila = prev.find(r => r.id === id)!;
          return { ...f, valores: { ...fila.valores, [columnaId]: encrypted } };
        }));
        setDecryptedData(prev => ({ ...prev, [id]: { ...(prev[id] ?? {}), [columnaId]: String(value) } }));
        const fila = filas.find(f => f.id === id);
        if (fila) await supabase.from('mano_obra').update({ valores: { ...fila.valores, [columnaId]: encrypted } }).eq('id', id);
      } catch (err) { console.error(err); }
    } else {
      setFilas(prev => prev.map(f => f.id !== id ? f : { ...f, valores: { ...f.valores, [columnaId]: value } }));
      const fila = filas.find(f => f.id === id);
      if (fila) await supabase.from('mano_obra').update({ valores: { ...fila.valores, [columnaId]: value } }).eq('id', id);
    }
    setSavingId(null);
  }, [filas, isAdmin]);

  const handleDeleteFila = async (id: string) => {
    await supabase.from('mano_obra').delete().eq('id', id);
    setFilas(prev => prev.filter(f => f.id !== id));
    setDecryptedData(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const handleBulkUpload = async (rows: Record<string, string>[]): Promise<{ inserted: number; errors: number }> => {
    let inserted = 0; let errors = 0;
    const sensitiveCols = columnas.filter(c => c.is_sensitive);
    const inserts = await Promise.all(rows.map(async row => {
      const rawValores: Record<string, string> = row['__valores__'] ? JSON.parse(row['__valores__']) : {};
      if (isAdmin && sensitiveCols.length > 0) {
        const toEncrypt = sensitiveCols.filter(col => rawValores[col.nombre]).map(col => ({ key: col.nombre, value: rawValores[col.nombre] }));
        if (toEncrypt.length > 0) {
          const enc = await encryptValues(toEncrypt.map(t => t.value));
          toEncrypt.forEach((t, i) => { rawValores[t.key] = enc[i]; });
        }
      } else { sensitiveCols.forEach(col => { delete rawValores[col.nombre]; }); }
      return { nombre: row.nombre || 'Sin nombre', area: row.area || '', tipo: row.tipo || '', valores: rawValores };
    }));
    for (let i = 0; i < inserts.length; i += 50) {
      const { error } = await supabase.from('mano_obra').insert(inserts.slice(i, i + 50));
      if (error) errors += 50; else inserted += inserts.slice(i, i + 50).length;
    }
    if (inserted > 0) await loadGeneral();
    return { inserted, errors };
  };

  // ── Empleados handlers ───────────────────────────────────────────────────
  const handleDeleteEmpleado = async (id: string) => {
    await supabase.from('mano_obra_empleados').delete().eq('id', id);
    setEmpleados(prev => prev.filter(e => e.id !== id));
  };

  const isLoading = loadingGeneral && loadingEmpleados;

  if (isLoading) {
    return (
      <AppLayout title="Mano de Obra" subtitle="Cargando módulo...">
        <div className="flex items-center justify-center py-32">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Cargando datos...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  const sensitiveCount = columnas.filter(c => c.is_sensitive).length;

  return (
    <AppLayout
      title="Mano de Obra"
      subtitle={
        activeTab === 'general'
          ? `Registro de personal${sensitiveCount > 0 ? ` · ${sensitiveCount} campo(s) sensible(s) encriptado(s)` : ''}`
          : `${empleados.length} empleados importados · Distribución disponible en Fórmulas Personalizadas`
      }
      actions={
        <div className="flex items-center gap-2">
          {activeTab === 'general' ? (
            <>
              <button onClick={() => setShowBulk(true)} className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap">
                <div className="w-4 h-4 flex items-center justify-center"><i className="ri-upload-cloud-2-line" /></div>
                Carga masiva
              </button>
              <button onClick={() => setModalState({ open: true, editing: null })} className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap">
                <div className="w-4 h-4 flex items-center justify-center"><i className="ri-add-line" /></div>
                Agregar columna
              </button>
              <button onClick={handleAddFila} className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap">
                <div className="w-4 h-4 flex items-center justify-center"><i className="ri-add-line" /></div>
                Agregar registro
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <div className="w-4 h-4 flex items-center justify-center"><i className="ri-file-excel-2-line" /></div>
              Importar empleados
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        {/* Tabs */}
        <div className="flex gap-1 px-1 py-1 bg-slate-100 rounded-xl w-fit">
          <TabBtn active={activeTab === 'general'} onClick={() => setActiveTab('general')} icon="ri-table-line" label="Registro General" />
          <TabBtn
            active={activeTab === 'empleados'}
            onClick={() => setActiveTab('empleados')}
            icon="ri-group-2-line"
            label={`Empleados importados${empleados.length > 0 ? ` (${empleados.length})` : ''}`}
          />
        </div>

        {/* Tab: General */}
        {activeTab === 'general' && (
          <ManoObraTable
            columnas={columnas}
            filas={filas}
            savingId={savingId}
            isAdmin={isAdmin}
            decryptedData={decryptedData}
            onAddColumn={() => setModalState({ open: true, editing: null })}
            onEditColumn={col => setModalState({ open: true, editing: col })}
            onDeleteColumn={handleDeleteColumn}
            onAddFila={handleAddFila}
            onUpdateFila={handleUpdateFila}
            onUpdateCell={handleUpdateCell}
            onDeleteFila={handleDeleteFila}
          />
        )}

        {/* Tab: Empleados */}
        {activeTab === 'empleados' && (
          <>
            <EmpleadosSummary empleados={empleados} />
            <EmpleadosTable empleados={empleados} onDelete={handleDeleteEmpleado} />
          </>
        )}
      </div>

      {/* Modals */}
      {modalState.open && (
        <AddColumnModal
          onClose={() => setModalState({ open: false })}
          onSave={handleSaveColumn}
          editing={modalState.editing}
        />
      )}
      {showBulk && (
        <BulkUploadModal
          title="Mano de Obra"
          tableName="mano_obra"
          fixedFields={BULK_FIELDS}
          onClose={() => setShowBulk(false)}
          onUpload={handleBulkUpload}
        />
      )}
      {showImport && (
        <EmpleadosImportModal
          onClose={() => setShowImport(false)}
          onSuccess={loadEmpleados}
        />
      )}
    </AppLayout>
  );
}

// ── Tab button ────────────────────────────────────────────────────────────────

interface TabBtnProps { active: boolean; onClick: () => void; icon: string; label: string; }

function TabBtn({ active, onClick, icon, label }: TabBtnProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer whitespace-nowrap ${
        active
          ? 'bg-white text-slate-800 shadow-sm'
          : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      <div className="w-4 h-4 flex items-center justify-center">
        <i className={`${icon} text-sm`} />
      </div>
      {label}
    </button>
  );
}
