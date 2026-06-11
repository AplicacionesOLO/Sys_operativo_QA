import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/feature/AppLayout';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ModuleSummary {
  modulo: string;
  total: number;
  last_change: string;
  users: string[];
}

interface BitacoraEntry {
  id: string;
  user_email: string;
  modulo: string;
  accion: string;
  entidad_label: string | null;
  campo: string | null;
  valor_antes: unknown;
  valor_despues: unknown;
  created_at: string;
}

// ── Module display config ─────────────────────────────────────────────────────

const MODULE_META: Record<string, { label: string; icon: string; bg: string; dot: string }> = {
  costos:           { label: 'Costos por Operación', icon: 'ri-calculator-line',    bg: 'bg-violet-50 border-violet-200',   dot: 'bg-violet-500'  },
  cotizaciones:     { label: 'Cotizaciones',          icon: 'ri-file-list-3-line',   bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  'mano-obra':      { label: 'Mano de Obra',          icon: 'ri-user-3-line',        bg: 'bg-blue-50 border-blue-200',       dot: 'bg-blue-500'    },
  inversiones:      { label: 'Inversiones',           icon: 'ri-building-2-line',    bg: 'bg-amber-50 border-amber-200',     dot: 'bg-amber-500'   },
  areas:            { label: 'Áreas',                 icon: 'ri-layout-grid-line',   bg: 'bg-teal-50 border-teal-200',       dot: 'bg-teal-500'    },
  'gastos-varios':  { label: 'Gastos Varios',         icon: 'ri-receipt-line',       bg: 'bg-rose-50 border-rose-200',       dot: 'bg-rose-500'    },
  volumenes:        { label: 'Volúmenes',             icon: 'ri-bar-chart-box-line', bg: 'bg-indigo-50 border-indigo-200',   dot: 'bg-indigo-500'  },
  almacen:          { label: 'Almacén',               icon: 'ri-store-2-line',       bg: 'bg-cyan-50 border-cyan-200',       dot: 'bg-cyan-500'    },
};

function getModuleMeta(modulo: string) {
  return MODULE_META[modulo] ?? { label: modulo, icon: 'ri-settings-3-line', bg: 'bg-slate-50 border-slate-200', dot: 'bg-slate-400' };
}

const ACCION_LABELS: Record<string, string> = {
  update_cell:           'Valor editado',
  update_formula:        'Fórmula actualizada',
  clear_formula:         'Fórmula removida',
  update_column:         'Columna modificada',
  delete_column:         'Columna eliminada',
  update_row:            'Fila modificada',
  add_row:               'Fila agregada',
  delete_row:            'Fila eliminada',
  update_multiplicador:  'Multiplicador editado',
  update_valor_dinamico: 'Valor dinámico editado',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1)  return 'hace un momento';
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—';

  // FormulaConfig — show the expression or term names instead of raw JSON
  if (typeof val === 'object' && val !== null && 'mode' in (val as object)) {
    const f = val as { mode: string; expression?: string; terminos?: { referenciaNombre?: string; tipo?: string }[] };
    if (f.mode === 'expression') {
      const expr = (f.expression ?? '').replace(/\n+/g, ' ').trim();
      return expr || '(sin expresión)';
    }
    if (f.mode === 'terms') {
      const terms = f.terminos ?? [];
      if (terms.length === 0) return '(sin términos)';
      return terms.map(t => t.referenciaNombre ?? t.tipo ?? '?').join(' + ');
    }
  }

  if (typeof val === 'object') {
    try { return JSON.stringify(val, null, 2); } catch { return String(val); }
  }
  if (typeof val === 'number') return val.toLocaleString('es-MX', { maximumFractionDigits: 4 });
  return String(val);
}

// ── DiffView ─────────────────────────────────────────────────────────────────

function DiffView({ antes, despues }: { antes: unknown; despues: unknown }) {
  const a = formatValue(antes);
  const d = formatValue(despues);
  if (a === d) return null;
  return (
    <div className="mt-2 space-y-1 font-mono text-xs">
      {antes !== null && antes !== undefined && (
        <div className="flex gap-2 items-start bg-rose-50 border border-rose-100 rounded-lg px-2.5 py-1.5">
          <span className="text-rose-400 font-bold select-none mt-px">−</span>
          <span className="text-rose-700 whitespace-pre-wrap break-all leading-relaxed">{a}</span>
        </div>
      )}
      {despues !== null && despues !== undefined && (
        <div className="flex gap-2 items-start bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5">
          <span className="text-emerald-500 font-bold select-none mt-px">+</span>
          <span className="text-emerald-700 whitespace-pre-wrap break-all leading-relaxed">{d}</span>
        </div>
      )}
    </div>
  );
}

// ── EntryRow ─────────────────────────────────────────────────────────────────

