import { useState, useRef, useCallback, DragEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { parseEmpleadosFile } from '@/lib/manoObraEmpleadosParser';
import type { EmpleadosParseResult } from '@/types/mano_obra_empleados';

interface EmpleadosImportModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'select' | 'preview' | 'uploading' | 'done';

// ── Helpers ──────────────────────────────────────────────────────────────────

function genBatchId(): string {
  return `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function EmpleadosImportModal({ onClose, onSuccess }: EmpleadosImportModalProps) {
  const [step, setStep]           = useState<Step>('select');
  const [dragging, setDragging]   = useState(false);
  const [result, setResult]       = useState<EmpleadosParseResult | null>(null);
  const [fileName, setFileName]   = useState('');
  const [clearPrev, setClearPrev] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadedCount, setUploadedCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setResult({
        rows: [], totalRows: 0, validRows: 0, errorRows: 0,
        errors: ['Solo se aceptan archivos .xlsx, .xls o .csv'],
      });
      setStep('preview');
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      const parsed = parseEmpleadosFile(buffer, file.name);
      setResult(parsed);
      setStep('preview');
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleUpload = async () => {
    if (!result || result.errors.length > 0 || result.validRows === 0) return;
    setStep('uploading');
    setUploadError('');

    try {
      if (clearPrev) {
        await supabase.from('mano_obra_empleados').delete().eq('is_active', true);
      }

      const batchId = genBatchId();
      const validRows = result.rows.filter(r => r.errors.length === 0);

      const inserts = validRows.map(r => ({
        departamento:      r.departamento,
        puesto_descripcion: r.puesto_descripcion,
        jefe_inmediato:    r.jefe_inmediato,
        seccion:           r.seccion,
        area:              r.area,
        dist:              r.dist,
        empresa_lab:       r.empresa_lab,
        silo:              r.silo,
        tipo:              r.tipo,
        import_batch_id:   batchId,
        source_file_name:  fileName,
        is_active:         true,
      }));

      // Insert in chunks of 100
      const CHUNK = 100;
      let inserted = 0;
      for (let i = 0; i < inserts.length; i += CHUNK) {
        const chunk = inserts.slice(i, i + CHUNK);
        const { error } = await supabase.from('mano_obra_empleados').insert(chunk);
        if (error) throw new Error(`Error al guardar: ${error.message}`);
        inserted += chunk.length;
      }

      setUploadedCount(inserted);
      setStep('done');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Error desconocido');
      setStep('preview');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Importar empleados desde Excel / CSV</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Columnas: Departamento · Puesto Descripción · Jefe Inmediato · Sección · Área · Dist · Empresa Lab · Silo · Tipo
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 cursor-pointer"
          >
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 overflow-y-auto flex-1">

          {/* STEP: select */}
          {step === 'select' && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-4 cursor-pointer transition-all ${dragging ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
            >
              <div className="w-14 h-14 flex items-center justify-center rounded-full bg-emerald-50">
                <i className="ri-file-excel-2-line text-3xl text-emerald-500" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">Arrastra tu archivo aquí</p>
                <p className="text-xs text-slate-400 mt-1">o haz clic para seleccionar · .xlsx / .xls / .csv</p>
              </div>
              <ColsHint />
            </div>
          )}

          {/* STEP: preview */}
          {step === 'preview' && result && (
            <div className="space-y-4">
              {/* File name */}
              {fileName && (
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg">
                  <div className="w-5 h-5 flex items-center justify-center text-emerald-500">
                    <i className="ri-file-excel-2-line" />
                  </div>
                  <span className="text-sm text-slate-600 truncate flex-1">{fileName}</span>
                </div>
              )}

              {/* Structure errors */}
              {result.errors.length > 0 && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <i className="ri-error-warning-line text-rose-500" />
                    <span className="text-sm font-semibold text-rose-700">Error en la estructura del archivo</span>
                  </div>
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-rose-600 pl-6">{e}</p>
                  ))}
                </div>
              )}

              {/* Stats */}
              {result.errors.length === 0 && (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <StatCard value={result.totalRows} label="Filas leídas" color="bg-slate-50 border-slate-200" textColor="text-slate-700" />
                    <StatCard value={result.validRows} label="Filas válidas" color="bg-emerald-50 border-emerald-100" textColor="text-emerald-700" />
                    <StatCard value={result.errorRows} label="Con errores" color={result.errorRows > 0 ? 'bg-rose-50 border-rose-100' : 'bg-slate-50 border-slate-200'} textColor={result.errorRows > 0 ? 'text-rose-700' : 'text-slate-400'} />
                  </div>

                  {/* Row errors detail */}
                  {result.errorRows > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 max-h-32 overflow-y-auto">
                      <p className="text-xs font-semibold text-amber-700 mb-2">Filas con errores (no se importarán):</p>
                      {result.rows.filter(r => r.errors.length > 0).map(r => (
                        <p key={r.rowIndex} className="text-xs text-amber-600">
                          Fila {r.rowIndex}: {r.errors.join(', ')}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Preview table */}
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-2">
                      Vista previa (primeras {Math.min(5, result.rows.filter(r => r.errors.length === 0).length)} filas válidas)
                    </p>
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full text-xs" style={{ minWidth: 700 }}>
                        <thead className="bg-slate-50">
                          <tr>
                            {['Depto', 'Puesto', 'Jefe', 'Sección', 'Área', 'Dist', 'Emp.Lab', 'Silo', 'Tipo'].map(h => (
                              <th key={h} className="px-2 py-2 text-left border-b border-slate-200 text-slate-500 font-semibold whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.rows.filter(r => r.errors.length === 0).slice(0, 5).map((r, i) => (
                            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                              <td className="px-2 py-1.5 border-b border-slate-100 text-slate-600 max-w-[80px] truncate" title={r.departamento}>{r.departamento}</td>
                              <td className="px-2 py-1.5 border-b border-slate-100 text-slate-600 max-w-[100px] truncate" title={r.puesto_descripcion}>{r.puesto_descripcion}</td>
                              <td className="px-2 py-1.5 border-b border-slate-100 text-slate-600 max-w-[100px] truncate" title={r.jefe_inmediato}>{r.jefe_inmediato}</td>
                              <td className="px-2 py-1.5 border-b border-slate-100 text-slate-600">{r.seccion}</td>
                              <td className="px-2 py-1.5 border-b border-slate-100 text-slate-600">{r.area}</td>
                              <td className="px-2 py-1.5 border-b border-slate-100 text-slate-600 tabular-nums">{r.dist.toFixed(2)}</td>
                              <td className="px-2 py-1.5 border-b border-slate-100 text-slate-600">{r.empresa_lab}</td>
                              <td className="px-2 py-1.5 border-b border-slate-100 text-slate-600">{r.silo}</td>
                              <td className="px-2 py-1.5 border-b border-slate-100 text-slate-600">{r.tipo}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Clear previous toggle */}
                  <label className="flex items-start gap-3 cursor-pointer px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <input
                      type="checkbox"
                      checked={clearPrev}
                      onChange={e => setClearPrev(e.target.checked)}
                      className="mt-0.5 cursor-pointer"
                    />
                    <div>
                      <p className="text-xs font-semibold text-amber-800">Limpiar registros anteriores antes de importar</p>
                      <p className="text-xs text-amber-600 mt-0.5">Si está activo, se eliminarán todos los empleados existentes. Si no, se agregan a los actuales.</p>
                    </div>
                  </label>
                </>
              )}

              {uploadError && (
                <p className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{uploadError}</p>
              )}
            </div>
          )}

          {/* STEP: uploading */}
          {step === 'uploading' && (
            <div className="flex flex-col items-center gap-4 py-12">
              <div className="w-12 h-12 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-600">Guardando empleados...</p>
              <p className="text-xs text-slate-400">Esto puede tomar unos segundos</p>
            </div>
          )}

          {/* STEP: done */}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-4 py-12">
              <div className="w-14 h-14 flex items-center justify-center rounded-full bg-emerald-100">
                <i className="ri-check-line text-3xl text-emerald-600" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-800">¡Importación completada!</p>
                <p className="text-xs text-slate-400 mt-1">
                  Se importaron <strong>{uploadedCount}</strong> empleados correctamente.
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Los datos de distribución ya están disponibles en Fórmulas Personalizadas.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3 flex-shrink-0">
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileInput} />

          {step === 'select' && (
            <>
              <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer whitespace-nowrap">Cancelar</button>
              <button onClick={() => inputRef.current?.click()} className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap">
                Seleccionar archivo
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <button
                onClick={() => { setResult(null); setFileName(''); setUploadError(''); setStep('select'); }}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer whitespace-nowrap"
              >
                Cambiar archivo
              </button>
              <button
                disabled={!result || result.errors.length > 0 || result.validRows === 0}
                onClick={handleUpload}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap"
              >
                Confirmar importación ({result?.validRows ?? 0} filas)
              </button>
            </>
          )}

          {step === 'done' && (
            <button
              onClick={() => { onSuccess(); onClose(); }}
              className="ml-auto px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg cursor-pointer whitespace-nowrap"
            >
              Ver empleados
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ColsHint() {
  return (
    <div className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500">
      <p className="font-semibold text-slate-600 mb-1">Columnas esperadas en el archivo:</p>
      <div className="grid grid-cols-3 gap-x-4 gap-y-0.5">
        {['Departamento', 'Puesto Descripción', 'Jefe Inmediato', 'Sección', 'Área', 'Dist', 'Empresa Lab', 'Silo', 'Tipo'].map(c => (
          <span key={c}>• {c}</span>
        ))}
      </div>
    </div>
  );
}

interface StatCardProps { value: number; label: string; color: string; textColor: string; }
function StatCard({ value, label, color, textColor }: StatCardProps) {
  return (
    <div className={`border rounded-lg p-3 text-center ${color}`}>
      <p className={`text-2xl font-bold ${textColor}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}
