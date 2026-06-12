/**
 * Generic cluster manager for any zona-based cost module.
 * Reads/writes to a per-module cluster table (e.g., costos_inbound_clusters).
 */
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface ZonaCluster {
  id: string;
  nombre: string;
  zonas: string[];
  color: string;
  orden: number;
}

interface ZonaClusterManagerProps {
  tableName: string;          // e.g. 'costos_inbound_clusters'
  clusters: ZonaCluster[];
  zonas: string[];            // all available zone names
  onChanged: () => void;
}

const COLORS = ['indigo','violet','sky','teal','emerald','amber','rose','orange'];

const COLOR_ACTIVE: Record<string,string> = {
  indigo:'bg-indigo-500 text-white', violet:'bg-violet-500 text-white',
  sky:'bg-sky-500 text-white', teal:'bg-teal-500 text-white',
  emerald:'bg-emerald-500 text-white', amber:'bg-amber-500 text-white',
  rose:'bg-rose-500 text-white', orange:'bg-orange-500 text-white',
};

export function clusterColorDot(color: string): string {
  const map: Record<string,string> = {
    indigo:'bg-indigo-500', violet:'bg-violet-500', sky:'bg-sky-500',
    teal:'bg-teal-500', emerald:'bg-emerald-500', amber:'bg-amber-500',
    rose:'bg-rose-500', orange:'bg-orange-500',
  };
  return map[color] ?? 'bg-indigo-500';
}

export function clusterActiveBg(color: string): string {
  return COLOR_ACTIVE[color] ?? COLOR_ACTIVE['indigo'];
}

export default function ZonaClusterManager({ tableName, clusters, zonas, onChanged }: ZonaClusterManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState('indigo');
  const [selectedZonas, setSelectedZonas] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const openNew = () => { setEditId(null); setNombre(''); setColor('indigo'); setSelectedZonas([]); setShowForm(true); };
  const openEdit = (c: ZonaCluster) => { setEditId(c.id); setNombre(c.nombre); setColor(c.color); setSelectedZonas([...c.zonas]); setShowForm(true); };
  const toggleZona = (z: string) => setSelectedZonas(prev => prev.includes(z) ? prev.filter(x => x !== z) : [...prev, z]);

  const handleSave = async () => {
    if (!nombre.trim() || selectedZonas.length === 0) return;
    setSaving(true);
    if (editId) {
      await supabase.from(tableName).update({ nombre: nombre.trim(), zonas: selectedZonas, color }).eq('id', editId);
    } else {
      await supabase.from(tableName).insert({ nombre: nombre.trim(), zonas: selectedZonas, color, orden: clusters.length });
    }
    setSaving(false); setShowForm(false); onChanged();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este cluster?')) return;
    await supabase.from(tableName).delete().eq('id', id);
    onChanged();
  };

  const usedZonas = new Set(clusters.flatMap(c => c.zonas));

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-700">Clusters de Zonas</p>
          <p className="text-xs text-slate-400 mt-0.5">Agrupa zonas para analizarlas como una sola unidad</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap">
          <i className="ri-add-line" /> Nuevo cluster
        </button>
      </div>

      {clusters.length === 0 && !showForm && (
        <p className="text-xs text-slate-400 italic py-2 text-center">Sin clusters. Crea uno para agrupar zonas.</p>
      )}

      {clusters.map(c => (
        <div key={c.id} className="bg-white border border-slate-200 rounded-lg px-3 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap flex-shrink-0 ${clusterActiveBg(c.color)}`}>{c.nombre}</span>
            <div className="flex flex-wrap gap-1">
              {c.zonas.map(z => <span key={z} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-xs rounded border border-slate-200 whitespace-nowrap">{z}</span>)}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => openEdit(c)} className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 cursor-pointer"><i className="ri-pencil-line text-xs" /></button>
            <button onClick={() => handleDelete(c.id)} className="w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 cursor-pointer"><i className="ri-delete-bin-line text-xs" /></button>
          </div>
        </div>
      ))}

      {showForm && (
        <div className="bg-white border border-slate-300 rounded-lg p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-700">{editId ? 'Editar cluster' : 'Nuevo cluster'}</p>
          <div className="flex gap-3 items-center">
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre (ej: Pesado, Seco, Norte...)" className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-slate-200 focus:border-slate-400 outline-none" />
            <div className="flex gap-1">
              {COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)} title={c} className={`w-6 h-6 rounded-full border-2 cursor-pointer transition-transform ${clusterActiveBg(c)} ${color === c ? 'border-slate-800 scale-110' : 'border-transparent'}`} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500 mb-2">Zonas disponibles — haz clic para agregar al cluster:</p>
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto py-1">
              {zonas.map(z => {
                const inOther = usedZonas.has(z) && !selectedZonas.includes(z);
                const selected = selectedZonas.includes(z);
                return (
                  <button key={z} onClick={() => !inOther && toggleZona(z)} disabled={inOther}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer whitespace-nowrap ${
                      selected ? `${clusterActiveBg(color)} border-transparent` :
                      inOther ? 'bg-slate-50 text-slate-300 border-slate-200 cursor-not-allowed' :
                      'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:bg-slate-50'
                    }`}>
                    {z}{inOther && <span className="ml-1 opacity-60 text-[10px]">(usado)</span>}
                  </button>
                );
              })}
            </div>
            {selectedZonas.length > 0 && <p className="text-xs text-slate-600 mt-1.5 font-medium">{selectedZonas.length} zona(s): {selectedZonas.join(', ')}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer">Cancelar</button>
            <button onClick={handleSave} disabled={!nombre.trim() || selectedZonas.length === 0 || saving}
              className="px-4 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white font-medium rounded-lg cursor-pointer">
              {saving ? 'Guardando...' : editId ? 'Actualizar' : 'Crear cluster'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