function EntryRow({ entry }: { entry: BitacoraEntry }) {
  const accionLabel = ACCION_LABELS[entry.accion] ?? entry.accion;
  return (
    <div className="px-5 py-4 hover:bg-slate-50 transition-colors">
      <div className="flex items-start justify-between gap-4 mb-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">
            {accionLabel}
          </span>
          {entry.entidad_label && (
            <span className="text-xs text-slate-500">
              <i className="ri-arrow-right-s-line" />{entry.entidad_label}
            </span>
          )}
          {entry.campo && (
            <span className="text-xs text-violet-600 font-medium bg-violet-50 px-2 py-0.5 rounded-full">
              {entry.campo}
            </span>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs font-medium text-slate-700">{entry.user_email.split('@')[0]}</p>
          <p className="text-xs text-slate-400">{formatDate(entry.created_at)}</p>
        </div>
      </div>
      <DiffView antes={entry.valor_antes} despues={entry.valor_despues} />
    </div>
  );
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: number; color: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <i className={`${icon} text-lg`} />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-800 font-[Sora]">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}

// ── SetupBanner ───────────────────────────────────────────────────────────────

const SETUP_SQL = `-- Ejecutar en Supabase → SQL Editor
CREATE TABLE IF NOT EXISTS bitacora_cambios (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email    TEXT NOT NULL DEFAULT '',
  modulo        TEXT NOT NULL,
  accion        TEXT NOT NULL,
  entidad_tipo  TEXT,
  entidad_id    TEXT,
  entidad_label TEXT,
  campo         TEXT,
  valor_antes   JSONB,
  valor_despues JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bitacora_modulo
  ON bitacora_cambios(modulo, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bitacora_created
  ON bitacora_cambios(created_at DESC);

ALTER TABLE bitacora_cambios ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado puede registrar cambios
CREATE POLICY "bitacora_insert" ON bitacora_cambios
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- Solo admins pueden leer
CREATE POLICY "bitacora_select_admin" ON bitacora_cambios
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.nombre = 'Administrador'
    )
  );

-- Solo admins pueden eliminar (limpieza automática de 7 días)
CREATE POLICY "bitacora_delete_admin" ON bitacora_cambios
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN roles r ON p.role_id = r.id
      WHERE p.id = auth.uid() AND r.nombre = 'Administrador'
    )
  );`;

function SetupBanner() {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(SETUP_SQL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex gap-3">
        <i className="ri-information-line text-amber-500 text-xl flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-amber-800 mb-1">Configuración inicial requerida</p>
          <p className="text-sm text-amber-700">
            La tabla <code className="bg-amber-100 px-1 rounded font-mono">bitacora_cambios</code> aún no existe.
            Copia el SQL y ejecútalo en <strong>Supabase → SQL Editor</strong>, luego recarga esta página.
          </p>
        </div>
      </div>
      <div className="relative">
        <pre className="bg-slate-900 text-slate-300 text-xs rounded-xl p-5 overflow-x-auto leading-relaxed">{SETUP_SQL}</pre>
        <button
          onClick={copy}
          className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs rounded-lg transition-colors cursor-pointer"
        >
          <i className={`${copied ? 'ri-checkbox-circle-line' : 'ri-clipboard-line'} text-sm`} />
          {copied ? 'Copiado' : 'Copiar SQL'}
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const SEVEN_DAYS_AGO = () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

export default function BitacoraPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const isAdmin = role?.nombre === 'Administrador';

  const [loading, setLoading] = useState(true);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [summaries, setSummaries] = useState<ModuleSummary[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [moduleEntries, setModuleEntries] = useState<Record<string, BitacoraEntry[]>>({});
  const [loadingModule, setLoadingModule] = useState<string | null>(null);

  // Non-admins get redirected
  useEffect(() => {
    if (role && !isAdmin) navigate('/', { replace: true });
  }, [role, isAdmin, navigate]);

  const loadSummaries = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('bitacora_cambios')
      .select('modulo, created_at, user_email')
      .gte('created_at', SEVEN_DAYS_AGO())
      .order('created_at', { ascending: false });

    if (error) {
      // table doesn't exist yet
      if (error.code === '42P01' || error.message?.includes('does not exist')) setSetupNeeded(true);
      setLoading(false);
      return;
    }

    // Aggregate by module
    const map = new Map<string, { total: number; last_change: string; users: Set<string> }>();
    for (const row of (data ?? [])) {
      const e = map.get(row.modulo);
      if (!e) {
        map.set(row.modulo, { total: 1, last_change: row.created_at, users: new Set([row.user_email]) });
      } else {
        e.total++;
        e.users.add(row.user_email);
        if (row.created_at > e.last_change) e.last_change = row.created_at;
      }
    }
    setSummaries(
      Array.from(map.entries())
        .map(([modulo, v]) => ({ modulo, total: v.total, last_change: v.last_change, users: Array.from(v.users) }))
        .sort((a, b) => b.last_change.localeCompare(a.last_change))
    );

    // Cleanup entries older than 7 days (fire-and-forget — admin has DELETE permission)
    supabase.from('bitacora_cambios').delete().lt('created_at', SEVEN_DAYS_AGO()).then(() => {});

    setLoading(false);
  }, []);

  useEffect(() => { if (isAdmin) loadSummaries(); }, [isAdmin, loadSummaries]);

  const loadModuleEntries = useCallback(async (modulo: string) => {
    if (moduleEntries[modulo]) return;
    setLoadingModule(modulo);
    const { data } = await supabase
      .from('bitacora_cambios')
      .select('id, user_email, modulo, accion, entidad_label, campo, valor_antes, valor_despues, created_at')
      .eq('modulo', modulo)
      .gte('created_at', SEVEN_DAYS_AGO())
      .order('created_at', { ascending: false })
      .limit(100);
    setModuleEntries(prev => ({ ...prev, [modulo]: (data as BitacoraEntry[]) ?? [] }));
    setLoadingModule(null);
  }, [moduleEntries]);

  const toggleModule = useCallback((modulo: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(modulo)) { next.delete(modulo); }
      else { next.add(modulo); loadModuleEntries(modulo); }
      return next;
    });
  }, [loadModuleEntries]);

  if (!isAdmin) return null;

  const totalChanges = summaries.reduce((s, m) => s + m.total, 0);
  const uniqueUsers = new Set(summaries.flatMap(m => m.users)).size;

  return (
    <AppLayout
      title="Bitácora de Cambios"
      subtitle="Registro de actividad de los últimos 7 días · Solo administradores"
      actions={
        !loading && !setupNeeded && (
          <button
            onClick={loadSummaries}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium rounded-lg transition-colors cursor-pointer"
          >
            <i className="ri-refresh-line text-sm" />
            Actualizar
          </button>
        )
      }
    >
      {setupNeeded ? (
        <SetupBanner />
      ) : loading ? (
        <div className="flex items-center justify-center py-32">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Cargando bitácora...</p>
          </div>
        </div>
      ) : summaries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 flex items-center justify-center rounded-2xl bg-slate-100">
            <i className="ri-history-line text-3xl text-slate-400" />
          </div>
          <div className="text-center">
            <p className="text-slate-700 font-bold text-lg">Sin actividad registrada</p>
            <p className="text-slate-400 text-sm mt-1">No hay cambios en los últimos 7 días.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <StatCard icon="ri-history-line"  label="Cambios (7 días)"     value={totalChanges}     color="bg-violet-50 text-violet-600" />
            <StatCard icon="ri-apps-2-line"   label="Módulos con actividad" value={summaries.length} color="bg-emerald-50 text-emerald-600" />
            <StatCard icon="ri-user-line"     label="Usuarios activos"      value={uniqueUsers}      color="bg-amber-50 text-amber-600" />
          </div>

          {/* Module cards */}
          <div className="space-y-3">
            {summaries.map(summary => {
              const meta = getModuleMeta(summary.modulo);
              const isOpen = expanded.has(summary.modulo);
              const entries = moduleEntries[summary.modulo] ?? [];
              const isLoadingThis = loadingModule === summary.modulo;

              return (
                <div key={summary.modulo} className={`border rounded-xl overflow-hidden ${meta.bg}`}>
                  {/* Card header — clickable */}
                  <button
                    onClick={() => toggleModule(summary.modulo)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-black/[0.03] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-slate-200 shadow-sm flex-shrink-0">
                        <i className={`${meta.icon} text-slate-600`} />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold text-slate-800">{meta.label}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                          <p className="text-xs text-slate-500">
                            {summary.total} cambio{summary.total !== 1 ? 's' : ''} · último {timeAgo(summary.last_change)}
                          </p>
                          <span className="text-slate-300">·</span>
                          <p className="text-xs text-slate-400">
                            {summary.users.slice(0, 2).map(u => u.split('@')[0]).join(', ')}
                            {summary.users.length > 2 ? ` +${summary.users.length - 2}` : ''}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs bg-white border border-slate-200 px-2 py-0.5 rounded-full font-semibold text-slate-600">
                        {summary.total}
                      </span>
                      <i className={`ri-arrow-${isOpen ? 'up' : 'down'}-s-line text-slate-400 text-lg`} />
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="border-t border-slate-200 bg-white">
                      {isLoadingThis ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : entries.length === 0 ? (
                        <p className="text-center text-sm text-slate-400 py-6">Sin registros</p>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {entries.map(entry => <EntryRow key={entry.id} entry={entry} />)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
