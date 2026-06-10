import { useState, useRef, useCallback, DragEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { parseCrossdockingMasivoExcel } from '@/lib/crossdockingMasivoExcelParser';
import type { MasivoParseResult } from '@/lib/crossdockingMasivoExcelParser';

interface ExcelUploadModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

type Step = 'select' | 'preview' | 'uploading' | 'done';

export default function CrossdockingExcelUploadModal({ onClose, onSuccess }: ExcelUploadModalProps) {
  const [step, setStep] = useState<Step>('select');
  const [dragging, setDragging] = useState(false);
  const [parsed, setParsed] = useState<MasivoParseResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [uploadError, setUploadError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setParsed({ headers: [], batches: [], totalRows: 0, previewRows: [], errors: ['Solo se aceptan archivos .xlsx o .xls'] });
      setFileName(file.name);
      setStep('preview');
      return;
    }
    setFileName(file.name);
    const buffer = await file.arrayBuffer();
    const result = parseCrossdockingMasivoExcel(buffer);
    setParsed(result);
    setStep('preview');
  }, []);

  const handleDrop = useCallback(async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) await processFile(file);
  }, [processFile]);

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processFile(file);
  };

  const handleUpload = async () => {
    if (!parsed || parsed.errors.length > 0 || parsed.totalRows === 0) return;
    setStep('uploading');
    setUploadError('');
    try {
      let totalInsertados = 0;
      for (let i = 0; i < parsed.batches.length; i++) {
        const batch = parsed.batches[i];
        const { error } = await supabase.from('costos_crossdocking_raw').insert(
          batch.map(rawData => ({ raw_data: rawData }))
        );
        if (error) throw new Error(`Error en lote ${i + 1} de ${parsed.batches.length}: ${error.message}`);
        totalInsertados += batch.length;
      }
      setStep('done');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Error desconocido al subir datos.');
      setStep('preview');
    }
  };

  const hasErrors = (parsed?.errors.length ?? 0) > 0 || (parsed?.totalRows ?? 0) === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Cargar datos masivos</h2>
            <p className="text-xs text-slate-400 mt-0.5">Carga el archivo Excel tal cual, todas las columnas. Sin límite de filas.</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex-1">
          {step === 'select' && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-all ${dragging ? 'border-teal-400 bg-teal-50' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
            >
              <div className="w-14 h-14 flex items-center justify-center rounded-full bg-teal-50">
                <i className="ri-database-2-line text-3xl text-teal-500" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">Arrastra tu archivo Excel aquí</p>
                <p className="text-xs text-slate-400 mt-1">o haz clic para seleccionar · .xlsx / .xls</p>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              {fileName && (
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg">
                  <div className="w-5 h-5 flex items-center justify-center text-teal-500"><i className="ri-file-excel-2-line" /></div>
                  <span className="text-sm text-slate-600 truncate">{fileName}</span>
                </div>
              )}
              {hasErrors && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 space-y-1">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 flex items-center justify-center text-rose-500"><i className="ri-error-warning-line" /></div>
                    <span className="text-sm font-semibold text-rose-700">Errores detectados</span>
                  </div>
                  {parsed?.errors.map((e, i) => <p key={i} className="text-xs text-rose-600 pl-7">{e}</p>)}
                  {parsed?.totalRows === 0 && <p className="text-xs text-rose-600 pl-7">No se encontraron filas de datos válidas.</p>}
                </div>
              )}
              {!hasErrors && parsed && (
                <div className="space-y-3">
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-slate-700">{parsed.totalRows.toLocaleString('es-CO')}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Filas válidas</p>
                    </div>
                    <div className="bg-teal-50 border border-teal-100 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-teal-700">{parsed.headers.length}</p>
                      <p className="text-xs text-teal-600 mt-0.5">Columnas</p>
                    </div>
                    <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-amber-700">{parsed.batches.length}</p>
                      <p className="text-xs text-amber-600 mt-0.5">Lotes (×1000)</p>
                    </div>
                    <div className={`border rounded-lg p-3 text-center ${parsed.excludedRows > 0 ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-200'}`}>
                      <p className={`text-xl font-bold ${parsed.excludedRows > 0 ? 'text-orange-600' : 'text-slate-400'}`}>{parsed.excludedRows.toLocaleString('es-CO')}</p>
                      <p className={`text-xs mt-0.5 ${parsed.excludedRows > 0 ? 'text-orange-500' : 'text-slate-400'}`}>Excluidas</p>
                    </div>
                  </div>
                  {parsed.excludedRows > 0 && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 flex items-start gap-3">
                      <div className="w-5 h-5 flex items-center justify-center text-orange-500 mt-0.5 flex-shrink-0"><i className="ri-filter-off-line" /></div>
                      <div>
                        <p className="text-xs text-orange-700"><strong>{parsed.excludedRows.toLocaleString('es-CO')} filas excluidas</strong> por regla del sistema.</p>
                        <p className="text-xs text-orange-600 mt-1">Códigos omitidos: {parsed.excludedCodes.join(', ')}</p>
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1.5">Columnas detectadas ({parsed.headers.length})</p>
                    <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                      {parsed.headers.map(h => <span key={h} className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full whitespace-nowrap">{h}</span>)}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1.5">Vista previa — {parsed.previewRows.length} de {parsed.totalRows.toLocaleString('es-CO')} filas</p>
                    <div className="border border-slate-200 rounded-lg overflow-auto max-h-[320px]">
                      <table className="text-xs whitespace-nowrap">
                        <thead>
                          <tr className="bg-slate-100 sticky top-0">
                            <th className="px-3 py-2 text-left text-slate-500 font-medium border-r border-slate-200">#</th>
                            {parsed.headers.map(h => <th key={h} className="px-3 py-2 text-left text-slate-500 font-medium border-r border-slate-200 max-w-[180px] overflow-hidden text-ellipsis">{h}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {parsed.previewRows.map((row, i) => (
                            <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                              <td className="px-3 py-1.5 text-slate-400 border-r border-slate-100 text-center">{i + 1}</td>
                              {parsed.headers.map(h => (
                                <td key={h} className="px-3 py-1.5 text-slate-600 border-r border-slate-100 max-w-[180px] overflow-hidden text-ellipsis">{row[h] !== null && row[h] !== undefined ? String(row[h]) : '—'}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-3">
                    <div className="w-5 h-5 flex items-center justify-center text-amber-500 mt-0.5 flex-shrink-0"><i className="ri-alert-line" /></div>
                    <p className="text-xs text-amber-700"><strong>Importante:</strong> Esta carga <strong>reemplazará todos los datos masivos anteriores</strong> de Crossdocking. Se subirán {parsed.batches.length} lotes de hasta 1.000 filas cada uno.</p>
                  </div>
                </div>
              )}
              {uploadError && <p className="text-xs text-rose-600 bg-rose-50 px-3 py-2 rounded-lg">{uploadError}</p>}
            </div>
          )}

          {step === 'uploading' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-12 h-12 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-600">Guardando datos...</p>
              <p className="text-xs text-slate-400">Subiendo {parsed?.batches.length ?? 0} lotes de hasta 1.000 filas cada uno</p>
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="w-14 h-14 flex items-center justify-center rounded-full bg-teal-100">
                <i className="ri-check-line text-3xl text-teal-600" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-slate-800">Datos cargados correctamente!</p>
                <p className="text-xs text-slate-400 mt-1">{parsed?.totalRows.toLocaleString('es-CO') ?? 0} filas guardadas. Los datos masivos ya están disponibles.</p>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between gap-3 flex-shrink-0">
          <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileInput} />
          {step === 'select' && (
            <>
              <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap">Cancelar</button>
              <button onClick={() => inputRef.current?.click()} className="px-5 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap">Seleccionar archivo</button>
            </>
          )}
          {step === 'preview' && (
            <>
              <button onClick={() => { setParsed(null); setFileName(''); setUploadError(''); setStep('select'); }} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap">Cambiar archivo</button>
              <button disabled={hasErrors} onClick={handleUpload} className="px-5 py-2 bg-teal-500 hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap">Confirmar y subir</button>
            </>
          )}
          {step === 'done' && (
            <button onClick={() => { onSuccess(); onClose(); }} className="ml-auto px-5 py-2 bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer whitespace-nowrap">Ver datos</button>
          )}
        </div>
      </div>
    </div>
  );
}